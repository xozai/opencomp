import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { sourceTransactions, participants } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { TRANSACTION_INGESTED, TRANSACTION_VALIDATED, createEvent } from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const IngestTransactionSchema = z.object({
  externalId: z.string().min(1).max(255),
  source: z.string().min(1).max(100),
  /** ISO date string YYYY-MM-DD */
  transactionDate: z.string().date(),
  amountCents: z.number().int(),
  currency: z.string().length(3).default('USD'),
  /** External participant identifier — matched to internal participant */
  participantExternalId: z.string().optional(),
  payload: z.record(z.unknown()),
})
export type IngestTransactionInput = z.infer<typeof IngestTransactionSchema>

export const BulkIngestSchema = z.object({
  source: z.string().min(1).max(100),
  transactions: z.array(IngestTransactionSchema),
})

// ─── Validation rules ─────────────────────────────────────────────────────────

type ValidationRule = (tx: typeof sourceTransactions.$inferSelect) => string | null

const VALIDATION_RULES: ValidationRule[] = [
  (tx) => (tx.amountCents === 0 ? 'Amount cannot be zero' : null),
  (tx) => (!tx.transactionDate ? 'Transaction date is required' : null),
  (tx) => {
    const d = new Date(tx.transactionDate)
    return isNaN(d.getTime()) ? 'Transaction date is invalid' : null
  },
]

// ─── Service ──────────────────────────────────────────────────────────────────

export class TransactionsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async listTransactions(
    tenantId: string,
    filters: { status?: string; source?: string; participantId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(sourceTransactions)
      .where(eq(sourceTransactions.tenantId, tenantId))

    return all.filter((tx) => {
      if (filters.status && tx.status !== filters.status) return false
      if (filters.source && tx.source !== filters.source) return false
      if (filters.participantId && tx.participantId !== filters.participantId) return false
      return true
    })
  }

  async getTransaction(tenantId: string, transactionId: string) {
    const [tx] = await this.db
      .select()
      .from(sourceTransactions)
      .where(and(eq(sourceTransactions.tenantId, tenantId), eq(sourceTransactions.id, transactionId)))
      .limit(1)

    if (!tx) throw new TransactionError('NOT_FOUND', 'Transaction not found')
    return tx
  }

  async ingest(tenantId: string, input: IngestTransactionInput, ctx: AuditContext) {
    const data = IngestTransactionSchema.parse(input)

    // Deduplication — skip if externalId + source already exists for tenant
    const [existing] = await this.db
      .select({ id: sourceTransactions.id, status: sourceTransactions.status })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.tenantId, tenantId),
          eq(sourceTransactions.externalId, data.externalId),
          eq(sourceTransactions.source, data.source),
        ),
      )
      .limit(1)

    if (existing) {
      return { transaction: existing, duplicate: true }
    }

    // Resolve participant from external ID
    let participantId: string | null = null
    if (data.participantExternalId) {
      const [p] = await this.db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.tenantId, tenantId),
            eq(participants.employeeId, data.participantExternalId),
          ),
        )
        .limit(1)
      participantId = p?.id ?? null
    }

    const rows = await this.db
      .insert(sourceTransactions)
      .values({
        tenantId,
        externalId: data.externalId,
        source: data.source,
        participantId,
        transactionDate: data.transactionDate,
        amountCents: data.amountCents,
        currency: data.currency,
        status: 'pending',
        payload: data.payload,
        validationErrors: [],
      })
      .returning()
    const tx = rows[0]!

    await this.audit.recordSafe({
      ctx,
      entityType: 'source_transaction',
      entityId: tx.id,
      action: 'ingested',
      after: { externalId: tx.externalId, source: tx.source, amountCents: tx.amountCents },
    })

    await eventBus.publish(
      createEvent(TRANSACTION_INGESTED, tenantId, {
        transactionId: tx.id,
        externalId: tx.externalId,
        source: tx.source,
      }),
    )

    return { transaction: tx, duplicate: false }
  }

  async bulkIngest(
    tenantId: string,
    inputs: IngestTransactionInput[],
    source: string,
    ctx: AuditContext,
  ) {
    let ingested = 0
    let duplicates = 0
    const errors: Array<{ externalId: string; error: string }> = []

    for (const input of inputs) {
      try {
        const result = await this.ingest(tenantId, { ...input, source }, ctx)
        result.duplicate ? duplicates++ : ingested++
      } catch (err) {
        errors.push({
          externalId: input.externalId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { ingested, duplicates, errors }
  }

  async validate(tenantId: string, transactionId: string, ctx: AuditContext) {
    const tx = await this.getTransaction(tenantId, transactionId)

    if (tx.status !== 'pending') {
      throw new TransactionError('INVALID_STATUS', 'Only pending transactions can be validated')
    }

    // Run validation rules
    const errors = VALIDATION_RULES.map((rule) => rule(tx)).filter(Boolean) as string[]

    // Extra check: participant must be resolved
    if (!tx.participantId) {
      errors.push('Participant could not be resolved from external ID')
    }

    const isValid = errors.length === 0
    const newStatus = isValid ? 'validated' : 'invalid'

    const updateRows = await this.db
      .update(sourceTransactions)
      .set({
        status: newStatus,
        validationErrors: errors,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sourceTransactions.id, transactionId))
      .returning()
    const updated = updateRows[0]!

    await this.audit.recordSafe({
      ctx,
      entityType: 'source_transaction',
      entityId: transactionId,
      action: isValid ? 'validated' : 'validation_failed',
      before: { status: 'pending' },
      after: { status: newStatus, validationErrors: errors },
    })

    await eventBus.publish(
      createEvent(TRANSACTION_VALIDATED, tenantId, {
        transactionId,
        isValid,
        errors,
      }),
    )

    return updated
  }

  /** Validate all pending transactions for a tenant in batch. */
  async validatePending(tenantId: string, ctx: AuditContext) {
    const pending = await this.listTransactions(tenantId, { status: 'pending' })
    let validated = 0
    let invalid = 0

    for (const tx of pending) {
      try {
        const result = await this.validate(tenantId, tx.id, ctx)
        result.status === 'validated' ? validated++ : invalid++
      } catch {
        invalid++
      }
    }

    return { validated, invalid, total: pending.length }
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class TransactionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'TransactionError'
  }
}
