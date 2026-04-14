// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CalculationsService, CalculationError } from './calculations.service'
import { eventBus } from '../../../packages/events/src'
import { rulesEngine } from '../../platform-rules/src/rules-engine'

beforeEach(() => eventBus.reset())

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

const mockRun = {
  id: 'run-1',
  tenantId: 'tenant-1',
  periodId: 'period-1',
  planVersionId: 'pv-1',
  status: 'running',
  triggeredById: 'user-1',
  startedAt: new Date(),
  completedAt: null,
  participantCount: 0,
  errorCount: 0,
  config: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockComponent = {
  id: 'comp-1',
  name: 'Revenue Commission',
  tenantId: 'tenant-1',
  planVersionId: 'pv-1',
  type: 'commission',
  formulaId: 'builtin.flat-rate',
  config: { rate: 0.08 },
  sortOrder: 0,
  measureType: null,
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

const mockQuota = {
  id: 'quota-1',
  tenantId: 'tenant-1',
  participantId: 'part-1',
  planVersionId: 'pv-1',
  periodId: 'period-1',
  type: 'revenue',
  amount: 100_000_00,
  currency: 'USD',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockPayout = {
  id: 'payout-1',
  tenantId: 'tenant-1',
  calculationRunId: 'run-1',
  participantId: 'part-1',
  periodId: 'period-1',
  planVersionId: 'pv-1',
  grossAmountCents: 800_000,
  adjustedAmountCents: 800_000,
  currency: 'USD',
  status: 'pending',
  lineItems: [],
  paidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeMockDb() {
  const mock: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockRun]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
  return mock
}

describe('CalculationsService', () => {
  describe('executeRun', () => {
    it('creates a run and generates payouts', async () => {
      const db = makeMockDb()

      // Sequence of DB calls:
      // 1. insert calculationRun → [mockRun]
      // 2. select components → [mockComponent]
      // 3. select participants → [{ id: 'part-1' }]
      // 4. select credits for participant → [mockCredit]
      // 5. select quotas for participant → [mockQuota]
      // 6. insert payout → [mockPayout]
      // 7. audit insert → []
      // 8. update run to completed → [completedRun]
      // 9. audit insert → []

      const completedRun = { ...mockRun, status: 'completed', participantCount: 1 }

      db.returning
        .mockResolvedValueOnce([mockRun])        // insert run
        .mockResolvedValueOnce([mockPayout])     // insert payout
        .mockResolvedValueOnce([])               // audit payout
        .mockResolvedValueOnce([completedRun])   // update run
        .mockResolvedValueOnce([])               // audit run

      db.where
        .mockResolvedValueOnce([mockComponent])  // components
        .mockResolvedValueOnce([{ id: 'part-1' }]) // participants
        .mockResolvedValueOnce([mockCredit])     // credits
        .mockResolvedValueOnce([mockQuota])      // quotas

      const svc = new CalculationsService(db as any)
      const result = await svc.executeRun('tenant-1', {
        periodId: 'period-1',
        planVersionId: 'pv-1',
      }, ctx)

      expect(result.status).toBe('completed')
      expect(result.participantCount).toBe(1)
    })
  })

  describe('getRun', () => {
    it('throws RUN_NOT_FOUND for unknown run', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([])

      const svc = new CalculationsService(db as any)
      await expect(svc.getRun('tenant-1', 'nonexistent')).rejects.toThrow(CalculationError)
    })
  })
})

describe('Rules engine integration — flat-rate formula', () => {
  it('computes 8% commission on $100k credited = $8,000 payout', async () => {
    const result = await rulesEngine.evaluate('builtin.flat-rate', {
      attainmentPct: 1.0,
      creditedAmountCents: 100_000_00,
      quotaAmountCents: 100_000_00,
      config: { rate: 0.08 },
    })
    expect(result.payoutCents).toBe(800_000) // $8,000
  })
})
