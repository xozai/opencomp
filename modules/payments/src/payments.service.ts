import { eq, and, isNull } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import {
  earningsResults,
  paymentBalances,
  paymentStatements,
  calcExceptions,
} from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'

// ─── Service ──────────────────────────────────────────────────────────────────

export class PaymentsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async calculatePayments(
    tenantId: string,
    calculationRunId: string,
    periodId: string,
    _planVersionId: string,
    ctx: AuditContext,
  ): Promise<{ statementsGenerated: number }> {
    // 1. Load all earnings_results for this calculationRunId
    const allEarningsResults = await this.db
      .select()
      .from(earningsResults)
      .where(
        and(
          eq(earningsResults.tenantId, tenantId),
          eq(earningsResults.calculationRunId, calculationRunId),
        ),
      )

    // 2. Group by participantId
    const byParticipant = new Map<string, typeof allEarningsResults>()
    for (const er of allEarningsResults) {
      if (!byParticipant.has(er.participantId)) byParticipant.set(er.participantId, [])
      byParticipant.get(er.participantId)!.push(er)
    }

    let statementsGenerated = 0

    // 3. For each participant
    for (const [participantId, earningsForParticipant] of byParticipant) {
      let totalEarningsCents = 0
      let totalOpeningBalanceCents = 0
      let totalClosingBalanceCents = 0
      const lineItems: unknown[] = []

      for (const er of earningsForParticipant) {
        // Find prior period's payment_balance (closing balance becomes opening balance)
        // In practice we'd look up the prior period; for now opening balance = 0
        const openingBalanceCents = 0
        const earningsCents = er.cappedEarningsCents
        const closingBalanceCents = openingBalanceCents + earningsCents

        // Write payment_balance
        await this.db
          .insert(paymentBalances)
          .values({
            tenantId,
            participantId,
            componentId: er.componentId,
            periodId,
            openingBalanceCents,
            earningsCents,
            paidCents: 0,
            closingBalanceCents,
            drawRecoveryCents: 0,
            currency: 'USD',
            status: 'pending',
          })
          .onConflictDoUpdate({
            target: [
              paymentBalances.tenantId,
              paymentBalances.participantId,
              paymentBalances.componentId,
              paymentBalances.periodId,
            ],
            set: {
              earningsCents,
              closingBalanceCents,
              updatedAt: new Date(),
            },
          })

        totalEarningsCents += earningsCents
        totalOpeningBalanceCents += openingBalanceCents
        totalClosingBalanceCents += closingBalanceCents

        lineItems.push({
          componentId: er.componentId,
          earningsCents,
          openingBalanceCents,
          closingBalanceCents,
          attainmentPct: er.attainmentPct,
        })
      }

      // Write payment_statement
      const [statement] = await this.db
        .insert(paymentStatements)
        .values({
          tenantId,
          participantId,
          periodId,
          calculationRunId,
          totalEarningsCents,
          totalPaidCents: 0,
          totalOpeningBalanceCents,
          totalClosingBalanceCents,
          currency: 'USD',
          status: 'draft',
          lineItems,
        })
        .onConflictDoUpdate({
          target: [paymentStatements.tenantId, paymentStatements.participantId, paymentStatements.periodId, paymentStatements.calculationRunId],
          set: {
            totalEarningsCents,
            totalClosingBalanceCents,
            lineItems,
            updatedAt: new Date(),
          },
        })
        .returning()

      await this.audit.recordSafe({
        ctx,
        entityType: 'payment_statement',
        entityId: statement!.id,
        action: 'generated',
        after: { participantId, totalEarningsCents },
      })

      statementsGenerated++
    }

    return { statementsGenerated }
  }

  async getPayments(
    tenantId: string,
    filters: { participantId?: string; periodId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(paymentBalances)
      .where(eq(paymentBalances.tenantId, tenantId))

    return all.filter((b) => {
      if (filters.participantId && b.participantId !== filters.participantId) return false
      if (filters.periodId && b.periodId !== filters.periodId) return false
      return true
    })
  }

  async getStatement(tenantId: string, participantId: string, periodId: string) {
    const [statement] = await this.db
      .select()
      .from(paymentStatements)
      .where(
        and(
          eq(paymentStatements.tenantId, tenantId),
          eq(paymentStatements.participantId, participantId),
          eq(paymentStatements.periodId, periodId),
        ),
      )
      .limit(1)

    if (!statement) throw new PaymentError('NOT_FOUND', 'Payment statement not found')
    return statement
  }

  async approveStatement(
    tenantId: string,
    statementId: string,
    approvedById: string,
    ctx: AuditContext,
  ) {
    const [statement] = await this.db
      .select()
      .from(paymentStatements)
      .where(and(eq(paymentStatements.tenantId, tenantId), eq(paymentStatements.id, statementId)))
      .limit(1)

    if (!statement) throw new PaymentError('NOT_FOUND', 'Payment statement not found')

    // Check no unresolved calc_exceptions for this participant + run
    const unresolvedExceptions = await this.db
      .select()
      .from(calcExceptions)
      .where(
        and(
          eq(calcExceptions.tenantId, tenantId),
          eq(calcExceptions.calculationRunId, statement.calculationRunId),
          eq(calcExceptions.participantId, statement.participantId),
          eq(calcExceptions.status, 'open'),
        ),
      )

    if (unresolvedExceptions.length > 0) {
      throw new PaymentError(
        'UNRESOLVED_EXCEPTIONS',
        `Cannot approve: ${unresolvedExceptions.length} unresolved exceptions`,
      )
    }

    const [updated] = await this.db
      .update(paymentStatements)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedById,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentStatements.tenantId, tenantId), eq(paymentStatements.id, statementId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'payment_statement',
      entityId: statementId,
      action: 'approved',
      after: { approvedById, status: 'approved' },
    })

    return updated
  }

  async markPaid(
    tenantId: string,
    statementId: string,
    paidById: string,
    ctx: AuditContext,
  ) {
    const [statement] = await this.db
      .select()
      .from(paymentStatements)
      .where(and(eq(paymentStatements.tenantId, tenantId), eq(paymentStatements.id, statementId)))
      .limit(1)

    if (!statement) throw new PaymentError('NOT_FOUND', 'Payment statement not found')
    if (statement.status !== 'approved') {
      throw new PaymentError('INVALID_STATUS', 'Statement must be approved before marking as paid')
    }

    const now = new Date()

    const [updated] = await this.db
      .update(paymentStatements)
      .set({
        status: 'paid',
        paidAt: now,
        paidById,
        updatedAt: now,
      })
      .where(and(eq(paymentStatements.tenantId, tenantId), eq(paymentStatements.id, statementId)))
      .returning()

    // Update payment_balances for each component
    const balances = await this.db
      .select()
      .from(paymentBalances)
      .where(
        and(
          eq(paymentBalances.tenantId, tenantId),
          eq(paymentBalances.participantId, statement.participantId),
          eq(paymentBalances.periodId, statement.periodId),
          isNull(paymentBalances.paidAt),
        ),
      )

    for (const balance of balances) {
      await this.db
        .update(paymentBalances)
        .set({
          paidCents: balance.earningsCents,
          paidAt: now,
          lockedAt: now,
          status: 'paid',
          updatedAt: now,
        })
        .where(and(eq(paymentBalances.tenantId, tenantId), eq(paymentBalances.id, balance.id)))
    }

    await this.audit.recordSafe({
      ctx,
      entityType: 'payment_statement',
      entityId: statementId,
      action: 'paid',
      after: { paidById, status: 'paid' },
    })

    return updated
  }

  async restateEarnings(
    tenantId: string,
    calculationRunId: string,
    periodId: string,
    _planVersionId: string,
    ctx: AuditContext,
  ) {
    // Load new earnings results (from the new calculation run)
    const newEarningsResults = await this.db
      .select()
      .from(earningsResults)
      .where(
        and(
          eq(earningsResults.tenantId, tenantId),
          eq(earningsResults.calculationRunId, calculationRunId),
        ),
      )

    for (const er of newEarningsResults) {
      // Load the existing balance for this participant+component+period
      const [existingBalance] = await this.db
        .select()
        .from(paymentBalances)
        .where(
          and(
            eq(paymentBalances.tenantId, tenantId),
            eq(paymentBalances.participantId, er.participantId),
            eq(paymentBalances.componentId, er.componentId),
            eq(paymentBalances.periodId, periodId),
          ),
        )
        .limit(1)

      if (!existingBalance) continue

      if (existingBalance.paidAt === null) {
        // Not yet paid — update earnings + closing balance
        const closingBalanceCents = existingBalance.openingBalanceCents + er.cappedEarningsCents
        await this.db
          .update(paymentBalances)
          .set({
            earningsCents: er.cappedEarningsCents,
            closingBalanceCents,
            updatedAt: new Date(),
          })
          .where(and(eq(paymentBalances.tenantId, tenantId), eq(paymentBalances.id, existingBalance.id)))
      } else {
        // Already paid — update earningsCents but set status = 'restated', do NOT touch paidCents
        await this.db
          .update(paymentBalances)
          .set({
            earningsCents: er.cappedEarningsCents,
            status: 'restated',
            updatedAt: new Date(),
          })
          .where(and(eq(paymentBalances.tenantId, tenantId), eq(paymentBalances.id, existingBalance.id)))
      }
    }

    await this.audit.recordSafe({
      ctx,
      entityType: 'payment_balances',
      entityId: calculationRunId,
      action: 'restated',
      after: { calculationRunId, periodId },
    })
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PaymentError'
  }
}
