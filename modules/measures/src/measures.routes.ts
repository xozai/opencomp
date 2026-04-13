import type { FastifyInstance } from 'fastify'
import { MeasuresService, CreateMeasureDefinitionSchema, UpdateMeasureDefinitionSchema, MeasureError } from './measures.service'

export async function measureRoutes(app: FastifyInstance) {
  const svc = new MeasuresService(app.db)

  // GET /measure-definitions?planVersionId=
  app.get('/measure-definitions', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { planVersionId } = request.query as { planVersionId?: string }
    const data = await svc.listDefinitions(request.tenantId, planVersionId)
    return reply.send({ success: true, data, total: data.length })
  })

  // POST /measure-definitions
  app.post('/measure-definitions', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = CreateMeasureDefinitionSchema.parse(request.body)
    const data = await svc.createDefinition(request.tenantId, input)
    return reply.status(201).send({ success: true, data })
  })

  // PUT /measure-definitions/:id
  app.put('/measure-definitions/:id', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    try {
      const input = UpdateMeasureDefinitionSchema.parse(request.body)
      const data = await svc.updateDefinition(request.tenantId, request.params.id, input)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof MeasureError && err.code === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: { code: err.code, message: err.message } })
      }
      throw err
    }
  })

  // GET /measure-results?calculationRunId=&participantId=
  app.get('/measure-results', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const { calculationRunId, participantId, componentId } = request.query as {
      calculationRunId?: string
      participantId?: string
      componentId?: string
    }
    const data = await svc.listResults(request.tenantId, { calculationRunId, participantId, componentId })
    return reply.send({ success: true, data, total: data.length })
  })
}
