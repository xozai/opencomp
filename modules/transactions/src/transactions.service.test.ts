import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TransactionsService, TransactionError } from './transactions.service'
import { eventBus } from '../../../packages/events/src'

beforeEach(() => eventBus.reset())

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

const mockTx = {
  id: 'tx-1',
  tenantId: 'tenant-1',
  externalId: 'ext-001',
  source: 'salesforce',
  participantId: 'part-1',
  transactionDate: '2026-01-15',
  amountCents: 50_000_00,
  currency: 'USD',
  status: 'pending',
  payload: {},
  validationErrors: [],
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeMockDb(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockTx]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

describe('TransactionsService', () => {
  describe('ingest', () => {
    it('creates a new transaction', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([{ id: 'part-1' }]) // participant lookup
        .mockResolvedValueOnce([]) // audit
      db.returning.mockResolvedValueOnce([mockTx]).mockResolvedValueOnce([]) // insert + audit

      const svc = new TransactionsService(db as any)
      const result = await svc.ingest('tenant-1', {
        externalId: 'ext-001',
        source: 'salesforce',
        transactionDate: '2026-01-15',
        amountCents: 50_000_00,
        currency: 'USD',
        payload: {},
      }, ctx)

      expect(result.duplicate).toBe(false)
      expect(result.transaction.externalId).toBe('ext-001')
    })

    it('returns duplicate flag for existing externalId', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([{ id: 'tx-1', status: 'pending' }]) // duplicate found

      const svc = new TransactionsService(db as any)
      const result = await svc.ingest('tenant-1', {
        externalId: 'ext-001',
        source: 'salesforce',
        transactionDate: '2026-01-15',
        amountCents: 50_000_00,
        currency: 'USD',
        payload: {},
      }, ctx)

      expect(result.duplicate).toBe(true)
    })

    it('fires TRANSACTION_INGESTED event', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValue([])
      db.returning.mockResolvedValue([mockTx])

      const events: string[] = []
      eventBus.subscribe('transaction.ingested', () => events.push('ingested'))

      const svc = new TransactionsService(db as any)
      await svc.ingest('tenant-1', {
        externalId: 'ext-new',
        source: 'salesforce',
        transactionDate: '2026-01-15',
        amountCents: 1000,
        currency: 'USD',
        payload: {},
      }, ctx)

      expect(events).toHaveLength(1)
    })
  })

  describe('validate', () => {
    it('validates a pending transaction with participant', async () => {
      const validTx = { ...mockTx, participantId: 'part-1' }
      const validatedTx = { ...validTx, status: 'validated', validationErrors: [] }

      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([validTx])
      db.returning.mockResolvedValueOnce([validatedTx]).mockResolvedValueOnce([])

      const svc = new TransactionsService(db as any)
      const result = await svc.validate('tenant-1', 'tx-1', ctx)
      expect(result.status).toBe('validated')
    })

    it('marks transaction invalid when participant is missing', async () => {
      const unlinkedTx = { ...mockTx, participantId: null }
      const invalidTx = { ...unlinkedTx, status: 'invalid', validationErrors: ['Participant could not be resolved from external ID'] }

      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([unlinkedTx])
      db.returning.mockResolvedValueOnce([invalidTx]).mockResolvedValueOnce([])

      const svc = new TransactionsService(db as any)
      const result = await svc.validate('tenant-1', 'tx-1', ctx)
      expect(result.status).toBe('invalid')
    })

    it('throws if transaction is not pending', async () => {
      const creditedTx = { ...mockTx, status: 'credited' }
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([creditedTx])

      const svc = new TransactionsService(db as any)
      await expect(svc.validate('tenant-1', 'tx-1', ctx)).rejects.toThrow(TransactionError)
    })
  })
})
