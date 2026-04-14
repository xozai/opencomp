import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PaymentsService, PaymentError } from './payments.service'

export async function paymentRoutes(app: FastifyInstance) {
  const svc = new PaymentsService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // POST /payments/calculate
  app.post('/payments/calculate', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { periodId, planVersionId, calculationRunId } = z.object({
      periodId: z.string().uuid(),
      planVersionId: z.string().uuid(),
      calculationRunId: z.string().uuid(),
    }).parse(request.body)

    const data = await svc.calculatePayments(
      request.tenantId,
      calculationRunId,
      periodId,
      planVersionId,
      getCtx(request),
    )
    return reply.send({ success: true, data })
  })

  // GET /payments?participantId=&periodId=
  app.get('/payments', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { participantId, periodId } = request.query as { participantId?: string; periodId?: string }
    const data = await svc.getPayments(request.tenantId, {
      ...(participantId !== undefined ? { participantId } : {}),
      ...(periodId !== undefined ? { periodId } : {}),
    })
    return reply.send({ success: true, data, total: data.length })
  })

  // GET /payments/statements?participantId=&periodId=
  app.get('/payments/statements', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const { participantId, periodId } = z.object({
        participantId: z.string().uuid(),
        periodId: z.string().uuid(),
      }).parse(request.query)

      const data = await svc.getStatement(request.tenantId, participantId, periodId)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PaymentError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /payments/statements/:id/approve
  app.post('/payments/statements/:id/approve', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const data = await svc.approveStatement(
        request.tenantId,
        request.params.id,
        request.user.sub,
        getCtx(request),
      )
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PaymentError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /payments/statements/:id/mark-paid
  app.post('/payments/statements/:id/mark-paid', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const data = await svc.markPaid(
        request.tenantId,
        request.params.id,
        request.user.sub,
        getCtx(request),
      )
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PaymentError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /payments/restate
  app.post('/payments/restate', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { periodId, planVersionId, calculationRunId } = z.object({
      periodId: z.string().uuid(),
      planVersionId: z.string().uuid(),
      calculationRunId: z.string().uuid(),
    }).parse(request.body)

    await svc.restateEarnings(
      request.tenantId,
      calculationRunId,
      periodId,
      planVersionId,
      getCtx(request),
    )
    return reply.send({ success: true, data: { restated: true } })
  })
}
