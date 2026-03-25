import type { FastifyInstance } from 'fastify'
import { PayoutsService } from './payouts.service'

export async function payoutsRoutes(app: FastifyInstance) {
  const svc = new PayoutsService(app.db)

  // GET /payouts?calculationRunId=&participantId=&periodId=
  app.get('/', async (request, reply) => {
    const { calculationRunId, participantId, periodId } = request.query as Record<string, string>
    const tenantId = request.tenantId

    if (calculationRunId) {
      const data = await svc.listForRun(tenantId, calculationRunId)
      return reply.send({ success: true, data })
    }

    if (participantId) {
      const data = await svc.listForParticipant(tenantId, participantId, periodId)
      return reply.send({ success: true, data })
    }

    return reply.status(400).send({
      success: false,
      error: { code: 'MISSING_FILTER', message: 'Provide calculationRunId or participantId' },
    })
  })

  // GET /payouts/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const payout = await svc.get(request.tenantId, request.params.id)
    return reply.send({ success: true, data: payout })
  })

  // POST /payouts/runs/:runId/approve
  app.post<{ Params: { runId: string } }>('/runs/:runId/approve', async (request, reply) => {
    const ctx = { actorId: (request as any).user?.id, tenantId: request.tenantId }
    const result = await svc.approveRun(request.tenantId, request.params.runId, ctx)
    return reply.send({ success: true, data: result })
  })

  // POST /payouts/mark-paid
  app.post<{ Body: { payoutIds: string[] } }>('/mark-paid', async (request, reply) => {
    const ctx = { actorId: (request as any).user?.id, tenantId: request.tenantId }
    const result = await svc.markPaid(request.tenantId, request.body.payoutIds, ctx)
    return reply.send({ success: true, data: result })
  })
}
