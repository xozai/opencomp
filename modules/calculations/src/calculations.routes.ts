import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CalculationsService, CalculationError } from './calculations.service'

export async function calculationRoutes(app: FastifyInstance) {
  const svc = new CalculationsService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // GET /calculation-runs
  app.get('/calculation-runs', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { periodId } = request.query as { periodId?: string }
    const data = await svc.listRuns(request.tenantId, periodId)
    return reply.send({ success: true, data })
  })

  // GET /calculation-runs/:runId
  app.get('/calculation-runs/:runId', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.getRun(request.tenantId, request.params.runId)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof CalculationError && err.code === 'RUN_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /calculation-runs — start a new run
  app.post('/calculation-runs', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = z.object({
      periodId: z.string().uuid(),
      planVersionId: z.string().uuid(),
      participantIds: z.array(z.string().uuid()).optional(),
    }).parse(request.body)

    try {
      const data = await svc.executeRun(request.tenantId, input, getCtx(request))
      return reply.status(201).send({ success: true, data })
    } catch (err) {
      if (err instanceof CalculationError) {
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /calculation-runs/:runId/payouts
  app.get('/calculation-runs/:runId/payouts', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const data = await svc.getPayoutsForRun(request.tenantId, request.params.runId)
    return reply.send({ success: true, data, total: data.length })
  })
}
