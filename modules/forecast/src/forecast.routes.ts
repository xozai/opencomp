/**
 * Forecast module — rep-facing earnings projection for the current/selected period.
 * GET /my/forecast?periodId=  (periodId optional, defaults to most-recent open period)
 */

import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import {
  participants,
  periods,
  quotas,
  goalSheets,
  measureResults,
  earningsResults,
  paymentBalances,
} from '../../../apps/api/src/db/schema'

export async function forecastRoutes(app: FastifyInstance) {
  app.get('/my/forecast', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const tenantId: string = request.tenantId
    const userId: string = request.user?.sub

    // 1. Resolve participant from JWT sub
    const [participant] = await app.db
      .select({ id: participants.id, firstName: participants.firstName, lastName: participants.lastName })
      .from(participants)
      .where(and(eq(participants.tenantId, tenantId), eq(participants.userId, userId)))
      .limit(1)

    if (!participant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NO_PARTICIPANT', message: 'No participant record linked to your account' },
      })
    }

    const participantId = participant.id

    // 2. Resolve period
    let periodId: string | undefined = (request.query as Record<string, string>).periodId

    if (!periodId) {
      const [latestPeriod] = await app.db
        .select({ id: periods.id })
        .from(periods)
        .where(and(eq(periods.tenantId, tenantId), eq(periods.isClosed, false)))
        .orderBy(desc(periods.startDate))
        .limit(1)
      periodId = latestPeriod?.id
    }

    if (!periodId) {
      return reply.send({
        success: true,
        data: {
          participant: { id: participantId, firstName: participant.firstName, lastName: participant.lastName },
          period: null,
          goalSheet: null,
          quotas: [],
          earnings: [],
          payments: [],
          summary: { totalQuotaAmountCents: 0, totalEarnedCents: 0, totalPaidCents: 0 },
        },
      })
    }

    // 3. Load period info
    const [period] = await app.db
      .select({ id: periods.id, name: periods.name, startDate: periods.startDate, endDate: periods.endDate, isClosed: periods.isClosed })
      .from(periods)
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, periodId)))
      .limit(1)

    // 4. Load quotas (amount = cents)
    const quotaRows = await app.db
      .select()
      .from(quotas)
      .where(
        and(
          eq(quotas.tenantId, tenantId),
          eq(quotas.participantId, participantId),
          eq(quotas.periodId, periodId),
        ),
      )

    // 5. Load goal sheet
    const [goalSheet] = await app.db
      .select({ id: goalSheets.id, data: goalSheets.data, acknowledgedAt: goalSheets.acknowledgedAt })
      .from(goalSheets)
      .where(
        and(
          eq(goalSheets.tenantId, tenantId),
          eq(goalSheets.participantId, participantId),
          eq(goalSheets.periodId, periodId),
        ),
      )
      .limit(1)

    // 6. Load measure results (for the period — pick most recent calc run)
    const measureResultRows = await app.db
      .select()
      .from(measureResults)
      .where(
        and(
          eq(measureResults.tenantId, tenantId),
          eq(measureResults.participantId, participantId),
          eq(measureResults.periodId, periodId),
        ),
      )

    // 7. Load earnings results (for the period — pick highest capped per component)
    const earningsResultRows = await app.db
      .select()
      .from(earningsResults)
      .where(
        and(
          eq(earningsResults.tenantId, tenantId),
          eq(earningsResults.participantId, participantId),
          eq(earningsResults.periodId, periodId),
        ),
      )

    // Deduplicate earnings: keep highest cappedEarnings per componentId
    const bestEarningsByComponent = new Map<string, typeof earningsResultRows[number]>()
    for (const er of earningsResultRows) {
      const existing = bestEarningsByComponent.get(er.componentId)
      if (!existing || er.cappedEarningsCents > existing.cappedEarningsCents) {
        bestEarningsByComponent.set(er.componentId, er)
      }
    }

    // 8. Load payment balances
    const paymentBalanceRows = await app.db
      .select()
      .from(paymentBalances)
      .where(
        and(
          eq(paymentBalances.tenantId, tenantId),
          eq(paymentBalances.participantId, participantId),
          eq(paymentBalances.periodId, periodId),
        ),
      )

    // 9. Summary
    const totalQuotaAmountCents = quotaRows.reduce((s, q) => s + q.amount, 0)
    const totalEarnedCents = Array.from(bestEarningsByComponent.values()).reduce((s, e) => s + e.cappedEarningsCents, 0)
    const totalPaidCents = paymentBalanceRows.reduce((s, pb) => s + pb.paidCents, 0)

    return reply.send({
      success: true,
      data: {
        participant: { id: participantId, firstName: participant.firstName, lastName: participant.lastName },
        period: period ?? null,
        goalSheet: goalSheet
          ? { id: goalSheet.id, data: goalSheet.data, acknowledgedAt: goalSheet.acknowledgedAt }
          : null,
        quotas: quotaRows.map(q => ({
          id: q.id,
          type: q.type,
          amountCents: q.amount,
          currency: q.currency,
          notes: q.notes,
        })),
        earnings: Array.from(bestEarningsByComponent.values()).map(e => ({
          componentId: e.componentId,
          grossEarningsCents: e.grossEarningsCents,
          cappedEarningsCents: e.cappedEarningsCents,
          attainmentPct: parseFloat(e.attainmentPct as unknown as string),
        })),
        measures: measureResultRows.map(m => ({
          componentId: m.componentId,
          measuredValue: parseFloat(m.measuredValue as unknown as string),
          transactionCount: m.transactionCount,
          currency: m.currency,
        })),
        payments: paymentBalanceRows.map(pb => ({
          componentId: pb.componentId,
          earningsCents: pb.earningsCents,
          paidCents: pb.paidCents,
          closingBalanceCents: pb.closingBalanceCents,
          status: pb.status,
          paidAt: pb.paidAt,
        })),
        summary: {
          totalQuotaAmountCents,
          totalEarnedCents,
          totalPaidCents,
        },
      },
    })
  })
}
