import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlansService, PlanError } from './plans.service'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPlan = {
  id: 'plan-1',
  tenantId: 'tenant-1',
  name: 'Q1 2026 AE Plan',
  status: 'draft',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  currency: 'USD',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const mockVersion = {
  id: 'version-1',
  tenantId: 'tenant-1',
  planId: 'plan-1',
  version: 1,
  status: 'draft',
  definition: {},
  publishedAt: null,
  publishedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeMockDb(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockPlan]),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockPlan]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlansService', () => {
  describe('createPlan', () => {
    it('creates a plan and initial version', async () => {
      const mockDb = makeMockDb()
      mockDb.returning
        .mockResolvedValueOnce([mockPlan])    // plans insert
        .mockResolvedValueOnce([mockVersion]) // planVersions insert
        .mockResolvedValueOnce([])            // audit insert

      const svc = new PlansService(mockDb as any)
      const result = await svc.createPlan('tenant-1', {
        name: 'Q1 2026 AE Plan',
        effectiveFrom: '2026-01-01',
      }, ctx)

      expect(result.plan.name).toBe('Q1 2026 AE Plan')
      expect(result.version).toBeDefined()
    })
  })

  describe('submitPlanForApproval', () => {
    it('transitions draft plan to pending_approval', async () => {
      const pendingPlan = { ...mockPlan, status: 'pending_approval' }
      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValueOnce([mockPlan]) // getPlan
      mockDb.returning
        .mockResolvedValueOnce([pendingPlan])  // update
        .mockResolvedValueOnce([])             // audit

      const svc = new PlansService(mockDb as any)
      const result = await svc.submitPlanForApproval('tenant-1', 'plan-1', ctx)
      expect(result.status).toBe('pending_approval')
    })

    it('throws if plan is not in draft status', async () => {
      const activePlan = { ...mockPlan, status: 'active' }
      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValueOnce([activePlan])

      const svc = new PlansService(mockDb as any)
      await expect(svc.submitPlanForApproval('tenant-1', 'plan-1', ctx))
        .rejects.toThrow(PlanError)
    })
  })

  describe('getPlan', () => {
    it('throws PLAN_NOT_FOUND when plan does not exist', async () => {
      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValueOnce([])

      const svc = new PlansService(mockDb as any)
      await expect(svc.getPlan('tenant-1', 'nonexistent')).rejects.toThrow(PlanError)
    })
  })
})
