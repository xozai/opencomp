import 'dotenv/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { getDb } from '../../api/src/db/client'
import { CalculationsService } from '../../../modules/calculations/src/calculations.service'
import { NotificationsService } from '../../../modules/platform-notifications/src/notifications.service'
import { GoalSheetsService } from '../../../modules/goalsheets/src/goalsheets.service'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const QUEUE_PREFIX = process.env.WORKER_QUEUE_PREFIX ?? 'opencomp'
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5)

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUES = {
  CALCULATIONS: `${QUEUE_PREFIX}:calculations`,
  NOTIFICATIONS: `${QUEUE_PREFIX}:notifications`,
  GOALSHEET_DISTRIBUTION: `${QUEUE_PREFIX}:goalsheet-distribution`,
  REPORT_GENERATION: `${QUEUE_PREFIX}:report-generation`,
  INTEGRATION_SYNC: `${QUEUE_PREFIX}:integration-sync`,
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

// ─── Lazy service accessors (instantiated once per process) ───────────────────

let _calcSvc: CalculationsService | undefined
let _notifSvc: NotificationsService | undefined
let _goalSvc: GoalSheetsService | undefined

function getCalcSvc() {
  if (!_calcSvc) _calcSvc = new CalculationsService(getDb())
  return _calcSvc
}

function getNotifSvc() {
  if (!_notifSvc) _notifSvc = new NotificationsService(getDb())
  return _notifSvc
}

function getGoalSvc() {
  if (!_goalSvc) _goalSvc = new GoalSheetsService(getDb())
  return _goalSvc
}

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function processJob(queueName: string, jobName: string, data: unknown) {
  console.log(`[worker] Processing job '${jobName}' from queue '${queueName}'`, data)

  switch (queueName) {
    case QUEUES.CALCULATIONS:
      await handleCalculationJob(jobName, data)
      break
    case QUEUES.NOTIFICATIONS:
      await handleNotificationJob(jobName, data)
      break
    case QUEUES.GOALSHEET_DISTRIBUTION:
      await handleGoalSheetJob(jobName, data)
      break
    default:
      console.warn(`[worker] No handler for queue: ${queueName}`)
  }
}

/**
 * calculation:run — executes a full calculation run in the background.
 * Job data: { tenantId, periodId, planVersionId, participantIds?, actorId? }
 */
async function handleCalculationJob(jobName: string, data: unknown) {
  const d = data as Record<string, unknown>

  if (jobName === 'calculation:run') {
    const { tenantId, periodId, planVersionId, participantIds, actorId } = d as {
      tenantId: string
      periodId: string
      planVersionId: string
      participantIds?: string[]
      actorId?: string
    }

    const result = await getCalcSvc().executeRun(
      tenantId,
      { periodId, planVersionId, participantIds },
      { actorId: actorId ?? 'worker', tenantId },
    )

    console.log(
      `[calculations] Run ${result.id} complete: ${result.participantCount} participants, ${result.errorCount} errors`,
    )
    return result
  }

  console.warn(`[calculations] Unknown job: ${jobName}`)
}

/**
 * notification:send — sends a single notification.
 * Job data: { tenantId, recipientId, type, title, body, metadata? }
 */
async function handleNotificationJob(jobName: string, data: unknown) {
  const d = data as Record<string, unknown>

  if (jobName === 'notification:send') {
    const { tenantId, recipientId, type, title, body, metadata } = d as {
      tenantId: string
      recipientId: string
      type: string
      title: string
      body: string
      metadata?: Record<string, unknown>
    }

    await getNotifSvc().send({ tenantId, recipientId, type, title, body, metadata })
    console.log(`[notifications] Sent '${type}' to ${recipientId}`)
    return
  }

  console.warn(`[notifications] Unknown job: ${jobName}`)
}

/**
 * goalsheet:generate  — creates draft goal sheets for a plan version + period.
 * goalsheet:distribute — transitions drafts to distributed state.
 * Job data: { tenantId, planVersionId, periodId, participantIds?, goalSheetIds?, actorId? }
 */
async function handleGoalSheetJob(jobName: string, data: unknown) {
  const d = data as Record<string, unknown>
  const ctx = { actorId: (d.actorId as string) ?? 'worker', tenantId: d.tenantId as string }

  if (jobName === 'goalsheet:generate') {
    const { tenantId, planVersionId, periodId, participantIds } = d as {
      tenantId: string
      planVersionId: string
      periodId: string
      participantIds?: string[]
    }

    const result = await getGoalSvc().generate(tenantId, { planVersionId, periodId, participantIds }, ctx)
    console.log(`[goalsheets] Generated ${result.generated}, skipped ${result.skipped}`)
    return result
  }

  if (jobName === 'goalsheet:distribute') {
    const { tenantId, goalSheetIds } = d as { tenantId: string; goalSheetIds: string[] }
    const result = await getGoalSvc().distribute(tenantId, goalSheetIds, ctx)
    console.log(`[goalsheets] Distributed ${result.length} goal sheets`)
    return result
  }

  console.warn(`[goalsheets] Unknown job: ${jobName}`)
}

// ─── Start workers ────────────────────────────────────────────────────────────

async function start() {
  console.log(`[worker] Starting with concurrency=${CONCURRENCY}`)

  const workers = Object.values(QUEUES).map(
    (queueName) =>
      new Worker(
        queueName,
        async (job) => {
          await processJob(queueName, job.name, job.data)
        },
        { connection, concurrency: CONCURRENCY },
      ),
  )

  workers.forEach((worker) => {
    worker.on('completed', (job) => {
      console.log(`[worker] ✓ ${job.name} (${job.id})`)
    })
    worker.on('failed', (job, err) => {
      console.error(`[worker] ✗ ${job?.name} (${job?.id}):`, err.message)
    })
  })

  console.log(`[worker] Listening on ${Object.values(QUEUES).length} queues`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[worker] Shutting down...')
    await Promise.all(workers.map((w) => w.close()))
    await connection.quit()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start().catch((err) => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
