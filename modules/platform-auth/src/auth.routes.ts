import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthError, AuthService, LoginSchema } from './auth.service'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app.db)

  // POST /auth/login
  app.post('/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId // set by tenancy plugin
      const body = LoginSchema.parse(request.body)
      const tokens = await authService.login(body, tenantId)
      return reply.send({ success: true, data: tokens })
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(401).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /auth/refresh
  app.post('/auth/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token using refresh token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body)
      const tokens = await authService.refreshTokens(refreshToken)
      return reply.send({ success: true, data: tokens })
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(401).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /auth/me
  app.get('/auth/me', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get current authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    return reply.send({ success: true, data: request.user })
  })
}
