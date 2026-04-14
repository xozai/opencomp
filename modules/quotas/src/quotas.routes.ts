import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { QuotasService, BulkUpsertQuotaSchema } from './quotas.service'

export async function quotaRoutes(app: FastifyInstance) {
  const svc = new QuotasService(app.db)

  app.get('/quotas', {
    preHandler: [app.authenticate],
    schema: { tags: ['Quotas'], security: [{ bearerAuth: [] }] },
  }, async (request: any, reply: any) => {
    const { periodId, participantId } = z.object({
      periodId: z.string().uuid().optional(),
      participantId: z.string().uuid().optional(),
    }).parse(request.query)
    const filters = {
      ...(periodId !== undefined ? { periodId } : {}),
      ...(participantId !== undefined ? { participantId } : {}),
    }
    const data = await svc.listQuotas(request.tenantId, filters)
    return reply.send({ success: true, data })
  })

  app.post('/quotas/bulk', {
    preHandler: [app.authenticate],
    schema: { tags: ['Quotas'], security: [{ bearerAuth: [] }] },
  }, async (request: any, reply: any) => {
    const inputs = BulkUpsertQuotaSchema.parse(request.body)
    const ctx = { tenantId: request.tenantId, actorId: request.user.sub, actorType: 'user' as const }
    const data = await svc.bulkUpsert(request.tenantId, inputs, ctx)
    return reply.send({ success: true, data })
  })
}
