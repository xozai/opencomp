import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { earningsRules, earningsResults } from '../../../apps/api/src/db/schema'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateEarningsRuleSchema = z.object({
  planVersionId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  basisType: z.enum(['aggregate', 'per_transaction']).default('aggregate'),
  formulaType: z.enum(['flat_rate', 'tiered', 'accelerated', 'mbo', 'draw', 'guarantee']),
  formulaConfig: z.record(z.unknown()).default({}),
  cap: z.unknown().optional(),
  quotaRef: z.string().optional(),
  naturalLanguageDefinition: z.string().optional(),
  parsedDefinition: z.unknown().optional(),
  dependsOnComponentId: z.string().uuid().optional(),
})
export type CreateEarningsRuleInput = z.infer<typeof CreateEarningsRuleSchema>

export const UpdateEarningsRuleSchema = CreateEarningsRuleSchema.partial()
export type UpdateEarningsRuleInput = z.infer<typeof UpdateEarningsRuleSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class EarningsService {
  constructor(private db: Db) {}

  async listRules(tenantId: string, planVersionId?: string) {
    const all = await this.db
      .select()
      .from(earningsRules)
      .where(eq(earningsRules.tenantId, tenantId))

    return planVersionId ? all.filter((r) => r.planVersionId === planVersionId) : all
  }

  async getRule(tenantId: string, id: string) {
    const [rule] = await this.db
      .select()
      .from(earningsRules)
      .where(and(eq(earningsRules.tenantId, tenantId), eq(earningsRules.id, id)))
      .limit(1)

    if (!rule) throw new EarningsError('NOT_FOUND', 'Earnings rule not found')
    return rule
  }

  async createRule(tenantId: string, input: CreateEarningsRuleInput) {
    const data = CreateEarningsRuleSchema.parse(input)

    const [rule] = await this.db
      .insert(earningsRules)
      .values({
        tenantId,
        planVersionId: data.planVersionId ?? null,
        componentId: data.componentId ?? null,
        basisType: data.basisType,
        formulaType: data.formulaType,
        formulaConfig: data.formulaConfig,
        cap: data.cap ?? null,
        quotaRef: data.quotaRef ?? null,
        naturalLanguageDefinition: data.naturalLanguageDefinition ?? null,
        parsedDefinition: data.parsedDefinition ?? null,
        dependsOnComponentId: data.dependsOnComponentId ?? null,
      })
      .returning()

    const requiresNlParsing = !!data.naturalLanguageDefinition && !data.parsedDefinition
    return { ...rule, requiresNlParsing }
  }

  async updateRule(tenantId: string, id: string, input: UpdateEarningsRuleInput) {
    await this.getRule(tenantId, id)
    const data = UpdateEarningsRuleSchema.parse(input)

    const [updated] = await this.db
      .update(earningsRules)
      .set({
        ...(data.basisType !== undefined ? { basisType: data.basisType } : {}),
        ...(data.formulaType !== undefined ? { formulaType: data.formulaType } : {}),
        ...(data.formulaConfig !== undefined ? { formulaConfig: data.formulaConfig } : {}),
        ...(data.cap !== undefined ? { cap: data.cap } : {}),
        ...(data.quotaRef !== undefined ? { quotaRef: data.quotaRef } : {}),
        ...(data.naturalLanguageDefinition !== undefined ? { naturalLanguageDefinition: data.naturalLanguageDefinition } : {}),
        ...(data.parsedDefinition !== undefined ? { parsedDefinition: data.parsedDefinition } : {}),
        ...(data.dependsOnComponentId !== undefined ? { dependsOnComponentId: data.dependsOnComponentId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(earningsRules.tenantId, tenantId), eq(earningsRules.id, id)))
      .returning()

    return updated
  }

  async listResults(
    tenantId: string,
    filters: { calculationRunId?: string; participantId?: string; componentId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(earningsResults)
      .where(eq(earningsResults.tenantId, tenantId))

    return all.filter((r) => {
      if (filters.calculationRunId && r.calculationRunId !== filters.calculationRunId) return false
      if (filters.participantId && r.participantId !== filters.participantId) return false
      if (filters.componentId && r.componentId !== filters.componentId) return false
      return true
    })
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class EarningsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'EarningsError'
  }
}
