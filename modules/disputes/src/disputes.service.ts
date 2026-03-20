import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { disputes, adjustments, payouts, approvalRequests } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import {
  DISPUTE_OPENED,
  DISPUTE_RESOLVED,
  APPROVAL_REQUESTED,
  createEvent,
} from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const OpenDisputeSchema = z.object({
  payoutId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  participantId: z.string().uuid(),
  subject: z.string().min(1).max(500),
  description: z.string().min(1),
  requestedAmountCents: z.number().int().optional(),
  requestedCurrency: z.string().length(3).optional(),
})
export type OpenDisputeInput = z.infer<typeof OpenDisputeSchema>

export const ResolveDisputeSchema = z.object({
  resolution: z.enum(['approved', 'denied']),
  resolvedAmountCents: z.number().int().optional(),
  resolvedCurrency: z.string().length(3).optional(),
  resolutionNotes: z.string().optional(),
})
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class DisputesService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listDisputes(
    tenantId: string,
    filters: { status?: string; participantId?: string; assignedToId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(disputes)
      .where(eq(disputes.tenantId, tenantId))

    return all.filter((d) => {
      if (filters.status && d.status !== filters.status) return false
      if (filters.participantId && d.participantId !== filters.participantId) return false
      if (filters.assignedToId && d.assignedToId !== filters.assignedToId) return false
      return true
    })
  }

  async getDispute(tenantId: string, disputeId: string) {
    const [dispute] = await this.db
      .select()
      .from(disputes)
      .where(and(eq(disputes.tenantId, tenantId), eq(disputes.id, disputeId)))
      .limit(1)

    if (!dispute) throw new DisputeError('NOT_FOUND', 'Dispute not found')
    return dispute
  }

  async openDispute(tenantId: string, input: OpenDisputeInput, openedById: string, ctx: AuditContext) {
    const data = OpenDisputeSchema.parse(input)

    const [dispute] = await this.db
      .insert(disputes)
      .values({
        tenantId,
        payoutId: data.payoutId ?? null,
        transactionId: data.transactionId ?? null,
        participantId: data.participantId,
        openedById,
        status: 'open',
        subject: data.subject,
        description: data.description,
        requestedAmountCents: data.requestedAmountCents ?? null,
        requestedCurrency: data.requestedCurrency ?? null,
      })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'dispute',
      entityId: dispute.id,
      action: 'opened',
      after: { subject: dispute.subject, participantId: dispute.participantId },
    })

    await eventBus.publish(
      createEvent(DISPUTE_OPENED, tenantId, {
        disputeId: dispute.id,
        participantId: dispute.participantId,
        openedById,
      }),
    )

    // Auto-request approval for the resolution
    const [approvalRequest] = await this.db
      .insert(approvalRequests)
      .values({
        tenantId,
        workflowType: 'dispute_resolution',
        entityType: 'dispute',
        entityId: dispute.id,
        requestedById: openedById,
        status: 'pending',
      })
      .returning()

    await eventBus.publish(
      createEvent(APPROVAL_REQUESTED, tenantId, {
        approvalRequestId: approvalRequest.id,
        workflowType: 'dispute_resolution',
        entityType: 'dispute',
        entityId: dispute.id,
        requestedById: openedById,
      }),
    )

    return { dispute, approvalRequest }
  }

  async assignDispute(
    tenantId: string,
    disputeId: string,
    assignedToId: string,
    ctx: AuditContext,
  ) {
    await this.getDispute(tenantId, disputeId)

    const [updated] = await this.db
      .update(disputes)
      .set({ assignedToId, status: 'under_review', updatedAt: new Date() })
      .where(eq(disputes.id, disputeId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'dispute',
      entityId: disputeId,
      action: 'assigned',
      after: { assignedToId, status: 'under_review' },
    })

    return updated
  }

  async resolveDispute(
    tenantId: string,
    disputeId: string,
    input: ResolveDisputeInput,
    resolvedById: string,
    ctx: AuditContext,
  ) {
    const data = ResolveDisputeSchema.parse(input)
    const dispute = await this.getDispute(tenantId, disputeId)

    if (!['open', 'under_review', 'pending_approval'].includes(dispute.status)) {
      throw new DisputeError('INVALID_STATUS', 'Dispute cannot be resolved from its current status')
    }

    const newStatus = data.resolution === 'approved' ? 'resolved_approved' : 'resolved_denied'

    const [resolved] = await this.db
      .update(disputes)
      .set({
        status: newStatus,
        resolvedAmountCents: data.resolvedAmountCents ?? null,
        resolvedCurrency: data.resolvedCurrency ?? null,
        resolvedAt: new Date(),
        resolvedById,
        resolutionNotes: data.resolutionNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'dispute',
      entityId: disputeId,
      action: `resolved_${data.resolution}`,
      before: { status: dispute.status },
      after: { status: newStatus, resolvedAmountCents: data.resolvedAmountCents },
    })

    await eventBus.publish(
      createEvent(DISPUTE_RESOLVED, tenantId, {
        disputeId,
        resolution: data.resolution,
        resolvedById,
      }),
    )

    // If approved and amount provided, apply adjustment to payout
    if (data.resolution === 'approved' && dispute.payoutId && data.resolvedAmountCents) {
      await this.applyAdjustment(tenantId, dispute.payoutId, disputeId, data.resolvedAmountCents, data.resolvedCurrency ?? 'USD', resolvedById, ctx)
    }

    return resolved
  }

  private async applyAdjustment(
    tenantId: string,
    payoutId: string,
    disputeId: string,
    amountCents: number,
    currency: string,
    appliedById: string,
    ctx: AuditContext,
  ) {
    // Load current payout
    const [payout] = await this.db
      .select()
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.id, payoutId)))
      .limit(1)

    if (!payout) return

    // Write adjustment record
    const [adjustment] = await this.db
      .insert(adjustments)
      .values({
        tenantId,
        payoutId,
        disputeId,
        type: amountCents > 0 ? 'increase' : 'decrease',
        amountCents: Math.abs(amountCents),
        currency,
        reason: `Dispute ${disputeId} resolved — adjustment applied`,
        appliedById,
        appliedAt: new Date(),
      })
      .returning()

    // Update payout adjusted amount
    const newAdjustedAmount = payout.adjustedAmountCents + amountCents
    await this.db
      .update(payouts)
      .set({ adjustedAmountCents: newAdjustedAmount, status: 'adjusted', updatedAt: new Date() })
      .where(eq(payouts.id, payoutId))

    await this.audit.recordSafe({
      ctx,
      entityType: 'payout',
      entityId: payoutId,
      action: 'adjustment_applied',
      before: { adjustedAmountCents: payout.adjustedAmountCents },
      after: { adjustedAmountCents: newAdjustedAmount, adjustmentId: adjustment.id },
    })
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class DisputeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'DisputeError'
  }
}
