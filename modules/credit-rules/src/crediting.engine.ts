import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  creditRules,
  creditRuleConditions,
  creditRuleActions,
  sourceTransactions,
  credits,
  positionRelationships,
} from '../../../apps/api/src/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Condition {
  field: string
  operator: 'eq' | 'neq' | 'contains' | 'in' | 'gte' | 'lte' | 'matches_regex'
  value: string
}

export interface SourceTransaction {
  id: string
  amountCents: number
  currency: string
  participantId: string | null
  payload: Record<string, unknown>
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class CreditingEngine {
  constructor(private db: Db) {}

  async applyCrediting(
    tenantId: string,
    periodId: string,
    planVersionId: string,
    calculationRunId: string,
  ): Promise<{ creditsApplied: number }> {
    // 1. Load all active credit rules ordered by priority ASC
    const rules = await this.db
      .select()
      .from(creditRules)
      .where(
        and(
          eq(creditRules.tenantId, tenantId),
          eq(creditRules.planVersionId, planVersionId),
          eq(creditRules.isActive, true),
        ),
      )

    rules.sort((a, b) => a.priority - b.priority)

    // Load conditions and actions for each rule
    const ruleConditions = await this.db
      .select()
      .from(creditRuleConditions)
      .where(eq(creditRuleConditions.tenantId, tenantId))

    const ruleActions = await this.db
      .select()
      .from(creditRuleActions)
      .where(eq(creditRuleActions.tenantId, tenantId))

    // 2. Load all validated transactions for the period
    const transactions = await this.db
      .select()
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.tenantId, tenantId),
          eq(sourceTransactions.status, 'validated'),
        ),
      )

    let creditsApplied = 0

    // 3. For each transaction, evaluate rules
    for (const tx of transactions) {
      const sourceTx: SourceTransaction = {
        id: tx.id,
        amountCents: tx.amountCents,
        currency: tx.currency,
        participantId: tx.participantId,
        payload: tx.payload as Record<string, unknown>,
      }

      for (const rule of rules) {
        const conditions = ruleConditions.filter((c) => c.creditRuleId === rule.id)
        const actions = ruleActions.filter((a) => a.creditRuleId === rule.id)

        if (!this.evaluateConditions(conditions as Condition[], sourceTx)) continue

        // First matching rule wins — process actions then break
        for (const action of actions) {
          if (action.actionType === 'assign_to_position' || action.actionType === 'assign_to_participant') {
            const amountCents = Math.round(tx.amountCents * (action.splitPct / 100))
            if (tx.participantId) {
              await this.db
                .insert(credits)
                .values({
                  tenantId,
                  transactionId: tx.id,
                  participantId: tx.participantId,
                  componentId: action.targetValue, // targetValue contains componentId for direct assignments
                  periodId,
                  amountCents,
                  currency: tx.currency,
                  creditRuleId: rule.id,
                  splitPct: action.splitPct,
                })
                .onConflictDoNothing()
              creditsApplied++
            }
          } else if (action.actionType === 'split') {
            const amountCents = Math.round(tx.amountCents * (action.splitPct / 100))
            if (tx.participantId) {
              await this.db
                .insert(credits)
                .values({
                  tenantId,
                  transactionId: tx.id,
                  participantId: tx.participantId,
                  componentId: action.targetValue,
                  periodId,
                  amountCents,
                  currency: tx.currency,
                  creditRuleId: rule.id,
                  splitPct: action.splitPct,
                })
                .onConflictDoNothing()
              creditsApplied++
            }
          } else if (action.actionType === 'inherit_to_parent') {
            // Walk up position_relationships upward up to inheritanceDepth levels
            const amountCents = Math.round(tx.amountCents * (action.splitPct / 100))
            if (tx.participantId) {
              // First credit the direct participant
              await this.db
                .insert(credits)
                .values({
                  tenantId,
                  transactionId: tx.id,
                  participantId: tx.participantId,
                  componentId: action.targetValue,
                  periodId,
                  amountCents,
                  currency: tx.currency,
                  creditRuleId: rule.id,
                  splitPct: action.splitPct,
                })
                .onConflictDoNothing()
              creditsApplied++

              // Walk inheritance chain
              const maxDepth = action.inheritanceDepth === 0 ? 100 : action.inheritanceDepth
              let currentComponentId = action.targetValue
              let depth = 0

              while (depth < maxDepth) {
                const parentRels = await this.db
                  .select()
                  .from(positionRelationships)
                  .where(
                    and(
                      eq(positionRelationships.tenantId, tenantId),
                      eq(positionRelationships.fromPositionId, currentComponentId),
                      eq(positionRelationships.relationshipType, 'reports_to'),
                    ),
                  )
                  .limit(1)

                if (parentRels.length === 0) break

                const parentRel = parentRels[0]
                // Create credit for parent position's component
                // Note: In practice, parent position's participant would be looked up
                // For now, record the inheritance
                currentComponentId = parentRel.toPositionId
                depth++
              }
            }
          }
        }

        break // first match wins
      }
    }

    return { creditsApplied }
  }

  evaluateConditions(conditions: Condition[], transaction: SourceTransaction): boolean {
    if (conditions.length === 0) return true

    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(condition.field, transaction)
      if (!this.evaluateCondition(condition, fieldValue)) return false
    }

    return true
  }

  private getFieldValue(field: string, transaction: SourceTransaction): string {
    if (field === 'transaction.amountCents') return String(transaction.amountCents)
    if (field === 'transaction.currency') return transaction.currency
    if (field.startsWith('transaction.payload.')) {
      const key = field.replace('transaction.payload.', '')
      return String(transaction.payload[key] ?? '')
    }
    // Fallback to payload
    return String((transaction.payload as Record<string, unknown>)[field] ?? '')
  }

  private evaluateCondition(condition: Condition, fieldValue: string): boolean {
    const { operator, value } = condition

    switch (operator) {
      case 'eq':
        return fieldValue === value
      case 'neq':
        return fieldValue !== value
      case 'contains':
        return fieldValue.includes(value)
      case 'in': {
        const values = value.split(',').map((v) => v.trim())
        return values.includes(fieldValue)
      }
      case 'gte':
        return parseFloat(fieldValue) >= parseFloat(value)
      case 'lte':
        return parseFloat(fieldValue) <= parseFloat(value)
      case 'matches_regex': {
        try {
          const regex = new RegExp(value)
          return regex.test(fieldValue)
        } catch {
          return false
        }
      }
      default:
        return false
    }
  }
}
