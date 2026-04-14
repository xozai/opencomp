import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  earningsRules,
  earningsResults,
  measureResults,
  quotas,
  participants,
  prorationRules,
  periods,
} from '../../../apps/api/src/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TieredConfig {
  tiers: Array<{ fromPct: number; toPct: number | null; rate: number }>
}

interface AcceleratedConfig {
  baseRate: number
  accelerators: Array<{ thresholdPct: number; multiplier: number }>
}

interface MboConfig {
  gates: Array<{ metric: string; thresholdPct: number }>
  targetPayout: number
}

interface DrawConfig {
  rate: number
  drawAmountCents: number
}

interface GuaranteeConfig {
  guaranteedAmountCents: number
  rate: number
}

interface FlatRateConfig {
  rate?: number
  amountCents?: number
}

interface CapConfig {
  type: 'absolute' | 'multiplier'
  value: number
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class EarningsEngine {
  constructor(private db: Db) {}

  async applyEarnings(
    tenantId: string,
    calculationRunId: string,
    periodId: string,
    planVersionId: string,
  ): Promise<{ earningsResultsWritten: number }> {
    // 1. Load earnings_rules, topologically sorted by dependsOnComponentId
    const rules = await this.db
      .select()
      .from(earningsRules)
      .where(and(eq(earningsRules.tenantId, tenantId), eq(earningsRules.planVersionId, planVersionId)))

    const sortedRules = this.topologicalSort(rules)

    // Load all measure_results for this calculation run
    const allMeasureResults = await this.db
      .select()
      .from(measureResults)
      .where(
        and(
          eq(measureResults.tenantId, tenantId),
          eq(measureResults.calculationRunId, calculationRunId),
        ),
      )

    // Load all quotas for this period and planVersion
    const allQuotas = await this.db
      .select()
      .from(quotas)
      .where(
        and(
          eq(quotas.tenantId, tenantId),
          eq(quotas.periodId, periodId),
          eq(quotas.planVersionId, planVersionId),
        ),
      )

    // Load all proration rules
    const prorationRuleList = await this.db
      .select()
      .from(prorationRules)
      .where(
        and(
          eq(prorationRules.tenantId, tenantId),
          eq(prorationRules.planVersionId, planVersionId),
          eq(prorationRules.isActive, true),
        ),
      )

    // Load period info for proration
    const [period] = await this.db
      .select()
      .from(periods)
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, periodId)))
      .limit(1)

    // Get unique participants from measure results
    const participantIds = [...new Set(allMeasureResults.map((r) => r.participantId))]

    // Load participant info for proration
    const participantList = await this.db
      .select()
      .from(participants)
      .where(eq(participants.tenantId, tenantId))

    const participantMap = new Map(participantList.map((p) => [p.id, p]))

    let earningsResultsWritten = 0

    for (const participantId of participantIds) {
      const participant = participantMap.get(participantId)

      for (const rule of sortedRules) {
        if (!rule.componentId) continue

        // Load measure result for this participant × component
        const measureResult = allMeasureResults.find(
          (r) => r.participantId === participantId && r.componentId === rule.componentId,
        )

        if (!measureResult) continue

        const measuredValue = parseFloat(measureResult.measuredValue as string)

        // Load quota for attainment
        const quota = allQuotas.find(
          (q) => q.participantId === participantId,
        )

        const quotaAmount = quota ? quota.amount : 0
        const attainmentPct = quotaAmount > 0 ? (measuredValue / quotaAmount) * 100 : 100

        // Apply formula
        const formulaConfig = rule.formulaConfig as Record<string, unknown>
        let grossEarningsCents = 0
        const formulaBreakdown: Record<string, unknown> = {}

        switch (rule.formulaType) {
          case 'flat_rate': {
            const config = formulaConfig as FlatRateConfig
            if (config.amountCents !== undefined) {
              grossEarningsCents = config.amountCents
            } else {
              grossEarningsCents = Math.round(measuredValue * (config.rate ?? 0))
            }
            formulaBreakdown.type = 'flat_rate'
            formulaBreakdown.measuredValue = measuredValue
            formulaBreakdown.rate = config.rate
            break
          }

          case 'tiered': {
            const config = formulaConfig as unknown as TieredConfig
            let remaining = measuredValue
            let totalEarnings = 0
            const tierBreakdown: unknown[] = []

            for (const tier of config.tiers ?? []) {
              if (remaining <= 0) break
              const tierFromValue = quota ? (tier.fromPct / 100) * quotaAmount : 0
              const tierToValue = tier.toPct !== null && quota ? (tier.toPct / 100) * quotaAmount : Infinity

              if (measuredValue < tierFromValue) break

              const inTier = Math.min(remaining, tierToValue - tierFromValue)
              const tierEarnings = Math.round(inTier * tier.rate)
              totalEarnings += tierEarnings
              remaining -= inTier
              tierBreakdown.push({ fromPct: tier.fromPct, toPct: tier.toPct, inTier, tierEarnings })
            }

            grossEarningsCents = totalEarnings
            formulaBreakdown.type = 'tiered'
            formulaBreakdown.tiers = tierBreakdown
            break
          }

          case 'accelerated': {
            const config = formulaConfig as unknown as AcceleratedConfig
            let multiplier = 1

            const sortedAccelerators = [...(config.accelerators ?? [])].sort(
              (a, b) => b.thresholdPct - a.thresholdPct,
            )

            for (const acc of sortedAccelerators) {
              if (attainmentPct >= acc.thresholdPct) {
                multiplier = acc.multiplier
                break
              }
            }

            grossEarningsCents = Math.round(measuredValue * (config.baseRate ?? 0) * multiplier)
            formulaBreakdown.type = 'accelerated'
            formulaBreakdown.baseRate = config.baseRate
            formulaBreakdown.multiplier = multiplier
            formulaBreakdown.attainmentPct = attainmentPct
            break
          }

          case 'mbo': {
            const config = formulaConfig as unknown as MboConfig
            const allGatesPassed = (config.gates ?? []).every((gate) => {
              // Simplified: compare attainment against gate threshold
              return attainmentPct >= gate.thresholdPct
            })

            grossEarningsCents = allGatesPassed ? (config.targetPayout ?? 0) : 0
            formulaBreakdown.type = 'mbo'
            formulaBreakdown.allGatesPassed = allGatesPassed
            formulaBreakdown.targetPayout = config.targetPayout
            break
          }

          case 'draw': {
            const config = formulaConfig as unknown as DrawConfig
            const baseEarnings = Math.round(measuredValue * (config.rate ?? 0))
            grossEarningsCents = Math.max(0, baseEarnings - (config.drawAmountCents ?? 0))
            formulaBreakdown.type = 'draw'
            formulaBreakdown.baseEarnings = baseEarnings
            formulaBreakdown.drawAmountCents = config.drawAmountCents
            break
          }

          case 'guarantee': {
            const config = formulaConfig as unknown as GuaranteeConfig
            const baseEarnings = Math.round(measuredValue * (config.rate ?? 0))
            grossEarningsCents = Math.max(config.guaranteedAmountCents ?? 0, baseEarnings)
            formulaBreakdown.type = 'guarantee'
            formulaBreakdown.guaranteedAmountCents = config.guaranteedAmountCents
            formulaBreakdown.baseEarnings = baseEarnings
            break
          }
        }

        // Apply proration if participant has hire/term date in period
        if (participant && period) {
          grossEarningsCents = this.applyProration(
            grossEarningsCents,
            participant,
            period,
            prorationRuleList,
          )
        }

        // Apply cap if configured
        let cappedEarningsCents = grossEarningsCents
        if (rule.cap) {
          const cap = rule.cap as CapConfig
          if (cap.type === 'absolute') {
            cappedEarningsCents = Math.min(grossEarningsCents, cap.value)
          } else if (cap.type === 'multiplier') {
            cappedEarningsCents = Math.min(grossEarningsCents, Math.round(quotaAmount * cap.value))
          }
        }

        // Write earnings_results (ON CONFLICT DO UPDATE)
        await this.db
          .insert(earningsResults)
          .values({
            tenantId,
            calculationRunId,
            participantId,
            componentId: rule.componentId,
            periodId,
            grossEarningsCents,
            cappedEarningsCents,
            attainmentPct: String(attainmentPct),
            formulaBreakdown,
          })
          .onConflictDoUpdate({
            target: [
              earningsResults.calculationRunId,
              earningsResults.participantId,
              earningsResults.componentId,
              earningsResults.periodId,
            ],
            set: {
              grossEarningsCents,
              cappedEarningsCents,
              attainmentPct: String(attainmentPct),
              formulaBreakdown,
            },
          })

        earningsResultsWritten++
      }
    }

    return { earningsResultsWritten }
  }

  applyProration(
    earningsCents: number,
    participant: { hireDate?: string | null; terminationDate?: string | null },
    period: { startDate: string; endDate: string },
    prorationsRules: Array<{ triggerType: string; method: string; minimumDays: number }>,
  ): number {
    const periodStart = new Date(period.startDate)
    const periodEnd = new Date(period.endDate)
    const periodTotalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Determine which proration rule applies
    let applicableRule: (typeof prorationsRules)[0] | undefined

    if (participant.hireDate) {
      const hireDate = new Date(participant.hireDate)
      if (hireDate > periodStart && hireDate <= periodEnd) {
        applicableRule = prorationsRules.find((r) => r.triggerType === 'hire')
      }
    }

    if (participant.terminationDate) {
      const termDate = new Date(participant.terminationDate)
      if (termDate >= periodStart && termDate < periodEnd) {
        applicableRule = prorationsRules.find((r) => r.triggerType === 'termination')
      }
    }

    if (!applicableRule || applicableRule.method === 'none') return earningsCents

    // Calculate worked dates
    const workStart = participant.hireDate
      ? new Date(Math.max(new Date(participant.hireDate).getTime(), periodStart.getTime()))
      : periodStart

    const workEnd = participant.terminationDate
      ? new Date(Math.min(new Date(participant.terminationDate).getTime(), periodEnd.getTime()))
      : periodEnd

    let daysWorked: number

    if (applicableRule.method === 'calendar_days') {
      daysWorked = Math.ceil((workEnd.getTime() - workStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else {
      // working_days: count Mon-Fri only
      daysWorked = 0
      const current = new Date(workStart)
      while (current <= workEnd) {
        const dow = current.getDay()
        if (dow !== 0 && dow !== 6) daysWorked++
        current.setDate(current.getDate() + 1)
      }
    }

    if (daysWorked < applicableRule.minimumDays) return 0

    return Math.round(earningsCents * (daysWorked / periodTotalDays))
  }

  private topologicalSort(rules: typeof earningsRules.$inferSelect[]): typeof earningsRules.$inferSelect[] {
    const ruleMap = new Map(rules.map((r) => [r.id, r]))
    const visited = new Set<string>()
    const result: typeof earningsRules.$inferSelect[] = []

    function visit(id: string) {
      if (visited.has(id)) return
      visited.add(id)
      const rule = ruleMap.get(id)
      if (!rule) return
      if (rule.dependsOnComponentId) {
        const dep = rules.find((r) => r.componentId === rule.dependsOnComponentId)
        if (dep) visit(dep.id)
      }
      result.push(rule)
    }

    for (const rule of rules) {
      visit(rule.id)
    }

    return result
  }
}
