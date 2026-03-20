import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { quotas } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const UpsertQuotaSchema = z.object({
  participantId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  periodId: z.string().uuid(),
  type: z.enum(['revenue', 'units', 'activity', 'custom']).default('revenue'),
  /** Amount in cents */
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional(),
})
export type UpsertQuotaInput = z.infer<typeof UpsertQuotaSchema>

export const BulkUpsertQuotaSchema = z.array(UpsertQuotaSchema)

// ─── Service ──────────────────────────────────────────────────────────────────

export class QuotasService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listQuotas(tenantId: string, filters: { periodId?: string; participantId?: string } = {}) {
    let query = this.db.select().from(quotas).where(eq(quotas.tenantId, tenantId))

    // Drizzle doesn't compose `.where()` dynamically well in this style,
    // so we filter in-memory for simplicity. Use SQL `and()` for production filtering.
    const results = await query
    return results.filter((q) => {
      if (filters.periodId && q.periodId !== filters.periodId) return false
      if (filters.participantId && q.participantId !== filters.participantId) return false
      return true
    })
  }

  async upsertQuota(tenantId: string, input: UpsertQuotaInput, ctx: AuditContext) {
    const data = UpsertQuotaSchema.parse(input)

    // Check for existing quota
    const [existing] = await this.db
      .select()
      .from(quotas)
      .where(
        and(
          eq(quotas.tenantId, tenantId),
          eq(quotas.participantId, data.participantId),
          eq(quotas.planVersionId, data.planVersionId),
          eq(quotas.periodId, data.periodId),
        ),
      )
      .limit(1)

    if (existing) {
      const [updated] = await this.db
        .update(quotas)
        .set({ amount: data.amount, currency: data.currency, notes: data.notes ?? null, updatedAt: new Date() })
        .where(eq(quotas.id, existing.id))
        .returning()

      await this.audit.recordSafe({
        ctx,
        entityType: 'quota',
        entityId: existing.id,
        action: 'updated',
        before: { amount: existing.amount },
        after: { amount: data.amount },
      })

      return updated
    }

    const [created] = await this.db
      .insert(quotas)
      .values({ tenantId, ...data })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'quota',
      entityId: created.id,
      action: 'created',
      after: created,
    })

    return created
  }

  async bulkUpsert(tenantId: string, inputs: UpsertQuotaInput[], ctx: AuditContext) {
    const results = await Promise.all(inputs.map((input) => this.upsertQuota(tenantId, input, ctx)))
    return results
  }

  /** Compute attainment for a participant in a period across all quota types. */
  async computeAttainment(
    tenantId: string,
    participantId: string,
    periodId: string,
    creditedAmountCents: number,
  ): Promise<{ quotaAmountCents: number; attainmentPct: number }> {
    const participantQuotas = await this.listQuotas(tenantId, { periodId, participantId })
    const totalQuota = participantQuotas.reduce((sum, q) => sum + q.amount, 0)
    if (totalQuota === 0) return { quotaAmountCents: 0, attainmentPct: 0 }
    return {
      quotaAmountCents: totalQuota,
      attainmentPct: creditedAmountCents / totalQuota,
    }
  }
}
