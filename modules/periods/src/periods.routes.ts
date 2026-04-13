import type { FastifyInstance } from 'fastify'
import { PeriodsService, CreatePeriodSchema, PeriodError } from './periods.service'

export async function periodRoutes(app: FastifyInstance) {
  const svc = new PeriodsService(app.db)

  app.get('/periods', {
    preHandler: [app.authenticate],
    schema: { tags: ['Periods'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const data = await svc.list(request.tenantId)
    return reply.send({ success: true, data })
  })

  app.post('/periods', {
    preHandler: [app.authenticate],
    schema: { tags: ['Periods'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } })
    }
    const input = CreatePeriodSchema.parse(request.body)
    const ctx = { actorId: request.user.sub, actorType: 'user' as const }
    try {
      const data = await svc.create(request.tenantId, input, ctx)
      return reply.status(201).send({ success: true, data })
    } catch (err) {
      if (err instanceof PeriodError) {
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  app.post('/periods/:id/close', {
    preHandler: [app.authenticate],
    schema: { tags: ['Periods'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } })
    }
    const ctx = { actorId: request.user.sub, actorType: 'user' as const }
    try {
      const data = await svc.close(request.tenantId, (request.params as any).id, ctx)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PeriodError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })
}
