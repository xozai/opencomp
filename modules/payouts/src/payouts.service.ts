import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import { payouts } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'

export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'cancelled'

export interface UpdatePayoutStatusInput {
  status: PayoutStatus
  paidAt?: Date
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PayoutsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listForRun(tenantId: string, calculationRunId: string) {
    return this.db
      .select()
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.calculationRunId, calculationRunId)))
  }

  async listForParticipant(tenantId: string, participantId: string, periodId?: string) {
    const all = await this.db
      .select()
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.participantId, participantId)))

    return periodId ? all.filter((p) => p.periodId === periodId) : all
  }

  async get(tenantId: string, payoutId: string) {
    const [payout] = await this.db
      .select()
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.id, payoutId)))
      .limit(1)

    if (!payout) throw new PayoutError('NOT_FOUND', 'Payout not found')
    return payout
  }

  async updateStatus(tenantId: string, payoutId: string, input: UpdatePayoutStatusInput, ctx: AuditContext) {
    const existing = await this.get(tenantId, payoutId)

    const [updated] = await this.db
      .update(payouts)
      .set({
        status: input.status,
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(payouts.id, payoutId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'payout',
      entityId: payoutId,
      action: `status_changed_to_${input.status}`,
      before: { status: existing.status },
      after: { status: input.status },
    })

    return updated
  }

  /** Approve all pending payouts for a calculation run. */
  async approveRun(tenantId: string, calculationRunId: string, ctx: AuditContext) {
    const pending = await this.listForRun(tenantId, calculationRunId)
    const toApprove = pending.filter((p) => p.status === 'pending')

    const results = await Promise.all(
      toApprove.map((p) => this.updateStatus(tenantId, p.id, { status: 'approved' }, ctx)),
    )

    return { approved: results.length, skipped: pending.length - toApprove.length }
  }

  /** Mark approved payouts as paid (e.g. after payroll export). */
  async markPaid(tenantId: string, payoutIds: string[], ctx: AuditContext) {
    const paidAt = new Date()
    const results = await Promise.all(
      payoutIds.map((id) => this.updateStatus(tenantId, id, { status: 'paid', paidAt }, ctx)),
    )
    return { paid: results.length }
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PayoutError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PayoutError'
  }
}
