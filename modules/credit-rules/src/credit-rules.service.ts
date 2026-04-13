import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import {
  creditRules,
  creditRuleConditions,
  creditRuleActions,
} from '../../../apps/api/src/db/schema'
import { CreditingEngine } from './crediting.engine'
import type { SourceTransaction } from './crediting.engine'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateCreditRuleSchema = z.object({
  planVersionId: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  naturalLanguageDefinition: z.string().optional(),
  parsedDefinition: z.unknown().optional(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).optional(),
  actions: z.array(z.object({
    actionType: z.enum(['assign_to_position', 'assign_to_participant', 'split', 'inherit_to_parent']),
    targetType: z.enum(['position_type', 'position_id', 'participant_attribute']),
    targetValue: z.string(),
    splitPct: z.number().int().default(100),
    inheritanceDepth: z.number().int().default(0),
  })).optional(),
})
export type CreateCreditRuleInput = z.infer<typeof CreateCreditRuleSchema>

export const UpdateCreditRuleSchema = CreateCreditRuleSchema.partial()
export type UpdateCreditRuleInput = z.infer<typeof UpdateCreditRuleSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class CreditRulesService {
  private engine: CreditingEngine

  constructor(private db: Db) {
    this.engine = new CreditingEngine(db)
  }

  async listRules(tenantId: string, planVersionId?: string) {
    const rules = await this.db
      .select()
      .from(creditRules)
      .where(eq(creditRules.tenantId, tenantId))

    const filtered = planVersionId ? rules.filter((r) => r.planVersionId === planVersionId) : rules

    const conditions = await this.db
      .select()
      .from(creditRuleConditions)
      .where(eq(creditRuleConditions.tenantId, tenantId))

    const actions = await this.db
      .select()
      .from(creditRuleActions)
      .where(eq(creditRuleActions.tenantId, tenantId))

    return filtered.map((rule) => ({
      ...rule,
      conditions: conditions.filter((c) => c.creditRuleId === rule.id),
      actions: actions.filter((a) => a.creditRuleId === rule.id),
    }))
  }

  async getRule(tenantId: string, id: string) {
    const [rule] = await this.db
      .select()
      .from(creditRules)
      .where(and(eq(creditRules.tenantId, tenantId), eq(creditRules.id, id)))
      .limit(1)

    if (!rule) throw new CreditRuleError('NOT_FOUND', 'Credit rule not found')

    const conditions = await this.db
      .select()
      .from(creditRuleConditions)
      .where(and(eq(creditRuleConditions.tenantId, tenantId), eq(creditRuleConditions.creditRuleId, id)))

    const actions = await this.db
      .select()
      .from(creditRuleActions)
      .where(and(eq(creditRuleActions.tenantId, tenantId), eq(creditRuleActions.creditRuleId, id)))

    return { ...rule, conditions, actions }
  }

  async createRule(tenantId: string, input: CreateCreditRuleInput) {
    const data = CreateCreditRuleSchema.parse(input)

    const [rule] = await this.db
      .insert(creditRules)
      .values({
        tenantId,
        planVersionId: data.planVersionId ?? null,
        name: data.name,
        description: data.description ?? null,
        naturalLanguageDefinition: data.naturalLanguageDefinition ?? null,
        parsedDefinition: data.parsedDefinition ?? null,
        priority: data.priority,
        isActive: data.isActive,
      })
      .returning()

    // Insert conditions
    if (data.conditions?.length) {
      await this.db.insert(creditRuleConditions).values(
        data.conditions.map((c) => ({
          tenantId,
          creditRuleId: rule.id,
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      )
    }

    // Insert actions
    if (data.actions?.length) {
      await this.db.insert(creditRuleActions).values(
        data.actions.map((a) => ({
          tenantId,
          creditRuleId: rule.id,
          actionType: a.actionType,
          targetType: a.targetType,
          targetValue: a.targetValue,
          splitPct: a.splitPct,
          inheritanceDepth: a.inheritanceDepth,
        })),
      )
    }

    const requiresNlParsing = !!data.naturalLanguageDefinition && !data.parsedDefinition
    return { ...rule, requiresNlParsing }
  }

  async updateRule(tenantId: string, id: string, input: UpdateCreditRuleInput) {
    await this.getRule(tenantId, id)
    const data = UpdateCreditRuleSchema.parse(input)

    const [updated] = await this.db
      .update(creditRules)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.naturalLanguageDefinition !== undefined ? { naturalLanguageDefinition: data.naturalLanguageDefinition } : {}),
        ...(data.parsedDefinition !== undefined ? { parsedDefinition: data.parsedDefinition } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(creditRules.tenantId, tenantId), eq(creditRules.id, id)))
      .returning()

    return updated
  }

  async previewRule(
    tenantId: string,
    input: { creditRuleId: string; sampleTransactions: SourceTransaction[] },
  ) {
    const rule = await this.getRule(tenantId, input.creditRuleId)

    const results = input.sampleTransactions.map((tx) => {
      const conditionsMatch = this.engine.evaluateConditions(
        rule.conditions as Array<{ field: string; operator: any; value: string }>,
        tx,
      )

      if (!conditionsMatch) {
        return { transactionId: tx.id, matched: false, assignments: [] }
      }

      const assignments = rule.actions.map((action) => ({
        actionType: action.actionType,
        targetType: action.targetType,
        targetValue: action.targetValue,
        splitPct: action.splitPct,
        amountCents: Math.round(tx.amountCents * (action.splitPct / 100)),
      }))

      return { transactionId: tx.id, matched: true, assignments }
    })

    return results
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class CreditRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CreditRuleError'
  }
}
