import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ParticipantsService,
  CreateParticipantSchema,
  UpdateParticipantSchema,
  ListParticipantsQuerySchema,
  ParticipantError,
} from './participants.service'

export async function participantRoutes(app: FastifyInstance) {
  const svc = new ParticipantsService(app.db)

  const getCtx = (req: any) => ({
    tenantId: req.tenantId,
    actorId: req.user?.sub,
    actorType: 'user' as const,
  })

  // GET /participants
  app.get('/participants', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    const query = ListParticipantsQuerySchema.parse(req.query)
    const data = await svc.list(req.tenantId, query)
    return reply.send({ success: true, ...data })
  })

  // GET /participants/:id
  app.get('/participants/:id', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const data = await svc.get(req.tenantId, req.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ParticipantError && err.code === 'NOT_FOUND')
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })

  // POST /participants
  app.post('/participants', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const input = CreateParticipantSchema.parse(req.body)
      const data = await svc.create(req.tenantId, input, getCtx(req))
      return reply.status(201).send({ success: true, data })
    } catch (err) {
      if (err instanceof ParticipantError)
        return reply.status(422).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })

  // PATCH /participants/:id
  app.patch('/participants/:id', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const input = UpdateParticipantSchema.parse(req.body)
      const data = await svc.update(req.tenantId, req.params.id, input, getCtx(req))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ParticipantError) {
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 422).send({
          success: false, error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  })

  // POST /participants/:id/terminate
  app.post('/participants/:id/terminate', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      const { terminationDate } = z.object({ terminationDate: z.string().date() }).parse(req.body)
      const data = await svc.terminate(req.tenantId, req.params.id, terminationDate, getCtx(req))
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ParticipantError) {
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 422).send({
          success: false, error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  })

  // DELETE /participants/:id
  app.delete('/participants/:id', { preHandler: [app.authenticate] }, async (req: any, reply) => {
    try {
      await svc.softDelete(req.tenantId, req.params.id, getCtx(req))
      return reply.status(204).send()
    } catch (err) {
      if (err instanceof ParticipantError && err.code === 'NOT_FOUND')
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      throw err
    }
  })
}
