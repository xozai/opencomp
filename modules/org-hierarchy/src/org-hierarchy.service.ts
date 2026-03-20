/**
 * Org Hierarchy module — territory trees and manager relationships.
 * Stores a flat list of nodes; parent-child links form the tree.
 * Used by crediting rules (territory rollups) and dispute routing (manager lookup).
 */

import { eq, and, isNull } from 'drizzle-orm'
import type { Db } from '../../../apps/api/src/db/client'
import { participants } from '../../../apps/api/src/db/schema'

export interface OrgNode {
  id: string
  tenantId: string
  participantId: string
  managerId: string | null   // participantId of direct manager
  territory: string | null
  level: number              // 0 = IC rep, 1 = first-line manager, etc.
}

export class OrgHierarchyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'OrgHierarchyError'
  }
}

// In-memory store per tenant (sufficient until a dedicated table is added via migration)
const store = new Map<string, OrgNode[]>()

function tenantNodes(tenantId: string): OrgNode[] {
  if (!store.has(tenantId)) store.set(tenantId, [])
  return store.get(tenantId)!
}

export class OrgHierarchyService {
  constructor(private db: Db) {}

  /** Upsert a node (create or update manager / territory). */
  upsert(node: Omit<OrgNode, 'level'> & { level?: number }): OrgNode {
    const nodes = tenantNodes(node.tenantId)
    const idx = nodes.findIndex((n) => n.participantId === node.participantId)
    const level = node.level ?? (node.managerId ? 0 : 1)
    const entry: OrgNode = { ...node, level }
    if (idx === -1) nodes.push(entry)
    else nodes[idx] = entry
    return entry
  }

  /** Get a node by participantId. */
  get(tenantId: string, participantId: string): OrgNode | null {
    return tenantNodes(tenantId).find((n) => n.participantId === participantId) ?? null
  }

  /** Get direct reports of a manager. */
  directReports(tenantId: string, managerId: string): OrgNode[] {
    return tenantNodes(tenantId).filter((n) => n.managerId === managerId)
  }

  /** Get all reports in the subtree rooted at managerId (recursive). */
  subtree(tenantId: string, managerId: string): OrgNode[] {
    const result: OrgNode[] = []
    const queue = [managerId]
    while (queue.length) {
      const current = queue.shift()!
      const reports = this.directReports(tenantId, current)
      result.push(...reports)
      queue.push(...reports.map((r) => r.participantId))
    }
    return result
  }

  /** Walk up the tree from participantId to the root, returning the chain. */
  managerChain(tenantId: string, participantId: string): OrgNode[] {
    const chain: OrgNode[] = []
    let current = participantId
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      const node = this.get(tenantId, current)
      if (!node || !node.managerId) break
      const manager = this.get(tenantId, node.managerId)
      if (!manager) break
      chain.push(manager)
      current = manager.participantId
    }
    return chain
  }

  /** Find first manager at or above `targetLevel` in the chain. */
  firstManagerAtLevel(tenantId: string, participantId: string, targetLevel: number): OrgNode | null {
    return this.managerChain(tenantId, participantId).find((n) => n.level >= targetLevel) ?? null
  }

  /** List all nodes for a tenant. */
  list(tenantId: string): OrgNode[] {
    return [...tenantNodes(tenantId)]
  }

  /** Remove a node (e.g., when participant is terminated). */
  remove(tenantId: string, participantId: string): boolean {
    const nodes = tenantNodes(tenantId)
    const idx = nodes.findIndex((n) => n.participantId === participantId)
    if (idx === -1) return false
    nodes.splice(idx, 1)
    return true
  }
}
