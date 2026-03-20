/**
 * Fastify plugin: resolves the current tenant from the request.
 *
 * Strategy (in priority order):
 *  1. X-Tenant-Id header (for machine-to-machine)
 *  2. Subdomain (e.g. acme.opencomp.app → tenant slug "acme")
 *  3. JWT payload tenantId (set after auth)
 *
 * Attaches `request.tenantId` to all requests.
 * Returns 400 if tenant cannot be resolved.
 */
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { tenants } from '../../../apps/api/src/db/schema'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    tenantSlug: string
  }
}

const tenancyPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. Explicit header
    const headerTenantId = request.headers['x-tenant-id'] as string | undefined
    if (headerTenantId) {
      request.tenantId = headerTenantId
      return
    }

    // 2. Default tenant (single-tenant dev mode)
    const defaultTenantId = process.env.DEFAULT_TENANT_ID
    if (defaultTenantId) {
      request.tenantId = defaultTenantId
      return
    }

    // 3. Subdomain resolution
    const host = request.hostname ?? ''
    const subdomain = host.split('.')[0]
    if (subdomain && subdomain !== 'localhost' && subdomain !== 'api') {
      const [tenant] = await app.db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.slug, subdomain))
        .limit(1)

      if (tenant) {
        request.tenantId = tenant.id
        request.tenantSlug = tenant.slug
        return
      }
    }

    return reply.status(400).send({
      success: false,
      error: { code: 'TENANT_NOT_FOUND', message: 'Could not resolve tenant from request' },
    })
  })
}

export const tenancyFastifyPlugin = fp(tenancyPlugin, {
  name: 'opencomp-tenancy',
})
