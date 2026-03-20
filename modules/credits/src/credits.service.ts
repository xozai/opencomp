import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { credits, sourceTransactions, components, planVersions } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ApplyCreditSchema = z.object({
  transactionId: z.string().uuid(),
  componentId: z.string().uuid(),
  periodId: z.string().uuid(),
  /** Override participant — defaults to transaction.participantId */
  participantId: z.string().uuid().optional(),
  /** Split percentage 0–100, defaults to 100 */
  splitPct: z.number().min(0).max(100).default(100),
  creditRuleId: z.string().optional(),
})
export type ApplyCreditInput = z.infer<typeof ApplyCreditSchema>

// ─── Crediting result ──────────────────────────────────────────────────────────

export interface CreditResult {
  creditId: string
  participantId: string
  componentId: string
  amountCents: number
  splitPct: number
  creditRuleId: string | null
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CreditsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listCredits(
    tenantId: string,
    filters: { periodId?: string; participantId?: string; componentId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(credits)
      .where(eq(credits.tenantId, tenantId))

    return all.filter((c) => {
      if (filters.periodId && c.periodId !== filters.periodId) return false
      if (filters.participantId && c.participantId !== filters.participantId) return false
      if (filters.componentId && c.componentId !== filters.componentId) return false
      return true
    })
  }

  /**
   * Apply a credit rule to a single validated transaction.
   * Produces one credit record per (participant, component, period).
   *
   * For split credit (overlay reps, partner deals), pass splitPct < 100.
   * Multiple calls with splitPct values summing to 100 model full split credit.
   */
  async applyCredit(tenantId: string, input: ApplyCreditInput, ctx: AuditContext): Promise<CreditResult> {
    const data = ApplyCreditSchema.parse(input)

    // Load transaction
    const [tx] = await this.db
      .select()
      .from(sourceTransactions)
      .where(and(eq(sourceTransactions.tenantId, tenantId), eq(sourceTransactions.id, data.transactionId)))
      .limit(1)

    if (!tx) throw new CreditError('TX_NOT_FOUND', 'Source transaction not found')
    if (tx.status !== 'validated') {
      throw new CreditError('TX_NOT_VALIDATED', 'Transaction must be validated before crediting')
    }

    const participantId = data.participantId ?? tx.participantId
    if (!participantId) {
      throw new CreditError('NO_PARTICIPANT', 'Transaction has no participant and none was provided')
    }

    // Calculate credited amount with split
    const amountCents = Math.round((tx.amountCents * data.splitPct) / 100)

    // Idempotent — skip if credit already exists for this tx + component + participant
    const [existing] = await this.db
      .select({ id: credits.id })
      .from(credits)
      .where(
        and(
          eq(credits.tenantId, tenantId),
          eq(credits.transactionId, data.transactionId),
          eq(credits.componentId, data.componentId),
          eq(credits.participantId, participantId),
        ),
      )
      .limit(1)

    if (existing) {
      return {
        creditId: existing.id,
        participantId,
        componentId: data.componentId,
        amountCents,
        splitPct: data.splitPct,
        creditRuleId: data.creditRuleId ?? null,
      }
    }

    const [credit] = await this.db
      .insert(credits)
      .values({
        tenantId,
        transactionId: data.transactionId,
        participantId,
        componentId: data.componentId,
        periodId: data.periodId,
        amountCents,
        currency: tx.currency,
        splitPct: data.splitPct,
        creditRuleId: data.creditRuleId ?? null,
        metadata: {},
      })
      .returning()

    // Mark transaction as credited
    await this.db
      .update(sourceTransactions)
      .set({ status: 'credited', updatedAt: new Date() })
      .where(eq(sourceTransactions.id, data.transactionId))

    await this.audit.recordSafe({
      ctx,
      entityType: 'credit',
      entityId: credit.id,
      action: 'applied',
      after: {
        transactionId: data.transactionId,
        participantId,
        componentId: data.componentId,
        amountCents,
        splitPct: data.splitPct,
      },
    })

    return {
      creditId: credit.id,
      participantId,
      componentId: data.componentId,
      amountCents,
      splitPct: data.splitPct,
      creditRuleId: data.creditRuleId ?? null,
    }
  }

  /**
   * Auto-credit all validated transactions in a period using plan version components.
   * Uses the default crediting strategy: 100% credit to transaction.participantId.
   * Custom strategies are provided via plugins (CreditingStrategyExtension).
   */
  async creditPeriod(
    tenantId: string,
    periodId: string,
    planVersionId: string,
    ctx: AuditContext,
  ) {
    // Load validated transactions
    const validatedTxs = await this.db
      .select()
      .from(sourceTransactions)
      .where(and(eq(sourceTransactions.tenantId, tenantId), eq(sourceTransactions.status, 'validated')))

    // Load components for this plan version
    const planComponents = await this.db
      .select()
      .from(components)
      .where(and(eq(components.tenantId, tenantId), eq(components.planVersionId, planVersionId)))

    if (planComponents.length === 0) {
      throw new CreditError('NO_COMPONENTS', 'Plan version has no components to credit against')
    }

    let credited = 0
    let skipped = 0
    const errors: Array<{ transactionId: string; error: string }> = []

    for (const tx of validatedTxs) {
      for (const component of planComponents) {
        try {
          await this.applyCredit(
            tenantId,
            {
              transactionId: tx.id,
              componentId: component.id,
              periodId,
              splitPct: 100,
            },
            ctx,
          )
          credited++
        } catch (err) {
          if (err instanceof CreditError && err.code === 'TX_NOT_VALIDATED') {
            skipped++
          } else {
            errors.push({
              transactionId: tx.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }

    return { credited, skipped, errors, total: validatedTxs.length }
  }

  /** Sum total credited amount for a participant in a period and component. */
  async sumCredits(
    tenantId: string,
    participantId: string,
    componentId: string,
    periodId: string,
  ): Promise<number> {
    const rows = await this.listCredits(tenantId, { participantId, componentId, periodId })
    return rows.reduce((sum, c) => sum + c.amountCents, 0)
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class CreditError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CreditError'
  }
}
