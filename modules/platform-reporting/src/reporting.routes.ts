import type { FastifyInstance } from 'fastify'
import { ReportingService } from './reporting.service'

export async function reportingRoutes(app: FastifyInstance) {
  const svc = new ReportingService(app.db)

  // GET /reports/payouts?periodId=
  app.get<{ Querystring: { periodId: string } }>('/payouts', async (request, reply) => {
    const { periodId } = request.query
    if (!periodId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PERIOD_ID', message: 'periodId is required' } })
    }
    const data = await svc.payoutSummary(request.tenantId, periodId)
    return reply.send({ success: true, data })
  })

  // GET /reports/payouts/csv?periodId=
  app.get<{ Querystring: { periodId: string } }>('/payouts/csv', async (request, reply) => {
    const { periodId } = request.query
    if (!periodId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PERIOD_ID', message: 'periodId is required' } })
    }
    const csv = await svc.exportPayoutCsv(request.tenantId, periodId)
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="payouts-${periodId}.csv"`)
      .send(csv)
  })

  // GET /reports/runs?periodId=
  app.get<{ Querystring: { periodId?: string } }>('/runs', async (request, reply) => {
    const data = await svc.runSummary(request.tenantId, request.query.periodId)
    return reply.send({ success: true, data })
  })

  // GET /reports/attainment/:runId
  app.get<{ Params: { runId: string } }>('/attainment/:runId', async (request, reply) => {
    const data = await svc.attainmentBreakdown(request.tenantId, request.params.runId)
    return reply.send({ success: true, data })
  })
}
