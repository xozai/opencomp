/**
 * Typed domain event definitions.
 * Each event type lives here and is imported by the module that publishes it.
 * Subscribers import from this file to get full type safety.
 */
import type { DomainEvent } from './bus'

// ─── Helper to build a typed event ───────────────────────────────────────────

export function createEvent<T>(
  type: string,
  tenantId: string,
  payload: T,
  metadata?: Record<string, unknown>,
): DomainEvent<T> {
  return {
    type,
    tenantId,
    occurredAt: new Date().toISOString(),
    payload,
    ...(metadata !== undefined ? { metadata } : {}),
  }
}

// ─── Plan events ─────────────────────────────────────────────────────────────

export const PLAN_PUBLISHED = 'plan.published'
export interface PlanPublishedPayload {
  planId: string
  planVersionId: string
  publishedById: string
}

export const PLAN_APPROVED = 'plan.approved'
export interface PlanApprovedPayload {
  planId: string
  planVersionId: string
  approvedById: string
}

// ─── Goal sheet events ────────────────────────────────────────────────────────

export const GOAL_SHEET_DISTRIBUTED = 'goalsheet.distributed'
export interface GoalSheetDistributedPayload {
  goalSheetId: string
  participantId: string
  planVersionId: string
  periodId: string
}

export const GOAL_SHEET_ACKNOWLEDGED = 'goalsheet.acknowledged'
export interface GoalSheetAcknowledgedPayload {
  goalSheetId: string
  participantId: string
  acknowledgedById: string
}

// ─── Transaction events ───────────────────────────────────────────────────────

export const TRANSACTION_INGESTED = 'transaction.ingested'
export interface TransactionIngestedPayload {
  transactionId: string
  externalId: string
  source: string
}

export const TRANSACTION_VALIDATED = 'transaction.validated'
export interface TransactionValidatedPayload {
  transactionId: string
  isValid: boolean
  errors: string[]
}

// ─── Calculation events ───────────────────────────────────────────────────────

export const CALCULATION_RUN_STARTED = 'calculation.run.started'
export const CALCULATION_RUN_COMPLETED = 'calculation.run.completed'
export const CALCULATION_RUN_FAILED = 'calculation.run.failed'
export interface CalculationRunPayload {
  calculationRunId: string
  periodId: string
}

// ─── Dispute events ───────────────────────────────────────────────────────────

export const DISPUTE_OPENED = 'dispute.opened'
export interface DisputeOpenedPayload {
  disputeId: string
  participantId: string
  openedById: string
}

export const DISPUTE_RESOLVED = 'dispute.resolved'
export interface DisputeResolvedPayload {
  disputeId: string
  resolution: 'approved' | 'denied'
  resolvedById: string
}

// ─── Approval events ──────────────────────────────────────────────────────────

export const APPROVAL_REQUESTED = 'approval.requested'
export interface ApprovalRequestedPayload {
  approvalRequestId: string
  workflowType: string
  entityType: string
  entityId: string
  requestedById: string
  assignedToId?: string
}

export const APPROVAL_DECIDED = 'approval.decided'
export interface ApprovalDecidedPayload {
  approvalRequestId: string
  decision: 'approved' | 'rejected' | 'escalated'
  decidedById: string
}
