import { eq, and, isNull, ilike, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { participants, users } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { createEvent } from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateParticipantSchema = z.object({
  employeeId: z.string().max(100).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  title: z.string().max(200).optional(),
  hireDate: z.string().date().optional(),
  metadata: z.record(z.unknown()).default({}),
})
export type CreateParticipantInput = z.infer<typeof CreateParticipantSchema>

export const UpdateParticipantSchema = CreateParticipantSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
  terminationDate: z.string().date().optional(),
})
export type UpdateParticipantInput = z.infer<typeof UpdateParticipantSchema>

export const ListParticipantsQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})
export type ListParticipantsQuery = z.infer<typeof ListParticipantsQuerySchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class ParticipantsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async list(tenantId: string, query: ListParticipantsQuery = { page: 1, pageSize: 20 }) {
    const all = await this.db
      .select()
      .from(participants)
      .where(and(eq(participants.tenantId, tenantId), isNull(participants.deletedAt)))

    let filtered = all

    if (query.status) {
      filtered = filtered.filter((p) => p.status === query.status)
    }

    if (query.search) {
      const q = query.search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.employeeId ?? '').toLowerCase().includes(q),
      )
    }

    const total = filtered.length
    const offset = (query.page - 1) * query.pageSize
    const data = filtered.slice(offset, offset + query.pageSize)

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    }
  }

  async get(tenantId: string, participantId: string) {
    const [participant] = await this.db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tenantId, tenantId),
          eq(participants.id, participantId),
          isNull(participants.deletedAt),
        ),
      )
      .limit(1)

    if (!participant) throw new ParticipantError('NOT_FOUND', 'Participant not found')
    return participant
  }

  async create(tenantId: string, input: CreateParticipantInput, ctx: AuditContext) {
    const data = CreateParticipantSchema.parse(input)

    // Check for duplicate email within tenant
    const [existing] = await this.db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.tenantId, tenantId),
          eq(participants.email, data.email.toLowerCase()),
          isNull(participants.deletedAt),
        ),
      )
      .limit(1)

    if (existing) {
      throw new ParticipantError('DUPLICATE_EMAIL', `A participant with email ${data.email} already exists`)
    }

    const [participant] = await this.db
      .insert(participants)
      .values({
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        status: 'active',
        metadata: data.metadata ?? {},
        ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.hireDate !== undefined ? { hireDate: data.hireDate } : {}),
      })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'participant',
      entityId: participant!.id,
      action: 'created',
      after: { firstName: participant!.firstName, lastName: participant!.lastName, email: participant!.email },
    })

    await eventBus.publish(
      createEvent('participant.created', tenantId, {
        participantId: participant!.id,
        email: participant!.email,
      }),
    )

    return participant
  }

  async update(tenantId: string, participantId: string, input: UpdateParticipantInput, ctx: AuditContext) {
    const existing = await this.get(tenantId, participantId)
    const data = UpdateParticipantSchema.parse(input)

    const [updated] = await this.db
      .update(participants)
      .set({
        updatedAt: new Date(),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.hireDate !== undefined ? { hireDate: data.hireDate } : {}),
        ...(data.terminationDate !== undefined ? { terminationDate: data.terminationDate } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      })
      .where(and(eq(participants.tenantId, tenantId), eq(participants.id, participantId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'participant',
      entityId: participantId,
      action: 'updated',
      before: existing as Record<string, unknown>,
      ...(updated !== undefined ? { after: updated as Record<string, unknown> } : {}),
    })

    return updated
  }

  async terminate(
    tenantId: string,
    participantId: string,
    terminationDate: string,
    ctx: AuditContext,
  ) {
    const existing = await this.get(tenantId, participantId)
    if (existing.status === 'terminated') {
      throw new ParticipantError('ALREADY_TERMINATED', 'Participant is already terminated')
    }

    const [updated] = await this.db
      .update(participants)
      .set({ status: 'terminated', terminationDate, updatedAt: new Date() })
      .where(and(eq(participants.tenantId, tenantId), eq(participants.id, participantId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'participant',
      entityId: participantId,
      action: 'terminated',
      before: { status: existing.status },
      after: { status: 'terminated', terminationDate },
    })

    await eventBus.publish(
      createEvent('participant.terminated', tenantId, { participantId, terminationDate }),
    )

    return updated
  }

  async getUserIdForParticipant(participantId: string): Promise<string | null> {
    const [p] = await this.db
      .select({ userId: participants.userId })
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1)
    return p?.userId ?? null
  }

  async getParticipantForUser(userId: string): Promise<{ id: string } | null> {
    const [p] = await this.db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.userId, userId), isNull(participants.deletedAt)))
      .limit(1)
    return p ?? null
  }

  async softDelete(tenantId: string, participantId: string, ctx: AuditContext) {
    await this.get(tenantId, participantId)

    await this.db
      .update(participants)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(participants.tenantId, tenantId), eq(participants.id, participantId)))

    await this.audit.recordSafe({
      ctx,
      entityType: 'participant',
      entityId: participantId,
      action: 'deleted',
    })
  }
}

export class ParticipantError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ParticipantError'
  }
}
