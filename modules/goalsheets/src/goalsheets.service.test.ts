import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GoalSheetsService, GoalSheetError } from './goalsheets.service'
import { eventBus } from '../../../packages/events/src'

beforeEach(() => eventBus.reset())

const mockGoalSheet = {
  id: 'gs-1',
  tenantId: 'tenant-1',
  participantId: 'part-1',
  planVersionId: 'pv-1',
  periodId: 'period-1',
  status: 'draft',
  distributedAt: null,
  acknowledgedAt: null,
  acknowledgedById: null,
  fileId: null,
  data: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockGoalSheet]),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockGoalSheet]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}

describe('GoalSheetsService', () => {
  describe('acknowledge', () => {
    it('acknowledges a distributed goal sheet', async () => {
      const distributed = { ...mockGoalSheet, status: 'distributed' }
      const acknowledged = { ...distributed, status: 'acknowledged', acknowledgedById: 'user-1' }

      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValueOnce([distributed])
      mockDb.returning
        .mockResolvedValueOnce([acknowledged])
        .mockResolvedValueOnce([]) // audit

      const svc = new GoalSheetsService(mockDb as any)

      const events: string[] = []
      eventBus.subscribe('goalsheet.acknowledged', () => { events.push('ack') })

      const result = await svc.acknowledge('tenant-1', 'gs-1', 'user-1', ctx)
      expect(result.status).toBe('acknowledged')
      expect(events).toHaveLength(1)
    })

    it('throws if goal sheet is not distributed', async () => {
      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValueOnce([mockGoalSheet]) // status: draft

      const svc = new GoalSheetsService(mockDb as any)
      await expect(svc.acknowledge('tenant-1', 'gs-1', 'user-1', ctx))
        .rejects.toThrow(GoalSheetError)
    })
  })

  describe('distribute', () => {
    it('distributes a draft goal sheet and fires event', async () => {
      const distributed = { ...mockGoalSheet, status: 'distributed' }
      const mockDb = makeMockDb()
      mockDb.limit.mockResolvedValue([mockGoalSheet])
      mockDb.returning
        .mockResolvedValue([distributed])

      const svc = new GoalSheetsService(mockDb as any)
      const events: string[] = []
      eventBus.subscribe('goalsheet.distributed', () => events.push('dist'))

      const result = await svc.distribute('tenant-1', ['gs-1'], ctx)
      expect(result).toHaveLength(1)
      expect(events).toHaveLength(1)
    })
  })
})
