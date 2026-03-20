import type { Db } from '../../../apps/api/src/db/client'
import { auditEvents } from '../../../apps/api/src/db/schema'

export interface AuditContext {
  tenantId: string
  actorId?: string
  actorType?: 'user' | 'system' | 'plugin'
}

export interface RecordAuditEventInput {
  ctx: AuditContext
  entityType: string
  entityId: string
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export class AuditService {
  constructor(private db: Db) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      tenantId: input.ctx.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.ctx.actorId ?? null,
      actorType: input.ctx.actorType ?? 'system',
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? {},
      occurredAt: new Date(),
    })
  }

  /** Convenience: fire-and-forget audit recording that never throws. */
  async recordSafe(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.record(input)
    } catch (err) {
      // Audit failures must not break the main flow — log and continue.
      console.error('[audit] Failed to record audit event:', err)
    }
  }
}
