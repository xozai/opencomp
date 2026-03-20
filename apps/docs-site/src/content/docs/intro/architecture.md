---
title: Architecture
description: Monorepo structure, module boundaries, and data flow.
---

OpenComp is a **modular monolith** — all modules run in a single Fastify process but have strict domain boundaries enforced by convention.

## Directory structure

```
opencomp/
├── apps/
│   ├── api/          ← Fastify HTTP server (entry point)
│   ├── worker/       ← BullMQ background worker
│   ├── admin-portal/ ← React admin UI (port 3001)
│   ├── rep-portal/   ← React rep UI (port 3002)
│   └── docs-site/    ← Astro + Starlight (this site)
├── modules/
│   ├── platform-*/   ← Cross-cutting platform concerns
│   ├── plans/        ← Plan design & versioning
│   ├── quotas/       ← Quota management & attainment
│   ├── goalsheets/   ← Goal sheet lifecycle
│   ├── transactions/ ← Source transaction ingestion
│   ├── credits/      ← Transaction crediting
│   ├── calculations/ ← Payout calculation engine
│   ├── disputes/     ← Dispute resolution
│   ├── approvals/    ← Approval workflow
│   ├── adjustments/  ← Manual payout adjustments
│   ├── statements/   ← Rep-facing pay statements
│   ├── participants/ ← Participant roster
│   ├── org-hierarchy/← Manager tree & territories
│   └── integrations/ ← CRM / HRIS sync adapters
├── packages/
│   ├── contracts/    ← Shared Zod schemas + TypeScript types
│   ├── events/       ← In-process typed event bus
│   └── sdk/          ← Plugin extension point interfaces
└── plugins/          ← Optional extension packages
```

## Module dependency rules

Modules may only import from:
1. `packages/*` (contracts, events, sdk)
2. `apps/api/src/db/*` (schema + client)
3. Other modules **only** via their public `src/index.ts` — never into internal files

Platform modules (`platform-*`) may be imported by any domain module. Domain modules must **not** import each other (they communicate via the event bus).

## Three core workflows

### 1. Plan design → goal sheet distribution

```
plans.createPlan()
  → plans.submitPlanForApproval()
  → approvals.decide() [approved]
  → plans.publishPlan()            fires PLAN_PUBLISHED
  → goalsheets.generate()          creates draft sheets
  → goalsheets.distribute()        fires GOAL_SHEET_DISTRIBUTED
  → notifications (email + in-app)
  → goalsheets.acknowledge()       rep signs off
```

### 2. Transaction ingestion → payout calculation

```
transactions.ingest()              fires TRANSACTION_INGESTED
  → transactions.validate()        fires TRANSACTION_VALIDATED
  → credits.creditPeriod()         applies split %s
  → calculations.executeRun()
      → rulesEngine.evaluate()     runs formula per component
      → writes Payout + lineItems
      fires CALCULATION_RUN_COMPLETED
  → statements.generateForRun()    builds rep-facing summary
```

### 3. Dispute resolution

```
disputes.openDispute()             fires DISPUTE_OPENED
  → approvals.create()             auto-creates approval request
  → disputes.assignDispute()
  → disputes.resolveDispute()
      → adjustments.create()       applies delta to payout
      fires DISPUTE_RESOLVED
  → notifications
```

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| API framework | Fastify 4 | Performance, schema validation, plugin ecosystem |
| ORM | Drizzle | Type-safe SQL, zero magic, easy migrations |
| Queue | BullMQ + Redis | Reliable job processing, retries, scheduling |
| Auth | JWT (RS256 in prod) | Stateless, easy horizontal scale |
| Frontend | React + TanStack Router + TanStack Query | Modern, type-safe, no Redux |
| Styles | Tailwind CSS | Utility-first, low config |
| Tests | Vitest | Fast, ESM-native, Jest-compatible |
| Monorepo | pnpm + Turborepo | Workspace linking, cached builds |

See [ADR/0003-technology-stack.md](https://github.com/xozai/opencomp/blob/main/ADR/0003-technology-stack.md) for full rationale.
