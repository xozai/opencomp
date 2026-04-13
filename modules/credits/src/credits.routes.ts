import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CreditsService } from './credits.service'

export async function creditRoutes(app: FastifyInstance) {
  const svc = new CreditsService(app.db)

  app.get('/credits', {
    preHandler: [app.authenticate],
    schema: { tags: ['Credits'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { periodId, participantId } = z.object({
      periodId: z.string().uuid().optional(),
      participantId: z.string().uuid().optional(),
    }).parse(request.query)
    const data = await svc.listCredits(request.tenantId, { periodId, participantId })
    return reply.send({ success: true, data })
  })

  app.post('/credits/period', {
    preHandler: [app.authenticate],
    schema: { tags: ['Credits'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { periodId, planVersionId } = z.object({
      periodId: z.string().uuid(),
      planVersionId: z.string().uuid(),
    }).parse(request.body)
    const ctx = { actorId: request.user.sub, actorType: 'user' as const }
    const data = await svc.creditPeriod(request.tenantId, periodId, planVersionId, ctx)
    return reply.send({ success: true, data })
  })
}
