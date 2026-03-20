/**
 * Adjustments module — standalone manual adjustment CRUD.
 * Adjustments modify a participant's payout outside of the main calculation run.
 * Each adjustment is immutable after creation; to reverse, create a negative adjustment.
 */

import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { adjustments, payouts } from '../../../apps/api/src/db/schema'
import { AuditService, type AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { createEvent } from '../../../packages/events/src/domain-events'
import { randomUUID } from 'node:crypto'

export const CreateAdjustmentSchema = z.object({
  payoutId: z.string().uuid(),
  participantId: z.string().uuid(),
  periodId: z.string().uuid(),
  amountCents: z.number().int(),      // positive = increase, negative = clawback
  currency: z.string().length(3).default('USD'),
  reason: z.string().min(1).max(1000),
  category: z.enum(['correction', 'clawback', 'bonus', 'other']).default('correction'),
})

export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>

export interface AdjustmentRecord {
  id: string
  tenantId: string
  payoutId: string
  participantId: string
  periodId: string
  amountCents: number
  currency: string
  reason: string
  category: string
  createdById: string
  createdAt: string
}

export class AdjustmentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'AdjustmentError'
  }
}

export class AdjustmentsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async create(
    tenantId: string,
    input: CreateAdjustmentInput,
    ctx: AuditContext,
  ): Promise<AdjustmentRecord> {
    const data = CreateAdjustmentSchema.parse(input)

    // Verify payout exists in this tenant
    const [payout] = await this.db
      .select({ id: payouts.id, adjustedAmountCents: payouts.adjustedAmountCents })
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.id, data.payoutId)))
      .limit(1)

    if (!payout) {
      throw new AdjustmentError('PAYOUT_NOT_FOUND', `Payout ${data.payoutId} not found`)
    }

    const id = randomUUID()
    const now = new Date().toISOString()

    const [created] = await this.db
      .insert(adjustments)
      .values({
        id,
        tenantId,
        payoutId: data.payoutId,
        participantId: data.participantId,
        periodId: data.periodId,
        amountCents: data.amountCents,
        currency: data.currency,
        reason: data.reason,
        category: data.category,
        createdById: ctx.actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    // Apply adjustment to payout
    await this.db
      .update(payouts)
      .set({
        adjustedAmountCents: payout.adjustedAmountCents + data.amountCents,
        updatedAt: new Date(),
      })
      .where(eq(payouts.id, data.payoutId))

    await eventBus.publish(
      createEvent('adjustment.applied', tenantId, {
        adjustmentId: id,
        payoutId: data.payoutId,
        participantId: data.participantId,
        amountCents: data.amountCents,
        category: data.category,
      }),
    )

    await this.audit.recordSafe({
      ctx,
      entityType: 'adjustment',
      entityId: id,
      action: 'created',
      after: { ...data, tenantId },
    })

    return {
      id,
      tenantId,
      payoutId: created.payoutId,
      participantId: created.participantId,
      periodId: created.periodId,
      amountCents: created.amountCents,
      currency: created.currency,
      reason: created.reason,
      category: created.category,
      createdById: created.createdById ?? ctx.actorId,
      createdAt: now,
    }
  }

  async list(
    tenantId: string,
    filters?: { payoutId?: string; participantId?: string },
  ): Promise<AdjustmentRecord[]> {
    const conditions = [eq(adjustments.tenantId, tenantId)]
    if (filters?.payoutId) conditions.push(eq(adjustments.payoutId, filters.payoutId))
    if (filters?.participantId) conditions.push(eq(adjustments.participantId, filters.participantId))

    const rows = await this.db
      .select()
      .from(adjustments)
      .where(and(...conditions))
      .orderBy(desc(adjustments.createdAt))

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      payoutId: r.payoutId,
      participantId: r.participantId,
      periodId: r.periodId,
      amountCents: r.amountCents,
      currency: r.currency,
      reason: r.reason,
      category: r.category,
      createdById: r.createdById ?? '',
      createdAt: r.createdAt.toISOString(),
    }))
  }

  async get(tenantId: string, id: string): Promise<AdjustmentRecord | null> {
    const [row] = await this.db
      .select()
      .from(adjustments)
      .where(and(eq(adjustments.tenantId, tenantId), eq(adjustments.id, id)))
      .limit(1)

    if (!row) return null

    return {
      id: row.id,
      tenantId: row.tenantId,
      payoutId: row.payoutId,
      participantId: row.participantId,
      periodId: row.periodId,
      amountCents: row.amountCents,
      currency: row.currency,
      reason: row.reason,
      category: row.category,
      createdById: row.createdById ?? '',
      createdAt: row.createdAt.toISOString(),
    }
  }
}
