import type { FastifyInstance } from 'fastify'
import { EarningsService, CreateEarningsRuleSchema, UpdateEarningsRuleSchema, EarningsError } from './earnings.service'

export async function earningsRoutes(app: FastifyInstance) {
  const svc = new EarningsService(app.db)

  // GET /earnings-rules?planVersionId=
  app.get('/earnings-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { planVersionId } = request.query as { planVersionId?: string }
    const data = await svc.listRules(request.tenantId, planVersionId)
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /earnings-rules
  app.post('/earnings-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateEarningsRuleSchema.parse(request.body)
    const data = await svc.createRule(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // PUT /earnings-rules/:id
  app.put('/earnings-rules/:id', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const input = UpdateEarningsRuleSchema.parse(request.body)
      const data = await svc.updateRule(request.tenantId, request.params.id, input)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof EarningsError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /earnings-results?calculationRunId=&participantId=
  app.get('/earnings-results', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { calculationRunId, participantId, componentId } = request.query as {
      calculationRunId?: string
      participantId?: string
      componentId?: string
    }
    const data = await svc.listResults(request.tenantId, {
      ...(calculationRunId !== undefined ? { calculationRunId } : {}),
      ...(participantId !== undefined ? { participantId } : {}),
      ...(componentId !== undefined ? { componentId } : {}),
    })
    return reply.send({ success: true, data, total: data.length })
  })
}
