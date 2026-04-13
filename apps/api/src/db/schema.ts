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
  numeric,
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

// ─── Positions ────────────────────────────────────────────────────────────────

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  type: text('type').notNull(), // rep | overlay | manager | executive
  parentPositionId: uuid('parent_position_id'),
  participantId: uuid('participant_id').references(() => participants.id),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

export const positionRelationships = pgTable('position_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  fromPositionId: uuid('from_position_id').notNull().references(() => positions.id),
  toPositionId: uuid('to_position_id').notNull().references(() => positions.id),
  relationshipType: text('relationship_type').notNull(), // reports_to | overlay_on | inherits_from
  splitPct: integer('split_pct').notNull().default(100),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Credit Rules ─────────────────────────────────────────────────────────────

export const creditRules = pgTable('credit_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planVersionId: uuid('plan_version_id').references(() => planVersions.id),
  name: text('name').notNull(),
  description: text('description'),
  naturalLanguageDefinition: text('natural_language_definition'),
  parsedDefinition: jsonb('parsed_definition'),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const creditRuleConditions = pgTable('credit_rule_conditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  creditRuleId: uuid('credit_rule_id').notNull().references(() => creditRules.id),
  field: text('field').notNull(),
  operator: text('operator').notNull(),
  value: text('value').notNull(),
  createdAt: now(),
})

export const creditRuleActions = pgTable('credit_rule_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  creditRuleId: uuid('credit_rule_id').notNull().references(() => creditRules.id),
  actionType: text('action_type').notNull(), // assign_to_position | assign_to_participant | split | inherit_to_parent
  targetType: text('target_type').notNull(), // position_type | position_id | participant_attribute
  targetValue: text('target_value').notNull(),
  splitPct: integer('split_pct').notNull().default(100),
  inheritanceDepth: integer('inheritance_depth').notNull().default(0),
  createdAt: now(),
})

// ─── Measures ─────────────────────────────────────────────────────────────────

export const measureDefinitions = pgTable('measure_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planVersionId: uuid('plan_version_id').references(() => planVersions.id),
  componentId: uuid('component_id').references(() => components.id),
  name: text('name').notNull(),
  aggregationType: text('aggregation_type').notNull(), // sum | count | average | max | min | weighted_average
  filterConditions: jsonb('filter_conditions').default([]).notNull(),
  unitType: text('unit_type').notNull().default('currency'), // currency | count | percentage
  currency: text('currency').notNull().default('USD'),
  naturalLanguageDefinition: text('natural_language_definition'),
  parsedDefinition: jsonb('parsed_definition'),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const measureResults = pgTable('measure_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  positionId: uuid('position_id').references(() => positions.id),
  componentId: uuid('component_id').notNull().references(() => components.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  measuredValue: numeric('measured_value').notNull().default('0'),
  transactionCount: integer('transaction_count').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  breakdown: jsonb('breakdown').default([]).notNull(),
  createdAt: now(),
})

// ─── Earnings ─────────────────────────────────────────────────────────────────

export const earningsRules = pgTable('earnings_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planVersionId: uuid('plan_version_id').references(() => planVersions.id),
  componentId: uuid('component_id').references(() => components.id),
  basisType: text('basis_type').notNull().default('aggregate'), // aggregate | per_transaction
  formulaType: text('formula_type').notNull(), // flat_rate | tiered | accelerated | mbo | draw | guarantee
  formulaConfig: jsonb('formula_config').notNull().default({}),
  cap: jsonb('cap'),
  quotaRef: text('quota_ref'),
  naturalLanguageDefinition: text('natural_language_definition'),
  parsedDefinition: jsonb('parsed_definition'),
  dependsOnComponentId: uuid('depends_on_component_id').references(() => components.id),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const earningsResults = pgTable('earnings_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  positionId: uuid('position_id').references(() => positions.id),
  componentId: uuid('component_id').notNull().references(() => components.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  grossEarningsCents: integer('gross_earnings_cents').notNull().default(0),
  cappedEarningsCents: integer('capped_earnings_cents').notNull().default(0),
  attainmentPct: numeric('attainment_pct').notNull().default('0'),
  formulaBreakdown: jsonb('formula_breakdown').notNull().default({}),
  createdAt: now(),
})

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentBalances = pgTable('payment_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  componentId: uuid('component_id').notNull().references(() => components.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
  earningsCents: integer('earnings_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  closingBalanceCents: integer('closing_balance_cents').notNull().default(0),
  drawRecoveryCents: integer('draw_recovery_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'), // pending | approved | paid | restated
  paidAt: timestamp('paid_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const paymentStatements = pgTable('payment_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  periodId: uuid('period_id').notNull().references(() => periods.id),
  calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
  totalEarningsCents: integer('total_earnings_cents').notNull().default(0),
  totalPaidCents: integer('total_paid_cents').notNull().default(0),
  totalOpeningBalanceCents: integer('total_opening_balance_cents').notNull().default(0),
  totalClosingBalanceCents: integer('total_closing_balance_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('draft'), // draft | approved | paid
  lineItems: jsonb('line_items').notNull().default([]),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedById: uuid('approved_by_id').references(() => users.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paidById: uuid('paid_by_id').references(() => users.id),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// ─── Complementary ────────────────────────────────────────────────────────────

export const calcExceptions = pgTable('calc_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  componentId: uuid('component_id').references(() => components.id),
  exceptionType: text('exception_type').notNull(), // high_earnings | high_attainment | large_transaction | zero_earnings | custom
  severity: text('severity').notNull().default('warning'), // info | warning | error
  message: text('message').notNull(),
  details: jsonb('details').notNull().default({}),
  status: text('status').notNull().default('open'), // open | resolved | dismissed
  resolvedById: uuid('resolved_by_id').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),
  rate: numeric('rate').notNull(),
  effectiveDate: text('effective_date').notNull(),
  source: text('source').notNull().default('manual'),
  createdAt: now(),
  updatedAt: updatedAt(),
})

export const prorationRules = pgTable('proration_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  planVersionId: uuid('plan_version_id').references(() => planVersions.id),
  triggerType: text('trigger_type').notNull(), // hire | termination | leave | plan_change
  method: text('method').notNull().default('calendar_days'), // calendar_days | working_days | none
  minimumDays: integer('minimum_days').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: now(),
  updatedAt: updatedAt(),
})
