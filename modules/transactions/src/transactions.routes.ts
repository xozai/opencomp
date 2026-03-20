import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TransactionsService, IngestTransactionSchema, BulkIngestSchema, TransactionError } from './transactions.service'

export async function transactionRoutes(app: FastifyInstance) {
  const svc = new TransactionsService(app.db)

  const getCtx = (request: any) => ({
    tenantId: request.tenantId,
    actorId: request.user?.sub,
    actorType: 'user' as const,
  })

  // GET /transactions
  app.get('/transactions', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { status, source, participantId } = request.query as Record<string, string>
    const data = await svc.listTransactions(request.tenantId, { status, source, participantId })
    return reply.send({ success: true, data, total: data.length })
  })

  // GET /transactions/:id
  app.get('/transactions/:id', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.getTransaction(request.tenantId, request.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof TransactionError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /transactions/ingest — single transaction
  app.post('/transactions/ingest', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const input = IngestTransactionSchema.parse(request.body)
    const data = await svc.ingest(request.tenantId, input, getCtx(request))
    const status = data.duplicate ? 200 : 201
    return reply.status(status).send({ success: true, data })
  })

  // POST /transactions/ingest/bulk
  app.post('/transactions/ingest/bulk', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { source, transactions } = BulkIngestSchema.parse(request.body)
    const data = await svc.bulkIngest(request.tenantId, transactions, source, getCtx(request))
    return reply.status(207).send({ success: true, data })
  })

  // POST /transactions/:id/validate
  app.post('/transactions/:id/validate', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    try {
      const data = await svc.validate(request.tenantId, request.params.id, getCtx(request))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof TransactionError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422
        return reply.status(status).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /transactions/validate-pending
  app.post('/transactions/validate-pending', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const data = await svc.validatePending(request.tenantId, getCtx(request))
    return reply.send({ success: true, data })
  })
}
