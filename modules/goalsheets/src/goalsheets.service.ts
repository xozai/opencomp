import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { goalSheets, participants } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { GOAL_SHEET_DISTRIBUTED, GOAL_SHEET_ACKNOWLEDGED, createEvent } from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const GenerateGoalSheetsSchema = z.object({
  planVersionId: z.string().uuid(),
  periodId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).optional(),
})
export type GenerateGoalSheetsInput = z.infer<typeof GenerateGoalSheetsSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class GoalSheetsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listGoalSheets(
    tenantId: string,
    filters: { periodId?: string; participantId?: string; status?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(goalSheets)
      .where(eq(goalSheets.tenantId, tenantId))

    return all.filter((gs) => {
      if (filters.periodId && gs.periodId !== filters.periodId) return false
      if (filters.participantId && gs.participantId !== filters.participantId) return false
      if (filters.status && gs.status !== filters.status) return false
      return true
    })
  }

  async getGoalSheet(tenantId: string, goalSheetId: string) {
    const [gs] = await this.db
      .select()
      .from(goalSheets)
      .where(and(eq(goalSheets.tenantId, tenantId), eq(goalSheets.id, goalSheetId)))
      .limit(1)

    if (!gs) throw new GoalSheetError('NOT_FOUND', 'Goal sheet not found')
    return gs
  }

  /** Generate goal sheet records for participants in a plan version + period. */
  async generate(tenantId: string, input: GenerateGoalSheetsInput, ctx: AuditContext) {
    const data = GenerateGoalSheetsSchema.parse(input)

    // Resolve participant list
    let participantList: { id: string }[]
    if (data.participantIds?.length) {
      participantList = data.participantIds.map((id) => ({ id }))
    } else {
      participantList = await this.db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.tenantId, tenantId), eq(participants.status, 'active')))
    }

    const created = []
    for (const participant of participantList) {
      // Idempotent — skip if already exists
      const [existing] = await this.db
        .select({ id: goalSheets.id })
        .from(goalSheets)
        .where(
          and(
            eq(goalSheets.tenantId, tenantId),
            eq(goalSheets.participantId, participant.id),
            eq(goalSheets.planVersionId, data.planVersionId),
            eq(goalSheets.periodId, data.periodId),
          ),
        )
        .limit(1)

      if (existing) continue

      const [gs] = await this.db
        .insert(goalSheets)
        .values({
          tenantId,
          participantId: participant.id,
          planVersionId: data.planVersionId,
          periodId: data.periodId,
          status: 'draft',
          data: {},
        })
        .returning()

      await this.audit.recordSafe({
        ctx,
        entityType: 'goalsheet',
        entityId: gs!.id,
        action: 'generated',
        ...(gs !== undefined ? { after: gs as Record<string, unknown> } : {}),
      })

      if (gs) created.push(gs)
    }

    return { generated: created.length, skipped: participantList.length - created.length }
  }

  /** Distribute goal sheets — transitions draft → distributed and fires events. */
  async distribute(tenantId: string, goalSheetIds: string[], ctx: AuditContext) {
    const results = []

    for (const id of goalSheetIds) {
      const gs = await this.getGoalSheet(tenantId, id)
      if (gs.status !== 'draft') continue

      const [updated] = await this.db
        .update(goalSheets)
        .set({ status: 'distributed', distributedAt: new Date(), updatedAt: new Date() })
        .where(eq(goalSheets.id, id))
        .returning()

      await this.audit.recordSafe({
        ctx,
        entityType: 'goalsheet',
        entityId: id,
        action: 'distributed',
        before: { status: 'draft' },
        after: { status: 'distributed' },
      })

      await eventBus.publish(
        createEvent(GOAL_SHEET_DISTRIBUTED, tenantId, {
          goalSheetId: id,
          participantId: updated!.participantId,
          planVersionId: updated!.planVersionId,
          periodId: updated!.periodId,
        }),
      )

      results.push(updated)
    }

    return results
  }

  /** Acknowledge a goal sheet — rep confirms they have read and accepted it. */
  async acknowledge(tenantId: string, goalSheetId: string, acknowledgedById: string, ctx: AuditContext) {
    const gs = await this.getGoalSheet(tenantId, goalSheetId)

    if (gs.status !== 'distributed') {
      throw new GoalSheetError('INVALID_STATUS', 'Goal sheet must be distributed before it can be acknowledged')
    }

    const [updated] = await this.db
      .update(goalSheets)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedById,
        updatedAt: new Date(),
      })
      .where(eq(goalSheets.id, goalSheetId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'goalsheet',
      entityId: goalSheetId,
      action: 'acknowledged',
      before: { status: 'distributed' },
      after: { status: 'acknowledged', acknowledgedById },
    })

    await eventBus.publish(
      createEvent(GOAL_SHEET_ACKNOWLEDGED, tenantId, {
        goalSheetId,
        participantId: updated!.participantId,
        acknowledgedById,
      }),
    )

    return updated
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class GoalSheetError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'GoalSheetError'
  }
}
