/**
 * Drizzle ORM schema — single source of truth for all database tables.
 *
 * Conventions:
 *  - All tables have: id (uuid), tenant_id (uuid), created_at, updated_at
 *  - Monetary amounts stored as integers (cents)
 *  - Soft-delete via deleted_at (nullable)
 *  - JSONB columns for flexible metadata / payloads
 */
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const now = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
const deletedAt = () => timestamp('deleted_at', { withTimezone: true })
const tenantId = () => uuid('tenant_id').notNull()

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  email: text('email').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // UserRole
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

// ─── Participants ─────────────────────────────────────────────────────────────

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid('user_id').references(() => users.id),
  employeeId: text('employee_id'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  title: text('title'),
  status: text('status').notNull().default('active'), // ParticipantStatus
  hireDate: text('hire_date'), // ISO date string
  terminationDate: text('termination_date'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

// ─── Periods ──────────────────────────────────────────────────────────────────

export const periods = pgTable('periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isClosed: boolean('is_closed').default(false).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Plans ────────────────────────────────────────────────────────────────────

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'), // PlanStatus
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  currency: text('currency').notNull().default('USD'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

export const planVersions = pgTable('plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // PlanVersionStatus
  definition: jsonb('definition').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedById: uuid('published_by_id').references(() => users.id),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersions.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // ComponentType
  measureType: text('measure_type'), // MeasureType
  formulaId: text('formula_id'),
  config: jsonb('config').default({}).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Quotas ───────────────────────────────────────────────────────────────────

export const quotas = pgTable('quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersions.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  type: text('type').notNull().default('revenue'),
  amount: integer('amount').notNull(), // in cents
  currency: text('currency').notNull().default('USD'),
  notes: text('notes'),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Goal Sheets ──────────────────────────────────────────────────────────────

export const goalSheets = pgTable('goal_sheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersions.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  status: text('status').notNull().default('draft'), // GoalSheetStatus
  distributedAt: timestamp('distributed_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedById: uuid('acknowledged_by_id').references(() => users.id),
  fileId: uuid('file_id'),
  data: jsonb('data').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Source Transactions ──────────────────────────────────────────────────────

export const sourceTransactions = pgTable('source_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  externalId: text('external_id').notNull(),
  source: text('source').notNull(),
  participantId: uuid('participant_id').references(() => participants.id),
  transactionDate: text('transaction_date').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'), // TransactionStatus
  payload: jsonb('payload').notNull(),
  validationErrors: jsonb('validation_errors').default([]).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Credits ──────────────────────────────────────────────────────────────────

export const credits = pgTable('credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  transactionId: uuid('transaction_id').notNull().references(() => sourceTransactions.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  componentId: uuid('component_id').notNull().references(() => components.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  creditRuleId: text('credit_rule_id'),
  splitPct: integer('split_pct').default(100).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Calculation Runs ─────────────────────────────────────────────────────────

export const calculationRuns = pgTable('calculation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  planVersionId: uuid('plan_version_id').references(() => planVersions.id),
  status: text('status').notNull().default('queued'), // CalculationRunStatus
  triggeredById: uuid('triggered_by_id').references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  participantCount: integer('participant_count').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  config: jsonb('config').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Payouts ──────────────────────────────────────────────────────────────────

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersions.id),
  grossAmountCents: integer('gross_amount_cents').notNull(),
  adjustedAmountCents: integer('adjusted_amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'), // PayoutStatus
  lineItems: jsonb('line_items').default([]).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Disputes ─────────────────────────────────────────────────────────────────

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  payoutId: uuid('payout_id').references(() => payouts.id),
  transactionId: uuid('transaction_id').references(() => sourceTransactions.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  openedById: uuid('opened_by_id').notNull().references(() => users.id),
  assignedToId: uuid('assigned_to_id').references(() => users.id),
  status: text('status').notNull().default('open'), // DisputeStatus
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  requestedAmountCents: integer('requested_amount_cents'),
  requestedCurrency: text('requested_currency'),
  resolvedAmountCents: integer('resolved_amount_cents'),
  resolvedCurrency: text('resolved_currency'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedById: uuid('resolved_by_id').references(() => users.id),
  resolutionNotes: text('resolution_notes'),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Approval Requests ────────────────────────────────────────────────────────

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  workflowType: text('workflow_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  requestedById: uuid('requested_by_id').notNull().references(() => users.id),
  assignedToId: uuid('assigned_to_id').references(() => users.id),
  status: text('status').notNull().default('pending'), // ApprovalStatus
  dueAt: timestamp('due_at', { withTimezone: true }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedById: uuid('decided_by_id').references(() => users.id),
  notes: text('notes'),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Adjustments ──────────────────────────────────────────────────────────────

export const adjustments = pgTable('adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  payoutId: uuid('payout_id').notNull().references(() => payouts.id),
  disputeId: uuid('dispute_id').references(() => disputes.id),
  approvalRequestId: uuid('approval_request_id').references(() => approvalRequests.id),
  type: text('type').notNull(), // AdjustmentType
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  reason: text('reason').notNull(),
  appliedById: uuid('applied_by_id').notNull().references(() => users.id),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Audit Events ─────────────────────────────────────────────────────────────

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  actorId: uuid('actor_id'),
  actorType: text('actor_type').notNull().default('user'),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata').default({}).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  recipientId: uuid('recipient_id').notNull().references(() => users.id),
  type: text('type').notNull(), // NotificationType
  title: text('title').notNull(),
  body: text('body').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: now(),
})
