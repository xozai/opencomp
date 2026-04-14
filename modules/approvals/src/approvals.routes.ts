import type { FastifyInstance } from 'fastify'
import {
  ApprovalsService,
  CreateApprovalRequestSchema,
  DecideApprovalSchema,
  ApprovalError,
} from './approvals.service'
import { z } from 'zod'

export async function approvalRoutes(app: FastifyInstance) {
  const svc = new ApprovalsService(app.db)

  const getCtx = (req: any) => ({
    tenantId: req.tenantId,
    actorId: req.user?.sub,
    actorType: 'user' as const,
  })

  // GET /approvals
  app.get('/approvals', { preHandler: [app.authenticate] }, async (req: any, reply: any) => {
    const { status, workflowType, assignedToId } = req.query as Record<string, string | undefined>
    const data = await svc.list(req.tenantId, {
      ...(status !== undefined ? { status } : {}),
      ...(workflowType !== undefined ? { workflowType } : {}),
      ...(assignedToId !== undefined ? { assignedToId } : {}),
    })
    return reply.send({ success: true, data, total: data.length })
  })

  // GET /approvals/:id
  app.get('/approvals/:id', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const data = await svc.get(req.tenantId, req.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ApprovalError && err.code === 'NOT_FOUND')
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })

  // POST /approvals
  app.post('/approvals', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    const input = CreateApprovalRequestSchema.parse(req.body)
    const data = await svc.create(req.tenantId, input, req.user.sub, getCtx(req))
    return reply.status(201).send({ success: true, data })
  })

  // PATCH /approvals/:id/assign
  app.patch('/approvals/:id/assign', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const { assignedToId } = z.object({ assignedToId: z.string().uuid() }).parse(req.body)
      const data = await svc.assign(req.tenantId, req.params.id, assignedToId, getCtx(req))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ApprovalError)
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 422).send({
          success: false, error: { code: err.code, message: err.message },
        })
      throw err
    }
  })

  // POST /approvals/:id/decide
  app.post('/approvals/:id/decide', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const input = DecideApprovalSchema.parse(req.body)
      const data = await svc.decide(req.tenantId, req.params.id, input, req.user.sub, getCtx(req))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ApprovalError)
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 422).send({
          success: false, error: { code: err.code, message: err.message },
        })
      throw err
    }
  })
}
