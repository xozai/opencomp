import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { payouts, participants, periods, planVersions } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { createEvent } from '../../../packages/events/src/domain-events'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatementSummary {
  participantId: string
  participantName: string
  periodId: string
  periodName: string
  calculationRunId: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  status: string
  lineItems: unknown[]
  generatedAt: string
}

export const GenerateStatementsSchema = z.object({
  calculationRunId: z.string().uuid(),
  periodId: z.string().uuid(),
})
export type GenerateStatementsInput = z.infer<typeof GenerateStatementsSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class StatementsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  /**
   * Generate statements for all payouts in a calculation run.
   * A "statement" in this phase is a structured summary built from the payout
   * record. PDF generation is handled by the platform-files + template plugin.
   */
  async generateForRun(
    tenantId: string,
    input: GenerateStatementsInput,
    ctx: AuditContext,
  ): Promise<StatementSummary[]> {
    const data = GenerateStatementsSchema.parse(input)

    const runPayouts = await this.db
      .select()
      .from(payouts)
      .where(
        and(
          eq(payouts.tenantId, tenantId),
          eq(payouts.calculationRunId, data.calculationRunId),
        ),
      )

    if (runPayouts.length === 0) {
      throw new StatementError('NO_PAYOUTS', 'No payouts found for this calculation run')
    }

    // Load participant names
    const participantIds = [...new Set(runPayouts.map((p) => p.participantId))]
    const participantRows = await this.db
      .select({ id: participants.id, firstName: participants.firstName, lastName: participants.lastName })
      .from(participants)
      .where(eq(participants.tenantId, tenantId))

    const participantMap = new Map(
      participantRows.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
    )

    // Load period name
    const [period] = await this.db
      .select({ id: periods.id, name: periods.name })
      .from(periods)
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, data.periodId)))
      .limit(1)

    const periodName = period?.name ?? data.periodId

    const statements: StatementSummary[] = runPayouts.map((payout) => ({
      participantId: payout.participantId,
      participantName: participantMap.get(payout.participantId) ?? payout.participantId,
      periodId: payout.periodId,
      periodName,
      calculationRunId: payout.calculationRunId,
      grossAmountCents: payout.grossAmountCents,
      adjustedAmountCents: payout.adjustedAmountCents,
      currency: payout.currency,
      status: payout.status,
      lineItems: (payout.lineItems as unknown[]) ?? [],
      generatedAt: new Date().toISOString(),
    }))

    // Emit statement.generated event for each participant
    for (const stmt of statements) {
      await eventBus.publish(
        createEvent('statement.generated', tenantId, {
          participantId: stmt.participantId,
          periodId: stmt.periodId,
          calculationRunId: stmt.calculationRunId,
          adjustedAmountCents: stmt.adjustedAmountCents,
        }),
      )
    }

    await this.audit.recordSafe({
      ctx,
      entityType: 'statement_batch',
      entityId: data.calculationRunId,
      action: 'generated',
      after: { count: statements.length, periodId: data.periodId },
    })

    return statements
  }

  /** Get a single participant's statement for a period. */
  async getParticipantStatement(
    tenantId: string,
    participantId: string,
    periodId: string,
  ): Promise<StatementSummary | null> {
    const [payout] = await this.db
      .select()
      .from(payouts)
      .where(
        and(
          eq(payouts.tenantId, tenantId),
          eq(payouts.participantId, participantId),
          eq(payouts.periodId, periodId),
        ),
      )
      .limit(1)

    if (!payout) return null

    const [participant] = await this.db
      .select({ firstName: participants.firstName, lastName: participants.lastName })
      .from(participants)
      .where(and(eq(participants.tenantId, tenantId), eq(participants.id, participantId)))
      .limit(1)

    const [period] = await this.db
      .select({ name: periods.name })
      .from(periods)
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, periodId)))
      .limit(1)

    return {
      participantId,
      participantName: participant ? `${participant.firstName} ${participant.lastName}` : participantId,
      periodId,
      periodName: period?.name ?? periodId,
      calculationRunId: payout.calculationRunId,
      grossAmountCents: payout.grossAmountCents,
      adjustedAmountCents: payout.adjustedAmountCents,
      currency: payout.currency,
      status: payout.status,
      lineItems: (payout.lineItems as unknown[]) ?? [],
      generatedAt: new Date().toISOString(),
    }
  }
}

export class StatementError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'StatementError'
  }
}
