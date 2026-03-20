/**
 * Sample CRM importer plugin.
 *
 * Demonstrates the TransactionAdapterExtension SDK interface.
 * Simulates pulling closed-won deals from a CRM and yielding them
 * as SourceTransaction-compatible records for ingestion.
 */

import { registerPlugin } from '../../../packages/sdk/src'
import type { TransactionAdapterExtension } from '../../../packages/sdk/src'

interface CrmDeal {
  dealId: string
  closedDate: string
  ownerId: string       // maps to participant.employeeId
  amount: number        // USD
  currency: string
  stage: string
}

// Simulate a CRM API call — replace with real HTTP fetch in production
async function* fetchDealsFromCrm(
  config: Record<string, unknown>,
  since?: Date,
): AsyncIterable<CrmDeal> {
  const baseUrl = config.baseUrl as string ?? 'https://crm.example.com'
  const apiKey = config.apiKey as string ?? ''

  // Stub: yield demo deals
  const demoDeals: CrmDeal[] = [
    { dealId: 'deal-001', closedDate: '2026-03-01', ownerId: 'EMP-001', amount: 50000, currency: 'USD', stage: 'closed_won' },
    { dealId: 'deal-002', closedDate: '2026-03-15', ownerId: 'EMP-002', amount: 120000, currency: 'USD', stage: 'closed_won' },
    { dealId: 'deal-003', closedDate: '2026-03-20', ownerId: 'EMP-001', amount: 35000, currency: 'USD', stage: 'closed_won' },
  ]

  for (const deal of demoDeals) {
    if (since && new Date(deal.closedDate) < since) continue
    yield deal
  }
}

const crmAdapter: TransactionAdapterExtension = {
  adapterId: 'sample.crm-importer',

  async *fetchTransactions(
    config: Record<string, unknown>,
    since?: Date,
  ): AsyncIterable<{
    externalId: string
    employeeId: string
    transactionDate: string
    amountCents: number
    currency: string
    source: string
    metadata: Record<string, unknown>
  }> {
    for await (const deal of fetchDealsFromCrm(config, since)) {
      yield {
        externalId: deal.dealId,
        employeeId: deal.ownerId,
        transactionDate: deal.closedDate,
        amountCents: Math.round(deal.amount * 100),
        currency: deal.currency,
        source: 'sample.crm-importer',
        metadata: { stage: deal.stage, originalAmount: deal.amount },
      }
    }
  },
}

registerPlugin({
  manifest: {
    id: 'sample-crm-importer',
    name: 'Sample CRM Importer',
    version: '0.1.0',
    description: 'Imports closed-won deals from a CRM system as source transactions',
    author: 'OpenComp Contributors',
    license: 'Apache-2.0',
    extensionPoints: ['transaction-adapter'],
  },
  extensions: [
    { type: 'transaction-adapter', implementation: crmAdapter },
  ],
})

export { crmAdapter }
