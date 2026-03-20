/**
 * Domain event listeners that trigger notifications.
 * Call registerNotificationListeners() once at API startup.
 */
import { eventBus } from '../../../packages/events/src'
import {
  GOAL_SHEET_DISTRIBUTED,
  GOAL_SHEET_ACKNOWLEDGED,
  DISPUTE_OPENED,
  DISPUTE_RESOLVED,
  APPROVAL_REQUESTED,
  APPROVAL_DECIDED,
  CALCULATION_RUN_COMPLETED,
} from '../../../packages/events/src/domain-events'
import type { NotificationsService } from './notifications.service'

export function registerNotificationListeners(
  svc: NotificationsService,
  resolveUserId: (participantId: string) => Promise<string | null>,
) {
  // Goal sheet distributed → notify participant
  eventBus.subscribe(GOAL_SHEET_DISTRIBUTED, async (event) => {
    const { participantId, periodId } = event.payload as { participantId: string; periodId: string }
    const userId = await resolveUserId(participantId)
    if (!userId) return
    await svc.send({
      tenantId: event.tenantId,
      recipientId: userId,
      type: 'goal_sheet_distributed',
      title: 'Your goal sheet is ready',
      body: `Your compensation goal sheet for this period has been distributed. Please review and acknowledge it.`,
      metadata: { participantId, periodId },
    })
  })

  // Goal sheet acknowledged → notify comp manager (future: lookup manager)
  eventBus.subscribe(GOAL_SHEET_ACKNOWLEDGED, async (event) => {
    const { participantId, goalSheetId } = event.payload as { participantId: string; goalSheetId: string }
    // In a full implementation, resolve the comp manager's userId
    console.log(`[notifications] Goal sheet ${goalSheetId} acknowledged by participant ${participantId}`)
  })

  // Dispute opened → notify assigned reviewer
  eventBus.subscribe(DISPUTE_OPENED, async (event) => {
    const { disputeId, participantId } = event.payload as { disputeId: string; participantId: string }
    console.log(`[notifications] Dispute ${disputeId} opened by participant ${participantId}`)
  })

  // Dispute resolved → notify participant
  eventBus.subscribe(DISPUTE_RESOLVED, async (event) => {
    const { disputeId, resolution } = event.payload as { disputeId: string; resolution: string }
    console.log(`[notifications] Dispute ${disputeId} resolved: ${resolution}`)
  })

  // Approval requested → notify assignee
  eventBus.subscribe(APPROVAL_REQUESTED, async (event) => {
    const { approvalRequestId, assignedToId } = event.payload as {
      approvalRequestId: string
      assignedToId?: string
    }
    if (!assignedToId) return
    await svc.send({
      tenantId: event.tenantId,
      recipientId: assignedToId,
      type: 'approval_requested',
      title: 'Approval required',
      body: `You have a new approval request waiting for your decision.`,
      metadata: { approvalRequestId },
    })
  })

  // Calculation completed → notify comp managers (stub)
  eventBus.subscribe(CALCULATION_RUN_COMPLETED, async (event) => {
    const { calculationRunId } = event.payload as { calculationRunId: string }
    console.log(`[notifications] Calculation run ${calculationRunId} completed`)
  })
}
