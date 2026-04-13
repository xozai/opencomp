import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CreditRulesService, CreateCreditRuleSchema, UpdateCreditRuleSchema, CreditRuleError } from './credit-rules.service'

export async function creditRuleRoutes(app: FastifyInstance) {
  const svc = new CreditRulesService(app.db)

  // GET /credit-rules?planVersionId=
  app.get('/credit-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { planVersionId } = request.query as { planVersionId?: string }
    const data = await svc.listRules(request.tenantId, planVersionId)
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /credit-rules
  app.post('/credit-rules', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateCreditRuleSchema.parse(request.body)
    const data = await svc.createRule(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // PUT /credit-rules/:id
  app.put('/credit-rules/:id', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const input = UpdateCreditRuleSchema.parse(request.body)
      const data = await svc.updateRule(request.tenantId, request.params.id, input)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof CreditRuleError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /credit-rules/preview
  app.post('/credit-rules/preview', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = z.object({
      creditRuleId: z.string().uuid(),
      sampleTransactions: z.array(z.object({
        id: z.string(),
        amountCents: z.number().int(),
        currency: z.string(),
        participantId: z.string().nullable(),
        payload: z.record(z.unknown()),
      })),
    }).parse(request.body)

    const data = await svc.previewRule(request.tenantId, input)
    return reply.send({ success: true, data })
  })
}
