import type { FastifyInstance } from 'fastify'
import { ProrationRulesService, CreateProrationRuleSchema, UpdateProrationRuleSchema, ProrationRuleError } from './proration-rules.service'

export async function prorationRuleRoutes(app: FastifyInstance) {
  const svc = new ProrationRulesService(app.db)

  // GET /proration-rules?planVersionId=
  app.get('/proration-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { planVersionId } = request.query as { planVersionId?: string }
    const data = await svc.listRules(request.tenantId, planVersionId)
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /proration-rules
  app.post('/proration-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateProrationRuleSchema.parse(request.body)
    const data = await svc.createRule(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // PATCH /proration-rules/:id
  app.patch('/proration-rules/:id', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const input = UpdateProrationRuleSchema.parse(request.body)
      const data = await svc.updateRule(request.tenantId, request.params.id, input)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ProrationRuleError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })
}
