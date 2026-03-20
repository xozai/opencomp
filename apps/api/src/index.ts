import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fjwt from '@fastify/jwt'
import { getDb } from './db/client'
import { tenancyFastifyPlugin } from '../../modules/platform-tenancy/src/tenancy.plugin'
import { authRoutes } from '../../modules/platform-auth/src/auth.routes'
import type { JwtPayload } from '../../modules/platform-auth/src/auth.service'
import { planRoutes } from '../../modules/plans/src/plans.routes'
import { goalSheetRoutes } from '../../modules/goalsheets/src/goalsheets.routes'
import { transactionRoutes } from '../../modules/transactions/src/transactions.routes'
import { calculationRoutes } from '../../modules/calculations/src/calculations.routes'
import { disputeRoutes } from '../../modules/disputes/src/disputes.routes'

// ─── Fastify augmentations ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: JwtPayload
  }
}

// ─── Build the app ────────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
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

  return app
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
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
