import { eq, and, or, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { positions, positionRelationships } from '../../../apps/api/src/db/schema'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreatePositionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['rep', 'overlay', 'manager', 'executive']),
  parentPositionId: z.string().uuid().optional(),
  participantId: z.string().uuid().optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type CreatePositionInput = z.infer<typeof CreatePositionSchema>

export const UpdatePositionSchema = CreatePositionSchema.partial()
export type UpdatePositionInput = z.infer<typeof UpdatePositionSchema>

export const CreateRelationshipSchema = z.object({
  fromPositionId: z.string().uuid(),
  toPositionId: z.string().uuid(),
  relationshipType: z.enum(['reports_to', 'overlay_on', 'inherits_from']),
  splitPct: z.number().int().min(0).max(100).optional(),
})
export type CreateRelationshipInput = z.infer<typeof CreateRelationshipSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class PositionsService {
  constructor(private db: Db) {}

  async listPositions(tenantId: string, filters: { type?: string } = {}) {
    const all = await this.db
      .select()
      .from(positions)
      .where(and(eq(positions.tenantId, tenantId), isNull(positions.deletedAt)))

    return all.filter((p) => {
      if (filters.type && p.type !== filters.type) return false
      return true
    })
  }

  async getPosition(tenantId: string, id: string) {
    const [position] = await this.db
      .select()
      .from(positions)
      .where(and(eq(positions.tenantId, tenantId), eq(positions.id, id), isNull(positions.deletedAt)))
      .limit(1)

    if (!position) throw new PositionError('NOT_FOUND', 'Position not found')
    return position
  }

  async createPosition(tenantId: string, input: CreatePositionInput) {
    const data = CreatePositionSchema.parse(input)

    const [position] = await this.db
      .insert(positions)
      .values({
        tenantId,
        name: data.name,
        type: data.type,
        parentPositionId: data.parentPositionId ?? null,
        participantId: data.participantId ?? null,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        metadata: data.metadata ?? {},
      })
      .returning()

    return position
  }

  async updatePosition(tenantId: string, id: string, input: UpdatePositionInput) {
    await this.getPosition(tenantId, id)
    const data = UpdatePositionSchema.parse(input)

    const [updated] = await this.db
      .update(positions)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.parentPositionId !== undefined ? { parentPositionId: data.parentPositionId } : {}),
        ...(data.participantId !== undefined ? { participantId: data.participantId } : {}),
        ...(data.effectiveFrom !== undefined ? { effectiveFrom: data.effectiveFrom } : {}),
        ...(data.effectiveTo !== undefined ? { effectiveTo: data.effectiveTo } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(positions.tenantId, tenantId), eq(positions.id, id)))
      .returning()

    return updated
  }

  async getHierarchy(tenantId: string, positionId: string, depth = 0): Promise<{
    position: typeof positions.$inferSelect
    parent?: typeof positions.$inferSelect
    children: typeof positions.$inferSelect[]
  }> {
    if (depth > 10) throw new PositionError('MAX_DEPTH', 'Maximum hierarchy depth exceeded')

    const position = await this.getPosition(tenantId, positionId)

    // Load parent
    let parent: typeof positions.$inferSelect | undefined
    if (position.parentPositionId) {
      const [p] = await this.db
        .select()
        .from(positions)
        .where(and(eq(positions.tenantId, tenantId), eq(positions.id, position.parentPositionId), isNull(positions.deletedAt)))
        .limit(1)
      parent = p
    }

    // Load children
    const children = await this.db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.tenantId, tenantId),
          eq(positions.parentPositionId, positionId),
          isNull(positions.deletedAt),
        ),
      )

    return { position, ...(parent !== undefined ? { parent } : {}), children }
  }

  async createRelationship(tenantId: string, input: CreateRelationshipInput) {
    const data = CreateRelationshipSchema.parse(input)

    const [rel] = await this.db
      .insert(positionRelationships)
      .values({
        tenantId,
        fromPositionId: data.fromPositionId,
        toPositionId: data.toPositionId,
        relationshipType: data.relationshipType,
        splitPct: data.splitPct ?? 100,
      })
      .returning()

    return rel
  }

  async listRelationships(tenantId: string, positionId: string) {
    return this.db
      .select()
      .from(positionRelationships)
      .where(
        and(
          eq(positionRelationships.tenantId, tenantId),
          or(
            eq(positionRelationships.fromPositionId, positionId),
            eq(positionRelationships.toPositionId, positionId),
          ),
        ),
      )
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PositionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PositionError'
  }
}
