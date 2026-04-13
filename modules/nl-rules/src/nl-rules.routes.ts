import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { parseRuleFromText } from '../../../packages/nl-rules/src'
import type { RuleType } from '../../../packages/nl-rules/src'
import { components, positions } from '../../../apps/api/src/db/schema'

export async function nlRulesRoutes(app: FastifyInstance) {
  // POST /nl-rules/parse
  app.post('/nl-rules/parse', { preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const input = z.object({
      text: z.string().min(1),
      ruleType: z.enum(['credit', 'measure', 'earnings']),
      planVersionId: z.string().uuid().optional(),
    }).parse(request.body)

    // Load context if planVersionId provided
    let planComponents: Array<{ id: string; name: string; type: string }> = []
    let positionList: Array<{ id: string; name: string; type: string }> = []

    if (input.planVersionId) {
      const componentRows = await app.db
        .select({ id: components.id, name: components.name, type: components.type })
        .from(components)
        .where(
          and(
            eq(components.tenantId, request.tenantId),
            eq(components.planVersionId, input.planVersionId),
          ),
        )
      planComponents = componentRows
    }

    const positionRows = await app.db
      .select({ id: positions.id, name: positions.name, type: positions.type })
      .from(positions)
      .where(eq(positions.tenantId, request.tenantId))

    positionList = positionRows

    const result = await parseRuleFromText(input.text, input.ruleType as RuleType, {
      planComponents,
      positions: positionList,
    })

    return reply.send({ success: true, data: result })
  })
}
