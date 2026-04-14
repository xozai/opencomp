/**
 * @opencomp/testing — shared test utilities.
 *
 * Provides factory functions, in-memory fixtures, and DB test helpers
 * so every module's test suite can bootstrap quickly without boilerplate.
 */
import { randomUUID } from 'node:crypto'

// ─── ID helpers ───────────────────────────────────────────────────────────────

export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000002'

export function uuid(): string {
  return randomUUID()
}

// ─── Audit context factory ────────────────────────────────────────────────────

export function makeAuditCtx(overrides?: { actorId?: string; tenantId?: string }) {
  return {
    actorId: overrides?.actorId ?? TEST_ACTOR_ID,
    tenantId: overrides?.tenantId ?? TEST_TENANT_ID,
  }
}

// ─── Entity factories ─────────────────────────────────────────────────────────

export function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    name: 'Test Corp',
    slug: 'test',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: TEST_TENANT_ID,
    email: `user-${uuid()}@test.example`,
    firstName: 'Test',
    lastName: 'User',
    passwordHash: '$2a$10$placeholder',
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: TEST_TENANT_ID,
    firstName: 'Alice',
    lastName: 'Test',
    email: `participant-${uuid()}@test.example`,
    title: 'Account Executive',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function makePeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: TEST_TENANT_ID,
    name: 'Q1 2026',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: TEST_TENANT_ID,
    name: 'Test Plan',
    description: null,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: TEST_TENANT_ID,
    externalId: `ext-${uuid()}`,
    source: 'test',
    type: 'closed_won',
    amountCents: 100_000,
    currency: 'USD',
    closeDate: '2026-01-15',
    metadata: {},
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── Mock event bus ───────────────────────────────────────────────────────────

export interface PublishedEvent {
  type: string
  tenantId: string
  payload: unknown
}

export function makeMockEventBus() {
  const published: PublishedEvent[] = []

  return {
    published,
    async publish(event: { type: string; tenantId: string; payload: unknown }) {
      published.push(event)
    },
    subscribe: () => {},
    reset() {
      published.splice(0)
    },
  }
}
