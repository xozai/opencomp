import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { measureDefinitions, measureResults } from '../../../apps/api/src/db/schema'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateMeasureDefinitionSchema = z.object({
  planVersionId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  name: z.string().min(1),
  aggregationType: z.enum(['sum', 'count', 'average', 'max', 'min', 'weighted_average']),
  filterConditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).default([]),
  unitType: z.enum(['currency', 'count', 'percentage']).default('currency'),
  currency: z.string().default('USD'),
  naturalLanguageDefinition: z.string().optional(),
  parsedDefinition: z.unknown().optional(),
})
export type CreateMeasureDefinitionInput = z.infer<typeof CreateMeasureDefinitionSchema>

export const UpdateMeasureDefinitionSchema = CreateMeasureDefinitionSchema.partial()
export type UpdateMeasureDefinitionInput = z.infer<typeof UpdateMeasureDefinitionSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class MeasuresService {
  constructor(private db: Db) {}

  async listDefinitions(tenantId: string, planVersionId?: string) {
    const all = await this.db
      .select()
      .from(measureDefinitions)
      .where(eq(measureDefinitions.tenantId, tenantId))

    return planVersionId ? all.filter((d) => d.planVersionId === planVersionId) : all
  }

  async createDefinition(tenantId: string, input: CreateMeasureDefinitionInput) {
    const data = CreateMeasureDefinitionSchema.parse(input)

    const [definition] = await this.db
      .insert(measureDefinitions)
      .values({
        tenantId,
        planVersionId: data.planVersionId ?? null,
        componentId: data.componentId ?? null,
        name: data.name,
        aggregationType: data.aggregationType,
        filterConditions: data.filterConditions,
        unitType: data.unitType,
        currency: data.currency,
        naturalLanguageDefinition: data.naturalLanguageDefinition ?? null,
        parsedDefinition: data.parsedDefinition ?? null,
      })
      .returning()

    const requiresNlParsing = !!data.naturalLanguageDefinition && !data.parsedDefinition
    return { ...definition, requiresNlParsing }
  }

  async updateDefinition(tenantId: string, id: string, input: UpdateMeasureDefinitionInput) {
    const [existing] = await this.db
      .select()
      .from(measureDefinitions)
      .where(and(eq(measureDefinitions.tenantId, tenantId), eq(measureDefinitions.id, id)))
      .limit(1)

    if (!existing) throw new MeasureError('NOT_FOUND', 'Measure definition not found')

    const data = UpdateMeasureDefinitionSchema.parse(input)

    const [updated] = await this.db
      .update(measureDefinitions)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.aggregationType !== undefined ? { aggregationType: data.aggregationType } : {}),
        ...(data.filterConditions !== undefined ? { filterConditions: data.filterConditions } : {}),
        ...(data.unitType !== undefined ? { unitType: data.unitType } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.naturalLanguageDefinition !== undefined ? { naturalLanguageDefinition: data.naturalLanguageDefinition } : {}),
        ...(data.parsedDefinition !== undefined ? { parsedDefinition: data.parsedDefinition } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(measureDefinitions.tenantId, tenantId), eq(measureDefinitions.id, id)))
      .returning()

    return updated
  }

  async listResults(
    tenantId: string,
    filters: { calculationRunId?: string; participantId?: string; componentId?: string } = {},
  ) {
    const all = await this.db
      .select()
      .from(measureResults)
      .where(eq(measureResults.tenantId, tenantId))

    return all.filter((r) => {
      if (filters.calculationRunId && r.calculationRunId !== filters.calculationRunId) return false
      if (filters.participantId && r.participantId !== filters.participantId) return false
      if (filters.componentId && r.componentId !== filters.componentId) return false
      return true
    })
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class MeasureError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'MeasureError'
  }
}
