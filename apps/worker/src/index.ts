import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import IORedis from 'ioredis'

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

async function handleCalculationJob(jobName: string, data: unknown) {
  // TODO: import and call calculations module
  console.log(`[calculations] Job: ${jobName}`, data)
}

async function handleNotificationJob(jobName: string, data: unknown) {
  // TODO: import and call notifications module
  console.log(`[notifications] Job: ${jobName}`, data)
}

async function handleGoalSheetJob(jobName: string, data: unknown) {
  // TODO: import and call goalsheets module
  console.log(`[goalsheets] Job: ${jobName}`, data)
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
