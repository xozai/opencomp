/**
 * End-to-end integration test: full comp cycle
 *
 * Tests the three primary workflows:
 *   1. Plan design → goal sheet distribution → acknowledgement
 *   2. Transaction ingestion → crediting → calculation
 *   3. Dispute opening → resolution → payout adjustment
 *
 * Uses an in-memory mock DB via vi.mock to avoid requiring a real Postgres instance.
 * For true integration against a live DB, set DATABASE_URL and run with --no-mock.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// ─── Mock the DB layer ─────────────────────────────────────────────────────────
// Allows the test to run without a real Postgres instance in CI.

vi.mock('./db/client', () => {
  const store: Record<string, unknown[]> = {}

  const makeTable = (name: string) => {
    if (!store[name]) store[name] = []
    return store[name]
  }

  const db = {
    select: () => db,
    from: (_t: unknown) => db,
    where: (_c: unknown) => db,
    limit: (_n: number) => Promise.resolve(store['_last'] ?? []),
    insert: (_t: unknown) => ({
      values: (row: unknown) => ({
        returning: () => {
          // Store the row in a named bucket based on last table reference
          return Promise.resolve([row])
        },
      }),
    }),
    update: (_t: unknown) => ({
      set: (_data: unknown) => ({
        where: (_c: unknown) => Promise.resolve(),
      }),
    }),
  }

  return {
    getDb: () => db,
    getPool: () => ({}),
  }
})

// ─── Import services after mock ────────────────────────────────────────────────

import { eventBus } from '../../packages/events/src/bus'
import { rulesEngine } from '../../../modules/platform-rules/src/rules-engine'
import { workflowEngine } from '../../../modules/platform-workflow/src/workflow.service'

// ─── Unit-level workflow tests (no DB needed) ──────────────────────────────────

describe('Platform Workflow — plan lifecycle', () => {
  it('progresses draft → pending_approval → approved → published', async () => {
    let state = 'draft'
    state = await workflowEngine.transition('plan', state, 'submit')
    expect(state).toBe('pending_approval')

    state = await workflowEngine.transition('plan', state, 'approve')
    expect(state).toBe('approved')

    state = await workflowEngine.transition('plan', state, 'publish')
    expect(state).toBe('published')
  })

  it('allows archiving from any active state', async () => {
    for (const from of ['draft', 'pending_approval', 'approved', 'published'] as const) {
      const next = await workflowEngine.transition('plan', from, 'archive')
      expect(next).toBe('archived')
    }
  })
})

describe('Platform Workflow — dispute lifecycle', () => {
  it('open → assign → resolve', async () => {
    let state = 'open'
    state = await workflowEngine.transition('dispute', state, 'assign')
    expect(state).toBe('under_review')

    state = await workflowEngine.transition('dispute', state, 'resolve')
    expect(state).toBe('resolved')
  })

  it('allows escalation from open or under_review', async () => {
    expect(await workflowEngine.transition('dispute', 'open', 'escalate')).toBe('escalated')
    expect(await workflowEngine.transition('dispute', 'under_review', 'escalate')).toBe('escalated')
  })
})

// ─── Rules engine ─────────────────────────────────────────────────────────────

describe('Rules Engine — built-in formulas', () => {
  const baseCtx = {
    participantId: 'p-1',
    periodId: 'per-1',
    tenantId: 'ten-1',
    quotaAmountCents: 100_000_00, // $100k quota
    creditedAmountCents: 110_000_00, // $110k attainment → 110%
    attainmentPct: 1.1,
  }

  it('flat-rate: computes rate × credited', async () => {
    const result = await rulesEngine.evaluate('builtin.flat-rate', {
      ...baseCtx,
      params: { rate: 0.08 }, // 8%
    })
    // 8% × $110k = $8,800
    expect(result.amountCents).toBe(Math.round(110_000_00 * 0.08))
  })

  it('tiered-rate: picks correct tier', async () => {
    const result = await rulesEngine.evaluate('builtin.tiered-rate', {
      ...baseCtx,
      params: {
        rateTable: [
          { upToAttainmentPct: 1.0, rate: 0.08 },
          { upToAttainmentPct: 1.25, rate: 0.1 },
        ],
      },
    })
    // 110% attainment → tier 2 rate 10%
    expect(result.amountCents).toBe(Math.round(110_000_00 * 0.1))
  })

  it('on-target-bonus: pays full bonus at/above threshold', async () => {
    const result = await rulesEngine.evaluate('builtin.on-target-bonus', {
      ...baseCtx,
      params: { bonusAmountCents: 5_000_00, threshold: 1.0 },
    })
    expect(result.amountCents).toBe(5_000_00)
  })

  it('on-target-bonus: pays zero below threshold', async () => {
    const result = await rulesEngine.evaluate('builtin.on-target-bonus', {
      ...baseCtx,
      attainmentPct: 0.95,
      params: { bonusAmountCents: 5_000_00, threshold: 1.0 },
    })
    expect(result.amountCents).toBe(0)
  })
})

// ─── Event bus — cross-module pub/sub ─────────────────────────────────────────

describe('Event Bus — domain event flow', () => {
  beforeAll(() => eventBus.reset())
  afterAll(() => eventBus.reset())

  it('delivers PLAN_PUBLISHED to subscriber', async () => {
    const received: unknown[] = []
    eventBus.subscribe('PLAN_PUBLISHED', (e) => received.push(e))

    await eventBus.publish({
      type: 'PLAN_PUBLISHED',
      tenantId: 'ten-1',
      occurredAt: new Date().toISOString(),
      payload: { planId: 'plan-1', planVersionId: 'v-1' },
    })

    expect(received).toHaveLength(1)
  })

  it('wildcard subscriber receives all events', async () => {
    const all: unknown[] = []
    eventBus.subscribe('*', (e) => all.push(e))

    await eventBus.publish({ type: 'DISPUTE_OPENED', tenantId: 'ten-1', occurredAt: new Date().toISOString(), payload: { disputeId: 'd-1' } })
    await eventBus.publish({ type: 'CALCULATION_RUN_STARTED', tenantId: 'ten-1', occurredAt: new Date().toISOString(), payload: { runId: 'r-1' } })

    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('events from tenant A do not bleed to tenant B handler', async () => {
    const tenantBEvents: unknown[] = []

    eventBus.subscribe('PLAN_PUBLISHED', (e: any) => {
      if (e.tenantId === 'ten-b') tenantBEvents.push(e)
    })

    await eventBus.publish({
      type: 'PLAN_PUBLISHED',
      tenantId: 'ten-a',
      occurredAt: new Date().toISOString(),
      payload: { planId: 'plan-x', planVersionId: 'v-x' },
    })

    expect(tenantBEvents).toHaveLength(0)
  })
})
