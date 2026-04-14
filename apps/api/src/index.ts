import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fjwt from '@fastify/jwt'
import { getDb } from './db/client'
import { tenancyFastifyPlugin } from '../../../modules/platform-tenancy/src/tenancy.plugin'
import { authRoutes } from '../../../modules/platform-auth/src/auth.routes'
import type { JwtPayload } from '../../../modules/platform-auth/src/auth.service'
import { planRoutes } from '../../../modules/plans/src/plans.routes'
import { goalSheetRoutes } from '../../../modules/goalsheets/src/goalsheets.routes'
import { transactionRoutes } from '../../../modules/transactions/src/transactions.routes'
import { calculationRoutes } from '../../../modules/calculations/src/calculations.routes'
import { disputeRoutes } from '../../../modules/disputes/src/disputes.routes'
import { participantRoutes } from '../../../modules/participants/src/participants.routes'
import { statementRoutes } from '../../../modules/statements/src/statements.routes'
import { approvalRoutes } from '../../../modules/approvals/src/approvals.routes'
import { adjustmentRoutes } from '../../../modules/adjustments/src/adjustments.routes'
import { payoutsRoutes } from '../../../modules/payouts/src/payouts.routes'
import { reportingRoutes } from '../../../modules/platform-reporting/src/reporting.routes'
import { quotaRoutes } from '../../../modules/quotas/src/quotas.routes'
import { creditRoutes } from '../../../modules/credits/src/credits.routes'
import { periodRoutes } from '../../../modules/periods/src/periods.routes'
import { positionRoutes } from '../../../modules/positions/src/positions.routes'
import { creditRuleRoutes } from '../../../modules/credit-rules/src/credit-rules.routes'
import { measureRoutes } from '../../../modules/measures/src/measures.routes'
import { earningsRoutes } from '../../../modules/earnings/src/earnings.routes'
import { paymentRoutes } from '../../../modules/payments/src/payments.routes'
import { nlRulesRoutes } from '../../../modules/nl-rules/src/nl-rules.routes'
import { exchangeRateRoutes } from '../../../modules/exchange-rates/src/exchange-rates.routes'
import { prorationRuleRoutes } from '../../../modules/proration-rules/src/proration-rules.routes'
import { NotificationsService } from '../../../modules/platform-notifications/src/notifications.service'
import { registerNotificationListeners } from '../../../modules/platform-notifications/src/notifications.listeners'
import { ParticipantsService } from '../../../modules/participants/src/participants.service'
import { pluginRegistry } from '../../../packages/sdk/src'
import { rulesEngine } from '../../../modules/platform-rules/src/rules-engine'
import '../../../plugins/sample-plan-rules/src/index'

// ─── Fastify augmentations ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

// ─── Build the app ────────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(process.env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
  })

  // ── Core plugins ──
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  })

  // ── JWT ──
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  })

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } })
    }
  })

  // ── Database ──
  app.decorate('db', getDb())

  // ── OpenAPI docs ──
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OpenComp API',
        description: 'Open-source sales compensation administration platform',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  // ── Tenancy ──
  await app.register(tenancyFastifyPlugin)

  // ── Global error handler ──
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : error.message,
      },
    })
  })

  // ── Health check ──
  app.get('/health', { schema: { tags: ['System'] } }, async () => ({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  }))

  // ── Routes ──
  await app.register(authRoutes, { prefix: '/api/v1' })
  await app.register(planRoutes, { prefix: '/api/v1' })
  await app.register(goalSheetRoutes, { prefix: '/api/v1' })
  await app.register(transactionRoutes, { prefix: '/api/v1' })
  await app.register(calculationRoutes, { prefix: '/api/v1' })
  await app.register(disputeRoutes, { prefix: '/api/v1' })
  await app.register(participantRoutes, { prefix: '/api/v1' })
  await app.register(statementRoutes, { prefix: '/api/v1' })
  await app.register(approvalRoutes, { prefix: '/api/v1' })
  await app.register(adjustmentRoutes, { prefix: '/api/v1' })
  await app.register(payoutsRoutes, { prefix: '/api/v1/payouts' })
  await app.register(reportingRoutes, { prefix: '/api/v1/reports' })
  await app.register(quotaRoutes, { prefix: '/api/v1' })
  await app.register(creditRoutes, { prefix: '/api/v1' })
  await app.register(periodRoutes, { prefix: '/api/v1' })
  await app.register(positionRoutes, { prefix: '/api/v1' })
  await app.register(creditRuleRoutes, { prefix: '/api/v1' })
  await app.register(measureRoutes, { prefix: '/api/v1' })
  await app.register(earningsRoutes, { prefix: '/api/v1' })
  await app.register(paymentRoutes, { prefix: '/api/v1' })
  await app.register(nlRulesRoutes, { prefix: '/api/v1' })
  await app.register(exchangeRateRoutes, { prefix: '/api/v1' })
  await app.register(prorationRuleRoutes, { prefix: '/api/v1' })

  // ── Plugin formula bridge ──
  for (const formula of pluginRegistry.getFormulas()) {
    if (!rulesEngine.has(formula.id)) {
      rulesEngine.register({
        id: formula.id,
        name: formula.name,
        description: formula.description,
        formula: (ctx) => formula.calculate(ctx),
      })
    }
  }

  // ── Notification listeners ──
  const notificationsSvc = new NotificationsService(app.db)
  const participantsSvc = new ParticipantsService(app.db)
  registerNotificationListeners(
    notificationsSvc,
    (participantId) => participantsSvc.getUserIdForParticipant(participantId),
  )

  return app
}

// ─── Env validation ───────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  if (!process.env.REDIS_URL) {
    console.warn('[opencomp] REDIS_URL not set — async job queues will not function')
  }
  if (!process.env.DEFAULT_TENANT_ID) {
    console.warn('[opencomp] DEFAULT_TENANT_ID not set — tenant resolution falls back to subdomain')
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  validateEnv()
  const app = await buildApp()
  const port = Number(process.env.API_PORT ?? 3000)
  const host = process.env.API_HOST ?? '0.0.0.0'

  try {
    await app.listen({ port, host })
    console.log(`OpenComp API listening on http://${host}:${port}`)
    console.log(`Swagger docs: http://localhost:${port}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
