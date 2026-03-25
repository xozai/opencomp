/**
 * Reporting service — generates tabular summary reports from calculation data.
 *
 * Reports are returned as structured data (arrays of objects) that callers
 * can serialise to CSV, JSON, or render in the admin portal.
 */
import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  calculationRuns,
  payouts,
  participants,
  periods,
} from '../../../apps/api/src/db/schema'

// ─── Report types ─────────────────────────────────────────────────────────────

export interface PayoutSummaryRow {
  participantId: string
  firstName: string
  lastName: string
  email: string
  periodId: string
  periodName: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  status: string
}

export interface RunSummaryRow {
  runId: string
  periodId: string
  planVersionId: string
  status: string
  participantCount: number | null
  errorCount: number | null
  startedAt: Date | null
  completedAt: Date | null
  triggeredById: string | null
}

export interface AttainmentRow {
  participantId: string
  firstName: string
  lastName: string
  email: string
  grossAmountCents: number
  lineItems: unknown
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ReportingService {
  constructor(private db: Db) {}

  /** Payout summary for all participants in a period. */
  async payoutSummary(tenantId: string, periodId: string): Promise<PayoutSummaryRow[]> {
    const rows = await this.db
      .select({
        participantId: participants.id,
        firstName: participants.firstName,
        lastName: participants.lastName,
        email: participants.email,
        periodId: payouts.periodId,
        periodName: periods.name,
        grossAmountCents: payouts.grossAmountCents,
        adjustedAmountCents: payouts.adjustedAmountCents,
        currency: payouts.currency,
        status: payouts.status,
      })
      .from(payouts)
      .innerJoin(participants, eq(participants.id, payouts.participantId))
      .innerJoin(periods, eq(periods.id, payouts.periodId))
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.periodId, periodId)))

    return rows
  }

  /** Summary of all calculation runs for a tenant. */
  async runSummary(tenantId: string, periodId?: string): Promise<RunSummaryRow[]> {
    const all = await this.db
      .select({
        runId: calculationRuns.id,
        periodId: calculationRuns.periodId,
        planVersionId: calculationRuns.planVersionId,
        status: calculationRuns.status,
        participantCount: calculationRuns.participantCount,
        errorCount: calculationRuns.errorCount,
        startedAt: calculationRuns.startedAt,
        completedAt: calculationRuns.completedAt,
        triggeredById: calculationRuns.triggeredById,
      })
      .from(calculationRuns)
      .where(eq(calculationRuns.tenantId, tenantId))

    return periodId ? all.filter((r) => r.periodId === periodId) : all
  }

  /** Per-participant attainment breakdown for a specific calculation run. */
  async attainmentBreakdown(tenantId: string, calculationRunId: string): Promise<AttainmentRow[]> {
    const rows = await this.db
      .select({
        participantId: participants.id,
        firstName: participants.firstName,
        lastName: participants.lastName,
        email: participants.email,
        grossAmountCents: payouts.grossAmountCents,
        lineItems: payouts.lineItems,
      })
      .from(payouts)
      .innerJoin(participants, eq(participants.id, payouts.participantId))
      .where(
        and(
          eq(payouts.tenantId, tenantId),
          eq(payouts.calculationRunId, calculationRunId),
        ),
      )

    return rows
  }

  /** Export payout summary as CSV string. */
  async exportPayoutCsv(tenantId: string, periodId: string): Promise<string> {
    const rows = await this.payoutSummary(tenantId, periodId)

    const header = 'participantId,firstName,lastName,email,periodName,grossAmountCents,adjustedAmountCents,currency,status'
    const lines = rows.map((r) =>
      [
        r.participantId,
        `"${r.firstName}"`,
        `"${r.lastName}"`,
        `"${r.email}"`,
        `"${r.periodName}"`,
        r.grossAmountCents,
        r.adjustedAmountCents,
        r.currency,
        r.status,
      ].join(','),
    )

    return [header, ...lines].join('\n')
  }
}
