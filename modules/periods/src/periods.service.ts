import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { periods } from '../../../apps/api/src/db/schema'
import { AuditService } from '../../platform-audit/src/audit.service'
import type { AuditContext } from '../../platform-audit/src/audit.service'

export const CreatePeriodSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
})
export type CreatePeriodInput = z.infer<typeof CreatePeriodSchema>

export class PeriodsService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  async list(tenantId: string) {
    return this.db
      .select()
      .from(periods)
      .where(eq(periods.tenantId, tenantId))
      .orderBy(desc(periods.startDate))
  }

  async get(tenantId: string, periodId: string) {
    const [period] = await this.db
      .select()
      .from(periods)
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, periodId)))
      .limit(1)

    if (!period) throw new PeriodError('NOT_FOUND', 'Period not found')
    return period
  }

  async create(tenantId: string, input: CreatePeriodInput, ctx: AuditContext) {
    const data = CreatePeriodSchema.parse(input)

    if (data.startDate >= data.endDate) {
      throw new PeriodError('INVALID_DATES', 'startDate must be before endDate')
    }

    const [created] = await this.db
      .insert(periods)
      .values({ tenantId, ...data })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'period',
      entityId: created!.id,
      action: 'created',
      ...(created !== undefined ? { after: created as Record<string, unknown> } : {}),
    })

    return created
  }

  async close(tenantId: string, periodId: string, ctx: AuditContext) {
    const existing = await this.get(tenantId, periodId)

    const [updated] = await this.db
      .update(periods)
      .set({ isClosed: true, updatedAt: new Date() })
      .where(and(eq(periods.tenantId, tenantId), eq(periods.id, periodId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'period',
      entityId: periodId,
      action: 'closed',
      before: { isClosed: existing.isClosed },
      after: { isClosed: true },
    })

    return updated
  }
}

export class PeriodError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PeriodError'
  }
}
