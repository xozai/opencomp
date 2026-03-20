import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { GoalSheetsService, GenerateGoalSheetsSchema, GoalSheetError } from './goalsheets.service'

export async function goalSheetRoutes(app: FastifyInstance) {
  const svc = new GoalSheetsService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // GET /goal-sheets
  app.get('/goal-sheets', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { periodId, participantId, status } = request.query as Record<string, string>
    const data = await svc.listGoalSheets(request.tenantId, { periodId, participantId, status })
    return reply.send({ success: true, data })
  })

  // GET /goal-sheets/:id
  app.get('/goal-sheets/:id', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.getGoalSheet(request.tenantId, request.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof GoalSheetError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /goal-sheets/generate
  app.post('/goal-sheets/generate', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = GenerateGoalSheetsSchema.parse(request.body)
    const data = await svc.generate(request.tenantId, input, getCtx(request))
    return reply.status(201).send({ success: true, data })
  })

  // POST /goal-sheets/distribute
  app.post('/goal-sheets/distribute', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { goalSheetIds } = z.object({ goalSheetIds: z.array(z.string().uuid()) }).parse(request.body)
    const data = await svc.distribute(request.tenantId, goalSheetIds, getCtx(request))
    return reply.send({ success: true, data, count: data.length })
  })

  // POST /goal-sheets/:id/acknowledge
  app.post('/goal-sheets/:id/acknowledge', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const acknowledgedById = request.user.sub
      const data = await svc.acknowledge(request.tenantId, request.params.id, acknowledgedById, getCtx(request))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof GoalSheetError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })
}
