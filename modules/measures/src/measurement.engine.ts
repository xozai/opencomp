import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  components,
  measureDefinitions,
  credits,
  sourceTransactions,
  measureResults,
} from '../../../apps/api/src/db/schema'
import type { Condition } from '../../credit-rules/src/crediting.engine'
import { CreditingEngine } from '../../credit-rules/src/crediting.engine'

// ─── Engine ───────────────────────────────────────────────────────────────────

export class MeasurementEngine {
  private conditionEvaluator: CreditingEngine

  constructor(private db: Db) {
    this.conditionEvaluator = new CreditingEngine(db)
  }

  async applyMeasures(
    tenantId: string,
    calculationRunId: string,
    periodId: string,
    planVersionId: string,
  ): Promise<{ measureResultsWritten: number }> {
    // 1. Load all components for planVersionId
    const planComponents = await this.db
      .select()
      .from(components)
      .where(and(eq(components.tenantId, tenantId), eq(components.planVersionId, planVersionId)))

    let measureResultsWritten = 0

    for (const component of planComponents) {
      // 2. Load measure_definition for this component
      const [measureDef] = await this.db
        .select()
        .from(measureDefinitions)
        .where(
          and(
            eq(measureDefinitions.tenantId, tenantId),
            eq(measureDefinitions.componentId, component.id),
          ),
        )
        .limit(1)

      if (!measureDef) continue

      // 3. Load all credits for the period joined with source transactions
      const periodCredits = await this.db
        .select({
          credit: credits,
          transaction: sourceTransactions,
        })
        .from(credits)
        .leftJoin(sourceTransactions, eq(credits.transactionId, sourceTransactions.id))
        .where(
          and(
            eq(credits.tenantId, tenantId),
            eq(credits.periodId, periodId),
            eq(credits.componentId, component.id),
          ),
        )

      // 4. Filter credits matching the measure's filterConditions
      const filterConditions = (measureDef.filterConditions as Condition[]) ?? []
      const matchingCredits = periodCredits.filter(({ transaction }) => {
        if (!transaction) return filterConditions.length === 0
        return this.conditionEvaluator.evaluateConditions(filterConditions, {
          id: transaction.id,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          participantId: transaction.participantId,
          payload: transaction.payload as Record<string, unknown>,
        })
      })

      // Group by participant
      const byParticipant = new Map<string, typeof matchingCredits>()
      for (const row of matchingCredits) {
        const pid = row.credit.participantId
        if (!byParticipant.has(pid)) byParticipant.set(pid, [])
        byParticipant.get(pid)!.push(row)
      }

      for (const [participantId, participantCredits] of byParticipant) {
        // 5. Aggregate according to aggregationType
        const amounts = participantCredits.map((r) => r.credit.amountCents)
        let measuredValue = 0
        let transactionCount = 0

        switch (measureDef.aggregationType) {
          case 'sum':
            measuredValue = amounts.reduce((a, b) => a + b, 0)
            transactionCount = participantCredits.length
            break
          case 'count': {
            const uniqueTxIds = new Set(participantCredits.map((r) => r.credit.transactionId))
            measuredValue = uniqueTxIds.size
            transactionCount = uniqueTxIds.size
            break
          }
          case 'average':
            measuredValue = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
            transactionCount = amounts.length
            break
          case 'max':
            measuredValue = amounts.length > 0 ? Math.max(...amounts) : 0
            transactionCount = amounts.length
            break
          case 'min':
            measuredValue = amounts.length > 0 ? Math.min(...amounts) : 0
            transactionCount = amounts.length
            break
          case 'weighted_average':
            // weight comes from filterConditions — default to equal weight
            measuredValue = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
            transactionCount = amounts.length
            break
        }

        const breakdown = participantCredits.map((r) => ({
          creditId: r.credit.id,
          transactionId: r.credit.transactionId,
          amountCents: r.credit.amountCents,
        }))

        // 6. Write measure_results row (ON CONFLICT DO UPDATE)
        await this.db
          .insert(measureResults)
          .values({
            tenantId,
            calculationRunId,
            participantId,
            componentId: component.id,
            periodId,
            measuredValue: String(measuredValue),
            transactionCount,
            currency: measureDef.currency,
            breakdown,
          })
          .onConflictDoUpdate({
            target: [measureResults.calculationRunId, measureResults.participantId, measureResults.componentId, measureResults.periodId],
            set: {
              measuredValue: String(measuredValue),
              transactionCount,
              breakdown,
            },
          })

        measureResultsWritten++
      }
    }

    return { measureResultsWritten }
  }
}
