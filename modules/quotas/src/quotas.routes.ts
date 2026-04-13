import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { QuotasService, BulkUpsertQuotaSchema } from './quotas.service'

export async function quotaRoutes(app: FastifyInstance) {
  const svc = new QuotasService(app.db)

  app.get('/quotas', {
    preHandler: [app.authenticate],
    schema: { tags: ['Quotas'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { periodId, participantId } = z.object({
      periodId: z.string().uuid().optional(),
      participantId: z.string().uuid().optional(),
    }).parse(request.query)
    const data = await svc.listQuotas(request.tenantId, { periodId, participantId })
    return reply.send({ success: true, data })
  })

  app.post('/quotas/bulk', {
    preHandler: [app.authenticate],
    schema: { tags: ['Quotas'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const inputs = BulkUpsertQuotaSchema.parse(request.body)
    const ctx = { actorId: request.user.sub, actorType: 'user' as const }
    const data = await svc.bulkUpsert(request.tenantId, inputs, ctx)
    return reply.send({ success: true, data })
  })
}
