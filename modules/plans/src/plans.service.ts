import { eq, and, isNull, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { plans, planVersions, components } from '../../../apps/api/src/db/schema'
import type { AuditContext } from '../../platform-audit/src/audit.service'
import { AuditService } from '../../platform-audit/src/audit.service'
import { eventBus } from '../../../packages/events/src'
import { PLAN_PUBLISHED, createEvent } from '../../../packages/events/src/domain-events'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreatePlanSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
  currency: z.string().length(3).default('USD'),
})
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>

export const UpdatePlanSchema = CreatePlanSchema.partial()
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>

export const CreateComponentSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['commission', 'bonus', 'spiff', 'mbo', 'draw', 'guarantee']),
  measureType: z.string().optional(),
  formulaId: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
})
export type CreateComponentInput = z.infer<typeof CreateComponentSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class PlansService {
  private audit: AuditService

  constructor(private db: Db) {
    this.audit = new AuditService(db)
  }

  // ── Plans ──

  async listPlans(tenantId: string) {
    return this.db
      .select()
      .from(plans)
      .where(and(eq(plans.tenantId, tenantId), isNull(plans.deletedAt)))
      .orderBy(desc(plans.createdAt))
  }

  async getPlan(tenantId: string, planId: string) {
    const [plan] = await this.db
      .select()
      .from(plans)
      .where(and(eq(plans.tenantId, tenantId), eq(plans.id, planId), isNull(plans.deletedAt)))
      .limit(1)

    if (!plan) throw new PlanError('PLAN_NOT_FOUND', 'Plan not found')
    return plan
  }

  async createPlan(tenantId: string, input: CreatePlanInput, ctx: AuditContext) {
    const data = CreatePlanSchema.parse(input)
    const [plan] = await this.db
      .insert(plans)
      .values({ tenantId, ...data, status: 'draft', metadata: {} })
      .returning()

    // Create initial version
    const [version] = await this.db
      .insert(planVersions)
      .values({
        tenantId,
        planId: plan.id,
        version: 1,
        status: 'draft',
        definition: {},
      })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'plan',
      entityId: plan.id,
      action: 'created',
      after: plan,
    })

    return { plan, version }
  }

  async updatePlan(tenantId: string, planId: string, input: UpdatePlanInput, ctx: AuditContext) {
    const existing = await this.getPlan(tenantId, planId)
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new PlanError('PLAN_NOT_EDITABLE', 'Only draft or pending_approval plans can be edited')
    }

    const data = UpdatePlanSchema.parse(input)
    const [updated] = await this.db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(plans.tenantId, tenantId), eq(plans.id, planId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'plan',
      entityId: planId,
      action: 'updated',
      before: existing,
      after: updated,
    })

    return updated
  }

  async submitPlanForApproval(tenantId: string, planId: string, ctx: AuditContext) {
    const plan = await this.getPlan(tenantId, planId)
    if (plan.status !== 'draft') {
      throw new PlanError('INVALID_STATUS', 'Only draft plans can be submitted for approval')
    }

    const [updated] = await this.db
      .update(plans)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(plans.tenantId, tenantId), eq(plans.id, planId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'plan',
      entityId: planId,
      action: 'submitted_for_approval',
      before: { status: plan.status },
      after: { status: 'pending_approval' },
    })

    return updated
  }

  async publishPlan(tenantId: string, planId: string, ctx: AuditContext) {
    const plan = await this.getPlan(tenantId, planId)
    if (!['draft', 'approved', 'pending_approval'].includes(plan.status)) {
      throw new PlanError('INVALID_STATUS', 'Plan cannot be published from its current status')
    }

    // Get latest version and publish it
    const [latestVersion] = await this.db
      .select()
      .from(planVersions)
      .where(and(eq(planVersions.tenantId, tenantId), eq(planVersions.planId, planId)))
      .orderBy(desc(planVersions.version))
      .limit(1)

    if (!latestVersion) throw new PlanError('NO_VERSION', 'No plan version found')

    const [publishedVersion] = await this.db
      .update(planVersions)
      .set({
        status: 'published',
        publishedAt: new Date(),
        publishedById: ctx.actorId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(planVersions.id, latestVersion.id))
      .returning()

    const [updatedPlan] = await this.db
      .update(plans)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(plans.tenantId, tenantId), eq(plans.id, planId)))
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'plan',
      entityId: planId,
      action: 'published',
      before: { status: plan.status },
      after: { status: 'active' },
    })

    await eventBus.publish(
      createEvent(PLAN_PUBLISHED, tenantId, {
        planId,
        planVersionId: publishedVersion.id,
        publishedById: ctx.actorId ?? 'system',
      }),
    )

    return { plan: updatedPlan, version: publishedVersion }
  }

  // ── Components ──

  async listComponents(tenantId: string, planVersionId: string) {
    return this.db
      .select()
      .from(components)
      .where(and(eq(components.tenantId, tenantId), eq(components.planVersionId, planVersionId)))
      .orderBy(components.sortOrder)
  }

  async addComponent(
    tenantId: string,
    planVersionId: string,
    input: CreateComponentInput,
    ctx: AuditContext,
  ) {
    const data = CreateComponentSchema.parse(input)
    const [component] = await this.db
      .insert(components)
      .values({ tenantId, planVersionId, ...data })
      .returning()

    await this.audit.recordSafe({
      ctx,
      entityType: 'component',
      entityId: component.id,
      action: 'created',
      after: component,
    })

    return component
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PlanError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PlanError'
  }
}
