import type { FastifyInstance } from 'fastify'
import { ExchangeRatesService, CreateExchangeRateSchema } from './exchange-rates.service'

export async function exchangeRateRoutes(app: FastifyInstance) {
  const svc = new ExchangeRatesService(app.db)

  // GET /exchange-rates
  app.get('/exchange-rates', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const data = await svc.listRates(request.tenantId)
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /exchange-rates
  app.post('/exchange-rates', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateExchangeRateSchema.parse(request.body)
    const data = await svc.createRate(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // GET /exchange-rates/latest?from=&to=
  app.get('/exchange-rates/latest', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { from, to, date } = request.query as { from?: string; to?: string; date?: string }
    if (!from || !to) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'from and to are required' } })
    }
    const data = await svc.getRate(request.tenantId, from, to, date)
    if (!data) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exchange rate not found' } })
    }
    return reply.send({ success: true, data })
  })
}
