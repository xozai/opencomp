import type { FastifyInstance } from 'fastify'
import { PositionsService, CreatePositionSchema, UpdatePositionSchema, CreateRelationshipSchema, PositionError } from './positions.service'

export async function positionRoutes(app: FastifyInstance) {
  const svc = new PositionsService(app.db)

  // GET /positions
  app.get('/positions', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { type } = request.query as { type?: string }
    const data = await svc.listPositions(request.tenantId, { type })
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /positions
  app.post('/positions', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreatePositionSchema.parse(request.body)
    const data = await svc.createPosition(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // PATCH /positions/:id
  app.patch('/positions/:id', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const input = UpdatePositionSchema.parse(request.body)
      const data = await svc.updatePosition(request.tenantId, request.params.id, input)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PositionError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /positions/:id/hierarchy
  app.get('/positions/:id/hierarchy', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const data = await svc.getHierarchy(request.tenantId, request.params.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PositionError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // POST /position-relationships
  app.post('/position-relationships', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateRelationshipSchema.parse(request.body)
    const data = await svc.createRelationship(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // GET /position-relationships?positionId=
  app.get('/position-relationships', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { positionId } = request.query as { positionId?: string }
    if (!positionId) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'positionId is required' } })
    }
    const data = await svc.listRelationships(request.tenantId, positionId)
    return reply.send({ success: true, data, total: data.length })
  })
}
