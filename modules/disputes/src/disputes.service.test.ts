import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DisputesService, DisputeError } from './disputes.service'
import { eventBus } from '../../../packages/events/src'

beforeEach(() => eventBus.reset())

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

const mockDispute = {
  id: 'dispute-1',
  tenantId: 'tenant-1',
  payoutId: 'payout-1',
  transactionId: null,
  participantId: 'part-1',
  openedById: 'user-2',
  assignedToId: null,
  status: 'open',
  subject: 'Missing Q1 commission',
  description: 'My January close was not credited correctly.',
  requestedAmountCents: 50000,
  requestedCurrency: 'USD',
  resolvedAmountCents: null,
  resolvedCurrency: null,
  resolvedAt: null,
  resolvedById: null,
  resolutionNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockApproval = {
  id: 'approval-1',
  tenantId: 'tenant-1',
  workflowType: 'dispute_resolution',
  entityType: 'dispute',
  entityId: 'dispute-1',
  requestedById: 'user-2',
  assignedToId: null,
  status: 'pending',
  dueAt: null,
  decidedAt: null,
  decidedById: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockDispute]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn()
      .mockResolvedValueOnce([mockDispute])   // insert dispute
      .mockResolvedValueOnce([])              // audit
      .mockResolvedValueOnce([mockApproval])  // insert approval
      .mockResolvedValue([]),                 // audit + more
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}

describe('DisputesService', () => {
  describe('openDispute', () => {
    it('creates dispute and approval request', async () => {
      const db = makeMockDb()
      const svc = new DisputesService(db as any)

      const events: string[] = []
      eventBus.subscribe('dispute.opened', () => events.push('opened'))
      eventBus.subscribe('approval.requested', () => events.push('approval'))

      const result = await svc.openDispute('tenant-1', {
        participantId: 'part-1',
        subject: 'Missing commission',
        description: 'January close not credited.',
        payoutId: 'payout-1',
      }, 'user-2', ctx)

      expect(result.dispute.subject).toBe('Missing Q1 commission')
      expect(result.approvalRequest).toBeDefined()
      expect(events).toContain('opened')
      expect(events).toContain('approval')
    })
  })

  describe('resolveDispute', () => {
    it('resolves an open dispute as approved', async () => {
      const resolvedDispute = { ...mockDispute, status: 'resolved_approved', resolvedAmountCents: 50000 }
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([mockDispute])
      db.returning.mockResolvedValueOnce([resolvedDispute]).mockResolvedValue([])

      const svc = new DisputesService(db as any)
      const events: string[] = []
      eventBus.subscribe('dispute.resolved', () => events.push('resolved'))

      const result = await svc.resolveDispute('tenant-1', 'dispute-1', {
        resolution: 'approved',
        resolvedAmountCents: 50000,
        resolvedCurrency: 'USD',
        resolutionNotes: 'Confirmed missing credit applied.',
      }, 'user-1', ctx)

      expect(result.status).toBe('resolved_approved')
      expect(events).toContain('resolved')
    })

    it('throws for already-resolved dispute', async () => {
      const resolvedDispute = { ...mockDispute, status: 'resolved_approved' }
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([resolvedDispute])

      const svc = new DisputesService(db as any)
      await expect(
        svc.resolveDispute('tenant-1', 'dispute-1', { resolution: 'denied' }, 'user-1', ctx),
      ).rejects.toThrow(DisputeError)
    })
  })

  describe('getDispute', () => {
    it('throws NOT_FOUND for unknown dispute', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([])

      const svc = new DisputesService(db as any)
      await expect(svc.getDispute('tenant-1', 'nonexistent')).rejects.toThrow(DisputeError)
    })
  })
})
