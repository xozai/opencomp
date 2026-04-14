/**
 * platform-events — re-exports the internal event bus and domain event constants.
 * Use this module within the monorepo; external plugins should use @opencomp/sdk.
 */
export { eventBus } from '../../../packages/events/src/bus'
export {
  createEvent,
  PLAN_PUBLISHED,
  PLAN_APPROVED,
  GOAL_SHEET_DISTRIBUTED,
  GOAL_SHEET_ACKNOWLEDGED,
  TRANSACTION_INGESTED,
  TRANSACTION_VALIDATED,
  CALCULATION_RUN_STARTED,
  CALCULATION_RUN_COMPLETED,
  CALCULATION_RUN_FAILED,
  DISPUTE_OPENED,
  DISPUTE_RESOLVED,
  APPROVAL_REQUESTED,
  APPROVAL_DECIDED,
} from '../../../packages/events/src/domain-events'
export type {
  DomainEvent,
} from '../../../packages/events/src/bus'
export type {
  PlanPublishedPayload,
  PlanApprovedPayload,
  GoalSheetDistributedPayload,
  GoalSheetAcknowledgedPayload,
  TransactionIngestedPayload,
  TransactionValidatedPayload,
  CalculationRunPayload,
  DisputeOpenedPayload,
  DisputeResolvedPayload,
  ApprovalRequestedPayload,
  ApprovalDecidedPayload,
} from '../../../packages/events/src/domain-events'
