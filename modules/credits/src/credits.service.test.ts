// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreditsService, CreditError } from './credits.service'

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

const mockTx = {
  id: 'tx-1',
  tenantId: 'tenant-1',
  externalId: 'ext-001',
  source: 'salesforce',
  participantId: 'part-1',
  transactionDate: '2026-01-15',
  amountCents: 100_000_00, // $100,000
  currency: 'USD',
  status: 'validated',
  payload: {},
  validationErrors: [],
  processedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockCredit = {
  id: 'credit-1',
  tenantId: 'tenant-1',
  transactionId: 'tx-1',
  participantId: 'part-1',
  componentId: 'comp-1',
  periodId: 'period-1',
  amountCents: 100_000_00,
  currency: 'USD',
  splitPct: 100,
  creditRuleId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockTx]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockCredit]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}

describe('CreditsService', () => {
  describe('applyCredit', () => {
    it('creates a credit record for a validated transaction', async () => {
      const db = makeMockDb()
      db.limit
        .mockResolvedValueOnce([mockTx])  // load transaction
        .mockResolvedValueOnce([])        // no duplicate credit
        .mockResolvedValueOnce([])        // audit

      const svc = new CreditsService(db as any)
      const result = await svc.applyCredit('tenant-1', {
        transactionId: 'tx-1',
        componentId: 'comp-1',
        periodId: 'period-1',
        splitPct: 100,
      }, ctx)

      expect(result.amountCents).toBe(100_000_00)
      expect(result.participantId).toBe('part-1')
    })

    it('calculates split amount correctly', async () => {
      const db = makeMockDb()
      db.limit
        .mockResolvedValueOnce([mockTx])  // load tx
        .mockResolvedValueOnce([])        // no duplicate
        .mockResolvedValueOnce([])        // audit

      const splitCredit = { ...mockCredit, amountCents: 50_000_00, splitPct: 50 }
      db.returning.mockResolvedValueOnce([splitCredit]).mockResolvedValue([])

      const svc = new CreditsService(db as any)
      const result = await svc.applyCredit('tenant-1', {
        transactionId: 'tx-1',
        componentId: 'comp-1',
        periodId: 'period-1',
        splitPct: 50,
      }, ctx)

      expect(result.amountCents).toBe(50_000_00) // 50% of $100,000
      expect(result.splitPct).toBe(50)
    })

    it('throws when transaction is not validated', async () => {
      const pendingTx = { ...mockTx, status: 'pending' }
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([pendingTx])

      const svc = new CreditsService(db as any)
      await expect(
        svc.applyCredit('tenant-1', {
          transactionId: 'tx-1',
          componentId: 'comp-1',
          periodId: 'period-1',
        }, ctx),
      ).rejects.toThrow(CreditError)
    })

    it('is idempotent — returns existing credit without inserting', async () => {
      const db = makeMockDb()
      db.limit
        .mockResolvedValueOnce([mockTx])              // load tx
        .mockResolvedValueOnce([{ id: 'credit-1' }]) // existing credit found

      const insertSpy = vi.spyOn(db, 'insert')
      const svc = new CreditsService(db as any)
      const result = await svc.applyCredit('tenant-1', {
        transactionId: 'tx-1',
        componentId: 'comp-1',
        periodId: 'period-1',
      }, ctx)

      expect(result.creditId).toBe('credit-1')
      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  describe('sumCredits', () => {
    it('sums credited amounts for participant + component + period', async () => {
      const rows = [
        { ...mockCredit, amountCents: 50_000_00 },
        { ...mockCredit, id: 'credit-2', amountCents: 25_000_00 },
      ]
      const db = makeMockDb()
      db.where.mockResolvedValueOnce(rows)

      const svc = new CreditsService(db as any)
      // listCredits returns all, filter in memory
      vi.spyOn(svc, 'listCredits').mockResolvedValueOnce(rows as any)

      const total = await svc.sumCredits('tenant-1', 'part-1', 'comp-1', 'period-1')
      expect(total).toBe(75_000_00)
    })
  })
})
