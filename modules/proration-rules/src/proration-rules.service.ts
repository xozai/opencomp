import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { prorationRules } from '../../../apps/api/src/db/schema'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateProrationRuleSchema = z.object({
  planVersionId: z.string().uuid().optional(),
  triggerType: z.enum(['hire', 'termination', 'leave', 'plan_change']),
  method: z.enum(['calendar_days', 'working_days', 'none']).default('calendar_days'),
  minimumDays: z.number().int().default(0),
  isActive: z.boolean().default(true),
})
export type CreateProrationRuleInput = z.infer<typeof CreateProrationRuleSchema>

export const UpdateProrationRuleSchema = CreateProrationRuleSchema.partial()
export type UpdateProrationRuleInput = z.infer<typeof UpdateProrationRuleSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class ProrationRulesService {
  constructor(private db: Db) {}

  async listRules(tenantId: string, planVersionId?: string) {
    const all = await this.db
      .select()
      .from(prorationRules)
      .where(eq(prorationRules.tenantId, tenantId))

    return planVersionId ? all.filter((r) => r.planVersionId === planVersionId) : all
  }

  async createRule(tenantId: string, input: CreateProrationRuleInput) {
    const data = CreateProrationRuleSchema.parse(input)

    const [rule] = await this.db
      .insert(prorationRules)
      .values({
        tenantId,
        planVersionId: data.planVersionId ?? null,
        triggerType: data.triggerType,
        method: data.method,
        minimumDays: data.minimumDays,
        isActive: data.isActive,
      })
      .returning()

    return rule
  }

  async updateRule(tenantId: string, id: string, input: UpdateProrationRuleInput) {
    const [existing] = await this.db
      .select()
      .from(prorationRules)
      .where(and(eq(prorationRules.tenantId, tenantId), eq(prorationRules.id, id)))
      .limit(1)

    if (!existing) throw new ProrationRuleError('NOT_FOUND', 'Proration rule not found')

    const data = UpdateProrationRuleSchema.parse(input)

    const [updated] = await this.db
      .update(prorationRules)
      .set({
        ...(data.triggerType !== undefined ? { triggerType: data.triggerType } : {}),
        ...(data.method !== undefined ? { method: data.method } : {}),
        ...(data.minimumDays !== undefined ? { minimumDays: data.minimumDays } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(prorationRules.tenantId, tenantId), eq(prorationRules.id, id)))
      .returning()

    return updated
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProrationRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ProrationRuleError'
  }
}
