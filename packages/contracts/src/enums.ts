// ─── Shared domain enumerations ───────────────────────────────────────────────
// All enums are plain string union types for serialization compatibility.

export type UserRole = 'admin' | 'comp_manager' | 'manager' | 'rep' | 'read_only'

export type ParticipantStatus = 'active' | 'inactive' | 'on_leave' | 'terminated'

export type PlanStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'archived'

export type PlanVersionStatus = 'draft' | 'published' | 'superseded' | 'archived'

export type ComponentType = 'commission' | 'bonus' | 'spiff' | 'mbo' | 'draw' | 'guarantee'

export type MeasureType = 'revenue' | 'units' | 'arr' | 'nrr' | 'margin' | 'custom'

export type QuotaType = 'revenue' | 'units' | 'activity' | 'custom'

export type GoalSheetStatus =
  | 'draft'
  | 'distributed'
  | 'acknowledged'
  | 'expired'

export type TransactionStatus =
  | 'pending'
  | 'validated'
  | 'invalid'
  | 'credited'
  | 'excluded'

export type CalculationRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'adjusted' | 'voided'

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'pending_approval'
  | 'resolved_approved'
  | 'resolved_denied'
  | 'withdrawn'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'withdrawn'

export type AdjustmentType = 'increase' | 'decrease' | 'reversal' | 'correction'

export type NotificationType =
  | 'goal_sheet_distributed'
  | 'goal_sheet_acknowledged'
  | 'statement_available'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'approval_requested'
  | 'approval_completed'
  | 'calculation_complete'

export type WorkflowType = 'plan_approval' | 'dispute_resolution' | 'adjustment_approval'

export type WorkflowStatus = 'active' | 'completed' | 'cancelled' | 'failed'

export type ActorType = 'user' | 'system' | 'plugin'

export type StorageDriver = 'local' | 's3'
