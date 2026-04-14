import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DisputesService, OpenDisputeSchema, ResolveDisputeSchema, DisputeError } from './disputes.service'

export async function disputeRoutes(app: FastifyInstance) {
  const svc = new DisputesService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // GET /disputes
  app.get('/disputes', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { status, participantId, assignedToId } = request.query as Record<string, string | undefined>
    const data = await svc.listDisputes(request.tenantId, {
      ...(status !== undefined ? { status } : {}),
      ...(participantId !== undefined ? { participantId } : {}),
      ...(assignedToId !== undefined ? { assignedToId } : {}),
    })
    return reply.send({ success: true, data, total: data.length })
  })

  // GET /disputes/:id
  app.get('/disputes/:id', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.getDispute(request.tenantId, request.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof DisputeError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /disputes — open a dispute
  app.post('/disputes', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = OpenDisputeSchema.parse(request.body)
    const data = await svc.openDispute(request.tenantId, input, request.user.sub, getCtx(request))
    return reply.status(201).send({ success: true, data })
  })

  // PATCH /disputes/:id/assign
  app.patch('/disputes/:id/assign', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { assignedToId } = z.object({ assignedToId: z.string().uuid() }).parse(request.body)
    const data = await svc.assignDispute(request.tenantId, request.params.id, assignedToId, getCtx(request))
    return reply.send({ success: true, data })
  })

  // POST /disputes/:id/resolve
  app.post('/disputes/:id/resolve', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const input = ResolveDisputeSchema.parse(request.body)
      const data = await svc.resolveDispute(
        request.tenantId,
        request.params.id,
        input,
        request.user.sub,
        getCtx(request),
      )
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof DisputeError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })
}
