/**
 * Integrations module — CRM and HRIS adapter framework.
 *
 * Adapters implement TransactionAdapterExtension (from SDK) for CRM deal sync
 * and HrisAdapterExtension for employee roster sync.
 *
 * Integrations are tenant-scoped; credentials are stored encrypted in DB (stub: in-memory).
 */

import { z } from 'zod'
import type { TransactionAdapterExtension } from '../../../packages/sdk/src'
import { eventBus } from '../../../packages/events/src'
import { createEvent } from '../../../packages/events/src/domain-events'

// ─── Types ────────────────────────────────────────────────────────────────────

export const IntegrationConfigSchema = z.object({
  adapterId: z.string(),
  name: z.string(),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  syncIntervalMinutes: z.number().int().min(1).default(60),
})

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>

export interface SyncResult {
  adapterId: string
  tenantId: string
  recordsSynced: number
  errors: string[]
  startedAt: string
  completedAt: string
}

export class IntegrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'IntegrationError'
  }
}

// ─── HRIS adapter interface ───────────────────────────────────────────────────

export interface EmployeeRecord {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department?: string
  managerId?: string
  hiredDate?: string
  terminatedDate?: string
  status: 'active' | 'inactive'
}

export interface HrisAdapterExtension {
  adapterId: string
  fetchEmployees(config: Record<string, unknown>): AsyncIterable<EmployeeRecord>
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const transactionAdapters = new Map<string, TransactionAdapterExtension>()
const hrisAdapters = new Map<string, HrisAdapterExtension>()
const tenantConfigs = new Map<string, IntegrationConfig[]>()

export function registerTransactionAdapter(adapter: TransactionAdapterExtension) {
  transactionAdapters.set(adapter.adapterId, adapter)
}

export function registerHrisAdapter(adapter: HrisAdapterExtension) {
  hrisAdapters.set(adapter.adapterId, adapter)
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IntegrationsService {
  setConfig(tenantId: string, cfg: IntegrationConfig): void {
    const configs = tenantConfigs.get(tenantId) ?? []
    const idx = configs.findIndex((c) => c.adapterId === cfg.adapterId)
    if (idx === -1) configs.push(cfg)
    else configs[idx] = cfg
    tenantConfigs.set(tenantId, configs)
  }

  getConfigs(tenantId: string): IntegrationConfig[] {
    return tenantConfigs.get(tenantId) ?? []
  }

  getConfig(tenantId: string, adapterId: string): IntegrationConfig | null {
    return this.getConfigs(tenantId).find((c) => c.adapterId === adapterId) ?? null
  }

  listAdapters(): { transactionAdapters: string[]; hrisAdapters: string[] } {
    return {
      transactionAdapters: [...transactionAdapters.keys()],
      hrisAdapters: [...hrisAdapters.keys()],
    }
  }

  /**
   * Pull transactions from a CRM adapter and yield raw records for ingestion.
   * The caller (worker job) passes these to TransactionsService.bulkIngest().
   */
  async *syncTransactions(
    tenantId: string,
    adapterId: string,
    since?: Date,
  ): AsyncIterable<unknown> {
    const adapter = transactionAdapters.get(adapterId)
    if (!adapter) {
      throw new IntegrationError('ADAPTER_NOT_FOUND', `Transaction adapter "${adapterId}" not registered`)
    }

    const cfg = this.getConfig(tenantId, adapterId)
    if (!cfg?.enabled) {
      throw new IntegrationError('INTEGRATION_DISABLED', `Integration "${adapterId}" is disabled for this tenant`)
    }

    const startedAt = new Date().toISOString()
    let count = 0

    for await (const record of adapter.fetchTransactions(cfg.config, since)) {
      count++
      yield record
    }

    await eventBus.publish(
      createEvent('integration.sync_completed', tenantId, {
        adapterId,
        recordsSynced: count,
        startedAt,
        completedAt: new Date().toISOString(),
      }),
    )
  }

  /**
   * Pull employee roster from an HRIS adapter.
   * The caller (worker job) reconciles with the participants table.
   */
  async *syncEmployees(
    tenantId: string,
    adapterId: string,
  ): AsyncIterable<EmployeeRecord> {
    const adapter = hrisAdapters.get(adapterId)
    if (!adapter) {
      throw new IntegrationError('ADAPTER_NOT_FOUND', `HRIS adapter "${adapterId}" not registered`)
    }

    const cfg = this.getConfig(tenantId, adapterId)
    if (!cfg?.enabled) {
      throw new IntegrationError('INTEGRATION_DISABLED', `Integration "${adapterId}" is disabled for this tenant`)
    }

    for await (const employee of adapter.fetchEmployees(cfg.config)) {
      yield employee
    }
  }
}

export const integrationsService = new IntegrationsService()
