import { z } from 'zod'
import { BaseEntitySchema, MoneySchema, UuidSchema } from './common'
import type {
  AdjustmentType,
  ApprovalStatus,
  CalculationRunStatus,
  ComponentType,
  DisputeStatus,
  GoalSheetStatus,
  MeasureType,
  ParticipantStatus,
  PayoutStatus,
  PlanStatus,
  PlanVersionStatus,
  QuotaType,
  TransactionStatus,
  UserRole,
  WorkflowStatus,
  WorkflowType,
} from './enums'

// ─── Tenant ───────────────────────────────────────────────────────────────────

export const TenantSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  settings: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})
export type Tenant = z.infer<typeof TenantSchema>

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.custom<UserRole>(),
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type User = z.infer<typeof UserSchema>

// ─── Participant ──────────────────────────────────────────────────────────────

export const ParticipantSchema = BaseEntitySchema.extend({
  userId: UuidSchema.nullable().optional(),
  employeeId: z.string().max(100).nullable().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  title: z.string().max(200).nullable().optional(),
  status: z.custom<ParticipantStatus>(),
  hireDate: z.string().date().nullable().optional(),
  terminationDate: z.string().date().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
})
export type Participant = z.infer<typeof ParticipantSchema>

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const PlanSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  status: z.custom<PlanStatus>(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  currency: z.string().length(3).default('USD'),
  metadata: z.record(z.unknown()).default({}),
})
export type Plan = z.infer<typeof PlanSchema>

export const PlanVersionSchema = BaseEntitySchema.extend({
  planId: UuidSchema,
  version: z.number().int().positive(),
  status: z.custom<PlanVersionStatus>(),
  definition: z.record(z.unknown()), // full plan JSON definition
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  publishedById: UuidSchema.nullable().optional(),
})
export type PlanVersion = z.infer<typeof PlanVersionSchema>

// ─── Component ────────────────────────────────────────────────────────────────

export const ComponentSchema = BaseEntitySchema.extend({
  planVersionId: UuidSchema,
  name: z.string().min(1).max(255),
  type: z.custom<ComponentType>(),
  measureId: UuidSchema.nullable().optional(),
  rateTableId: UuidSchema.nullable().optional(),
  formulaId: z.string().nullable().optional(), // references plugin formula ID
  config: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
})
export type Component = z.infer<typeof ComponentSchema>

// ─── Quota ────────────────────────────────────────────────────────────────────

export const QuotaSchema = BaseEntitySchema.extend({
  participantId: UuidSchema,
  planVersionId: UuidSchema,
  periodId: UuidSchema,
  type: z.custom<QuotaType>(),
  amount: z.number(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().nullable().optional(),
})
export type Quota = z.infer<typeof QuotaSchema>

// ─── GoalSheet ────────────────────────────────────────────────────────────────

export const GoalSheetSchema = BaseEntitySchema.extend({
  participantId: UuidSchema,
  planVersionId: UuidSchema,
  periodId: UuidSchema,
  status: z.custom<GoalSheetStatus>(),
  distributedAt: z.string().datetime({ offset: true }).nullable().optional(),
  acknowledgedAt: z.string().datetime({ offset: true }).nullable().optional(),
  acknowledgedById: UuidSchema.nullable().optional(),
  fileId: UuidSchema.nullable().optional(),
  data: z.record(z.unknown()).default({}),
})
export type GoalSheet = z.infer<typeof GoalSheetSchema>

// ─── Source Transaction ───────────────────────────────────────────────────────

export const SourceTransactionSchema = BaseEntitySchema.extend({
  externalId: z.string().max(255),
  source: z.string().max(100),
  participantId: UuidSchema.nullable().optional(),
  transactionDate: z.string().date(),
  amount: MoneySchema,
  status: z.custom<TransactionStatus>(),
  payload: z.record(z.unknown()),
  validationErrors: z.array(z.string()).default([]),
  processedAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type SourceTransaction = z.infer<typeof SourceTransactionSchema>

// ─── Credit ──────────────────────────────────────────────────────────────────

export const CreditSchema = BaseEntitySchema.extend({
  transactionId: UuidSchema,
  participantId: UuidSchema,
  componentId: UuidSchema,
  periodId: UuidSchema,
  amount: MoneySchema,
  creditRuleId: z.string().nullable().optional(),
  splitPct: z.number().min(0).max(100).default(100),
  metadata: z.record(z.unknown()).default({}),
})
export type Credit = z.infer<typeof CreditSchema>

// ─── Calculation Run ──────────────────────────────────────────────────────────

export const CalculationRunSchema = BaseEntitySchema.extend({
  periodId: UuidSchema,
  planVersionId: UuidSchema.nullable().optional(),
  status: z.custom<CalculationRunStatus>(),
  triggeredById: UuidSchema.nullable().optional(),
  startedAt: z.string().datetime({ offset: true }).nullable().optional(),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  participantCount: z.number().int().default(0),
  errorCount: z.number().int().default(0),
  config: z.record(z.unknown()).default({}),
})
export type CalculationRun = z.infer<typeof CalculationRunSchema>

// ─── Payout ──────────────────────────────────────────────────────────────────

export const PayoutSchema = BaseEntitySchema.extend({
  calculationRunId: UuidSchema,
  participantId: UuidSchema,
  periodId: UuidSchema,
  planVersionId: UuidSchema,
  grossAmount: MoneySchema,
  adjustedAmount: MoneySchema,
  status: z.custom<PayoutStatus>(),
  lineItems: z.array(z.record(z.unknown())).default([]),
  paidAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type Payout = z.infer<typeof PayoutSchema>

// ─── Dispute ─────────────────────────────────────────────────────────────────

export const DisputeSchema = BaseEntitySchema.extend({
  payoutId: UuidSchema.nullable().optional(),
  transactionId: UuidSchema.nullable().optional(),
  participantId: UuidSchema,
  openedById: UuidSchema,
  assignedToId: UuidSchema.nullable().optional(),
  status: z.custom<DisputeStatus>(),
  subject: z.string().min(1).max(500),
  description: z.string(),
  requestedAmount: MoneySchema.nullable().optional(),
  resolvedAmount: MoneySchema.nullable().optional(),
  resolvedAt: z.string().datetime({ offset: true }).nullable().optional(),
  resolvedById: UuidSchema.nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
})
export type Dispute = z.infer<typeof DisputeSchema>

// ─── Approval Request ─────────────────────────────────────────────────────────

export const ApprovalRequestSchema = BaseEntitySchema.extend({
  workflowType: z.custom<WorkflowType>(),
  entityType: z.string(),
  entityId: UuidSchema,
  requestedById: UuidSchema,
  assignedToId: UuidSchema.nullable().optional(),
  status: z.custom<ApprovalStatus>(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  decidedAt: z.string().datetime({ offset: true }).nullable().optional(),
  decidedById: UuidSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
})
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>

// ─── Adjustment ──────────────────────────────────────────────────────────────

export const AdjustmentSchema = BaseEntitySchema.extend({
  payoutId: UuidSchema,
  disputeId: UuidSchema.nullable().optional(),
  approvalRequestId: UuidSchema.nullable().optional(),
  type: z.custom<AdjustmentType>(),
  amount: MoneySchema,
  reason: z.string().min(1),
  appliedById: UuidSchema,
  appliedAt: z.string().datetime({ offset: true }),
})
export type Adjustment = z.infer<typeof AdjustmentSchema>

// ─── Audit Event ─────────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  action: z.string(),
  actorId: z.string().uuid().nullable().optional(),
  actorType: z.enum(['user', 'system', 'plugin']),
  before: z.record(z.unknown()).nullable().optional(),
  after: z.record(z.unknown()).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime({ offset: true }),
})
export type AuditEvent = z.infer<typeof AuditEventSchema>
