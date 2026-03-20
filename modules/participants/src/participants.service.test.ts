import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ParticipantsService, ParticipantError } from './participants.service'
import { eventBus } from '../../../packages/events/src'

beforeEach(() => eventBus.reset())

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', actorType: 'user' as const }

const mockParticipant = {
  id: 'part-1',
  tenantId: 'tenant-1',
  userId: null,
  employeeId: 'EMP001',
  firstName: 'Alice',
  lastName: 'Chen',
  email: 'alice.chen@acme.com',
  title: 'Account Executive',
  status: 'active',
  hireDate: '2024-01-15',
  terminationDate: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockParticipant]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockParticipant]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}

describe('ParticipantsService', () => {
  describe('create', () => {
    it('creates a new participant', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([])  // no duplicate
        .mockResolvedValueOnce([])        // audit

      const svc = new ParticipantsService(db as any)
      const result = await svc.create('tenant-1', {
        firstName: 'Alice',
        lastName: 'Chen',
        email: 'alice.chen@acme.com',
        metadata: {},
      }, ctx)

      expect(result.firstName).toBe('Alice')
    })

    it('throws DUPLICATE_EMAIL for existing email', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([{ id: 'existing-part' }]) // duplicate found

      const svc = new ParticipantsService(db as any)
      await expect(
        svc.create('tenant-1', {
          firstName: 'Alice',
          lastName: 'Chen',
          email: 'alice.chen@acme.com',
          metadata: {},
        }, ctx),
      ).rejects.toThrow(ParticipantError)
    })

    it('fires participant.created event', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValue([])
      db.returning.mockResolvedValue([mockParticipant])

      const events: string[] = []
      eventBus.subscribe('participant.created', () => events.push('created'))

      const svc = new ParticipantsService(db as any)
      await svc.create('tenant-1', {
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob@acme.com',
        metadata: {},
      }, ctx)

      expect(events).toHaveLength(1)
    })
  })

  describe('terminate', () => {
    it('sets status to terminated', async () => {
      const terminated = { ...mockParticipant, status: 'terminated', terminationDate: '2026-03-31' }
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([mockParticipant])
      db.returning.mockResolvedValueOnce([terminated]).mockResolvedValue([])

      const svc = new ParticipantsService(db as any)
      const result = await svc.terminate('tenant-1', 'part-1', '2026-03-31', ctx)
      expect(result.status).toBe('terminated')
    })

    it('throws if already terminated', async () => {
      const db = makeMockDb()
      db.limit.mockResolvedValueOnce([{ ...mockParticipant, status: 'terminated' }])

      const svc = new ParticipantsService(db as any)
      await expect(svc.terminate('tenant-1', 'part-1', '2026-03-31', ctx))
        .rejects.toThrow(ParticipantError)
    })
  })

  describe('list', () => {
    it('returns paginated results', async () => {
      const db = makeMockDb()
      db.where.mockResolvedValueOnce([mockParticipant, { ...mockParticipant, id: 'part-2' }])

      const svc = new ParticipantsService(db as any)
      // list calls select().from().where() chain, returns array
      vi.spyOn(svc, 'list').mockResolvedValueOnce({
        data: [mockParticipant],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })

      const result = await svc.list('tenant-1')
      expect(result.data).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })
})
