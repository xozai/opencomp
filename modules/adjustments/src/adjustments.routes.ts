import type { FastifyInstance } from 'fastify'
import { AdjustmentsService, CreateAdjustmentSchema, AdjustmentError } from './adjustments.service'

export async function adjustmentRoutes(app: FastifyInstance) {
  const svc = new AdjustmentsService(app.db)

  const getCtx = (req: any) => ({
    tenantId: req.tenantId,
    actorId: req.user?.sub,
    actorType: 'user' as const,
  })

  // GET /adjustments?payoutId=&participantId=
  app.get('/adjustments', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    const { payoutId, participantId } = req.query as Record<string, string | undefined>
    const data = await svc.list(req.tenantId, {
      ...(payoutId !== undefined ? { payoutId } : {}),
      ...(participantId !== undefined ? { participantId } : {}),
    })
    return reply.send({ success: true, data })
  })

  // GET /adjustments/:id
  app.get('/adjustments/:id', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    const data = await svc.get(req.tenantId, req.params.id)
    if (!data) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Adjustment not found' } })
    return reply.send({ success: true, data })
  })

  // POST /adjustments
  app.post('/adjustments', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const data = await svc.create(req.tenantId, req.body, getCtx(req))
      return reply.status(201).send({ success: true, data })
    } catch (err) {
      if (err instanceof AdjustmentError)
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })
}
