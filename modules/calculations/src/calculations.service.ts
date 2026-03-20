import { eq, and } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  calculationRuns,
  payouts,
  credits,
  components,
  participants,
  quotas,
} from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { rulesEngine } from '../../platform-rules/src/rules-engine'
import { eventBus } from '../../../packages/events/src'
import {
  CALCULATION_RUN_STARTED,
  CALCULATION_RUN_COMPLETED,
  CALCULATION_RUN_FAILED,
  createEvent,
} from '../../../packages/events/src/domain-events'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartCalculationRunInput {
  periodId: string
  planVersionId: string
  /** Scope to specific participants — omit for all active participants */
  participantIds?: string[]
}

export interface PayoutLineItem {
  componentId: string
  componentName: string
  creditedAmountCents: number
  quotaAmountCents: number
  attainmentPct: number
  payoutCents: number
  formulaId: string
  explanation: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CalculationsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async getRun(tenantId: string, runId: string) {
    const [run] = await this.db
      .select()
      .from(calculationRuns)
      .where(and(eq(calculationRuns.tenantId, tenantId), eq(calculationRuns.id, runId)))
      .limit(1)

    if (!run) throw new CalculationError('RUN_NOT_FOUND', 'Calculation run not found')
    return run
  }

  async listRuns(tenantId: string, periodId?: string) {
    const all = await this.db
      .select()
      .from(calculationRuns)
      .where(eq(calculationRuns.tenantId, tenantId))
    return periodId ? all.filter((r) => r.periodId === periodId) : all
  }

  /**
   * Execute a full compensation calculation run.
   *
   * For each active participant:
   *   1. Load all credit records for the period
   *   2. Load quota for attainment computation
   *   3. Evaluate each plan component formula via rulesEngine
   *   4. Sum component payouts into a gross payout
   *   5. Write payout record with full line items for auditability
   *
   * This is intentionally synchronous within a single DB connection.
   * For large tenants, use the worker queue to run this as a background job.
   */
  async executeRun(
    tenantId: string,
    input: StartCalculationRunInput,
    ctx: AuditContext,
  ) {
    // Create run record
    const [run] = await this.db
      .insert(calculationRuns)
      .values({
        tenantId,
        periodId: input.periodId,
        planVersionId: input.planVersionId,
        status: 'running',
        triggeredById: ctx.actorId ?? null,
        startedAt: new Date(),
        config: { participantIds: input.participantIds ?? null },
      })
      .returning()

    await eventBus.publish(
      createEvent(CALCULATION_RUN_STARTED, tenantId, { calculationRunId: run.id, periodId: input.periodId }),
    )

    try {
      // Load plan components
      const planComponents = await this.db
        .select()
        .from(components)
        .where(and(eq(components.tenantId, tenantId), eq(components.planVersionId, input.planVersionId)))

      if (planComponents.length === 0) {
        throw new CalculationError('NO_COMPONENTS', 'Plan version has no components')
      }

      // Load participants
      let participantList: Array<{ id: string }>
      if (input.participantIds?.length) {
        participantList = input.participantIds.map((id) => ({ id }))
      } else {
        participantList = await this.db
          .select({ id: participants.id })
          .from(participants)
          .where(and(eq(participants.tenantId, tenantId), eq(participants.status, 'active')))
      }

      let successCount = 0
      let errorCount = 0

      for (const participant of participantList) {
        try {
          await this.calculateParticipant(
            tenantId,
            participant.id,
            run.id,
            input.periodId,
            input.planVersionId,
            planComponents,
            ctx,
          )
          successCount++
        } catch (err) {
          errorCount++
          console.error(
            `[calculations] Failed for participant ${participant.id}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }

      // Mark run completed
      const [completed] = await this.db
        .update(calculationRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          participantCount: successCount,
          errorCount,
          updatedAt: new Date(),
        })
        .where(eq(calculationRuns.id, run.id))
        .returning()

      await eventBus.publish(
        createEvent(CALCULATION_RUN_COMPLETED, tenantId, { calculationRunId: run.id, periodId: input.periodId }),
      )

      await this.audit.recordSafe({
        ctx,
        entityType: 'calculation_run',
        entityId: run.id,
        action: 'completed',
        after: { participantCount: successCount, errorCount },
      })

      return completed
    } catch (err) {
      // Mark run failed
      await this.db
        .update(calculationRuns)
        .set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(calculationRuns.id, run.id))

      await eventBus.publish(
        createEvent(CALCULATION_RUN_FAILED, tenantId, { calculationRunId: run.id, periodId: input.periodId }),
      )

      throw err
    }
  }

  private async calculateParticipant(
    tenantId: string,
    participantId: string,
    calculationRunId: string,
    periodId: string,
    planVersionId: string,
    planComponents: Array<{ id: string; name: string; formulaId: string | null; config: unknown }>,
    ctx: AuditContext,
  ) {
    // Load credits for this participant in this period
    const participantCredits = await this.db
      .select()
      .from(credits)
      .where(
        and(
          eq(credits.tenantId, tenantId),
          eq(credits.participantId, participantId),
          eq(credits.periodId, periodId),
        ),
      )

    // Load quota for attainment
    const participantQuota = await this.db
      .select()
      .from(quotas)
      .where(
        and(
          eq(quotas.tenantId, tenantId),
          eq(quotas.participantId, participantId),
          eq(quotas.periodId, periodId),
          eq(quotas.planVersionId, planVersionId),
        ),
      )

    const quotaAmountCents = participantQuota.reduce((sum, q) => sum + q.amount, 0)

    const lineItems: PayoutLineItem[] = []
    let grossPayoutCents = 0

    for (const component of planComponents) {
      // Sum credits for this component
      const componentCredits = participantCredits.filter((c) => c.componentId === component.id)
      const creditedAmountCents = componentCredits.reduce((sum, c) => sum + c.amountCents, 0)

      // Compute attainment
      const attainmentPct = quotaAmountCents > 0 ? creditedAmountCents / quotaAmountCents : 0

      // Resolve formula
      const formulaId = component.formulaId ?? 'builtin.flat-rate'
      const config = (component.config as Record<string, unknown>) ?? {}

      let payoutCents = 0
      let explanation = 'No formula result'

      if (rulesEngine.has(formulaId)) {
        const result = await rulesEngine.evaluate(formulaId, {
          attainmentPct,
          creditedAmountCents,
          quotaAmountCents,
          config,
        })
        payoutCents = result.payoutCents
        explanation = result.explanation
      } else {
        explanation = `Formula '${formulaId}' not registered — payout is 0`
      }

      grossPayoutCents += payoutCents
      lineItems.push({
        componentId: component.id,
        componentName: component.name,
        creditedAmountCents,
        quotaAmountCents,
        attainmentPct,
        payoutCents,
        formulaId,
        explanation,
      })
    }

    // Write payout
    const [payout] = await this.db
      .insert(payouts)
      .values({
        tenantId,
        calculationRunId,
        participantId,
        periodId,
        planVersionId,
        grossAmountCents: grossPayoutCents,
        adjustedAmountCents: grossPayoutCents, // no adjustments yet
        currency: 'USD',
        status: 'pending',
        lineItems,
      })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'payout',
      entityId: payout.id,
      action: 'calculated',
      after: {
        participantId,
        grossAmountCents: grossPayoutCents,
        lineItemCount: lineItems.length,
      },
    })

    return payout
  }

  async getPayoutsForRun(tenantId: string, calculationRunId: string) {
    return this.db
      .select()
      .from(payouts)
      .where(and(eq(payouts.tenantId, tenantId), eq(payouts.calculationRunId, calculationRunId)))
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class CalculationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CalculationError'
  }
}
