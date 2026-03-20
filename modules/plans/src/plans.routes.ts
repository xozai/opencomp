import type { FastifyInstance } from 'fastify'
import { PlansService, CreatePlanSchema, UpdatePlanSchema, CreateComponentSchema, PlanError } from './plans.service'

export async function planRoutes(app: FastifyInstance) {
  const svc = new PlansService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // GET /plans
  app.get('/plans', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await svc.listPlans(request.tenantId)
    return reply.send({ success: true, data })
  })

  // GET /plans/:planId
  app.get('/plans/:planId', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.getPlan(request.tenantId, request.params.planId)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PlanError && err.code === 'PLAN_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /plans
  app.post('/plans', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = CreatePlanSchema.parse(request.body)
    const data = await svc.createPlan(request.tenantId, input, getCtx(request))
    return reply.status(201).send({ success: true, data })
  })

  // PATCH /plans/:planId
  app.patch('/plans/:planId', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const input = UpdatePlanSchema.parse(request.body)
      const data = await svc.updatePlan(request.tenantId, request.params.planId, input, getCtx(request))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PlanError) {
        const status = err.code === 'PLAN_NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /plans/:planId/submit
  app.post('/plans/:planId/submit', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.submitPlanForApproval(request.tenantId, request.params.planId, getCtx(request))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PlanError) {
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /plans/:planId/publish
  app.post('/plans/:planId/publish', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.publishPlan(request.tenantId, request.params.planId, getCtx(request))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PlanError) {
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /plans/:planId/versions/:versionId/components
  app.get('/plans/:planId/versions/:versionId/components', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const data = await svc.listComponents(request.tenantId, request.params.versionId)
    return reply.send({ success: true, data })
  })

  // POST /plans/:planId/versions/:versionId/components
  app.post('/plans/:planId/versions/:versionId/components', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = CreateComponentSchema.parse(request.body)
    const data = await svc.addComponent(request.tenantId, request.params.versionId, input, getCtx(request))
    return reply.status(201).send({ success: true, data })
  })
}
