import type { FastifyInstance } from 'fastify'
import { StatementsService, GenerateStatementsSchema, StatementError } from './statements.service'

export async function statementRoutes(app: FastifyInstance) {
  const svc = new StatementsService(app.db)

  const getCtx = (req: any) => ({
    tenantId: req.tenantId,
    actorId: req.user?.sub,
    actorType: 'user' as const,
  })

  // POST /statements/generate — generate statements for a run
  app.post('/statements/generate', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const input = GenerateStatementsSchema.parse(req.body)
      const data = await svc.generateForRun(req.tenantId, input, getCtx(req))
      return reply.send({ success: true, data, count: data.length })
    } catch (err) {
      if (err instanceof StatementError)
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })

  // GET /statements/:participantId/:periodId — get one participant's statement
  app.get(
    '/statements/:participantId/:periodId',
    { preHandler: [app.authenticate] },
    async (req: any, reply) => {
      const data = await svc.getParticipantStatement(
        req.tenantId,
        req.params.participantId,
        req.params.periodId,
      )
      if (!data)
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Statement not found' } })
      return reply.send({ success: true, data })
    },
  )
}
