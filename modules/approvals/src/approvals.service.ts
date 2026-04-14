import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { approvalRequests } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { APPROVAL_DECIDED, createEvent } from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateApprovalRequestSchema = z.object({
  workflowType: z.enum(['plan_approval', 'dispute_resolution', 'adjustment_approval']),
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().optional(),
})
export type CreateApprovalRequestInput = z.infer<typeof CreateApprovalRequestSchema>

export const DecideApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'escalated']),
  notes: z.string().optional(),
})
export type DecideApprovalInput = z.infer<typeof DecideApprovalSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class ApprovalsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async list(
    tenantId: string,
    filters: { status?: string; workflowType?: string; assignedToId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.tenantId, tenantId))

    return all.filter((r) => {
      if (filters.status && r.status !== filters.status) return false
      if (filters.workflowType && r.workflowType !== filters.workflowType) return false
      if (filters.assignedToId && r.assignedToId !== filters.assignedToId) return false
      return true
    })
  }

  async get(tenantId: string, requestId: string) {
    const [req] = await this.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.id, requestId)))
      .limit(1)

    if (!req) throw new ApprovalError('NOT_FOUND', 'Approval request not found')
    return req
  }

  async create(tenantId: string, input: CreateApprovalRequestInput, requestedById: string, ctx: AuditContext) {
    const data = CreateApprovalRequestSchema.parse(input)

    const [request] = await this.db
      .insert(approvalRequests)
      .values({
        tenantId,
        workflowType: data.workflowType,
        entityType: data.entityType,
        entityId: data.entityId,
        requestedById,
        assignedToId: data.assignedToId ?? null,
        status: 'pending',
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        notes: data.notes ?? null,
      })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'approval_request',
      entityId: request!.id,
      action: 'created',
      after: { workflowType: request!.workflowType, entityId: request!.entityId },
    })

    return request
  }

  async assign(tenantId: string, requestId: string, assignedToId: string, ctx: AuditContext) {
    const existing = await this.get(tenantId, requestId)
    if (existing.status !== 'pending') {
      throw new ApprovalError('INVALID_STATUS', 'Only pending requests can be reassigned')
    }

    const [updated] = await this.db
      .update(approvalRequests)
      .set({ assignedToId, updatedAt: new Date() })
      .where(eq(approvalRequests.id, requestId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'approval_request',
      entityId: requestId,
      action: 'assigned',
      after: { assignedToId },
    })

    return updated
  }

  async decide(
    tenantId: string,
    requestId: string,
    input: DecideApprovalInput,
    decidedById: string,
    ctx: AuditContext,
  ) {
    const data = DecideApprovalSchema.parse(input)
    const existing = await this.get(tenantId, requestId)

    if (!['pending', 'escalated'].includes(existing.status)) {
      throw new ApprovalError('INVALID_STATUS', 'Request has already been decided')
    }

    const newStatus =
      data.decision === 'approved' ? 'approved'
      : data.decision === 'rejected' ? 'rejected'
      : 'escalated'

    const [updated] = await this.db
      .update(approvalRequests)
      .set({
        status: newStatus,
        decidedAt: new Date(),
        decidedById,
        notes: data.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(approvalRequests.id, requestId))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'approval_request',
      entityId: requestId,
      action: `decision_${data.decision}`,
      before: { status: existing.status },
      after: { status: newStatus, decidedById },
    })

    await eventBus.publish(
      createEvent(APPROVAL_DECIDED, tenantId, {
        approvalRequestId: requestId,
        decision: data.decision,
        decidedById,
      }),
    )

    return updated
  }
}

export class ApprovalError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ApprovalError'
  }
}
