# Architecture Overview

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Clients                                 │
│   Admin Portal (React)        Rep Portal (React)                │
│   apps/admin-portal           apps/rep-portal                   │
└──────────────┬────────────────────────┬────────────────────────┘
               │  REST /api/v1          │  REST /api/v1
               ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    apps/api  (Fastify)                           │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ platform-    │  │ platform-      │  │ platform-audit       │ │
│  │ auth         │  │ tenancy        │  │ (append-only log)    │ │
│  └──────────────┘  └────────────────┘  └──────────────────────┘ │
│                                                                  │
│  Business routes: plans │ goalsheets │ transactions │ credits   │
│                   calculations │ disputes │ payouts              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  platform-rules (rules engine + plugin formula registry) │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────────────────────────────────────┐                         │
│  │  packages/events (in-process bus)  │                         │
│  └────────────────────────────────────┘                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ enqueues jobs
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   apps/worker  (BullMQ)                          │
│   Queues: calculations │ notifications │ goalsheet-distribution  │
│            report-generation │ integration-sync                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌──────────────────┐         ┌─────────────────┐
    │  PostgreSQL 16   │         │   Redis 7        │
    │  (primary store) │         │   (job queues)   │
    └──────────────────┘         └─────────────────┘
```

## Data flow — Workflow 1: Plan → Goal Sheet

```
Admin creates Plan (draft)
  → submitPlanForApproval()
  → approvalRequests record created
  → Manager approves
  → publishPlan()
  → plan.published event fired
  → GoalSheetsService.generate() called
  → GoalSheets created (draft) for each active participant
  → GoalSheetsService.distribute() called
  → goalsheet.distributed event fired
  → NotificationsService sends email to rep
  → Rep calls acknowledge()
  → goalsheet.acknowledged event fired
```

## Data flow — Workflow 2: Calculation

```
Transactions ingested (POST /transactions/ingest/bulk)
  → dedup by externalId + source
  → stored as 'pending'

Validation (POST /transactions/validate-pending)
  → VALIDATION_RULES applied
  → participant resolved from employeeId
  → status → 'validated' or 'invalid'

Crediting (CreditsService.creditPeriod)
  → for each validated tx × each plan component
  → Credit record created (amountCents, splitPct)
  → tx status → 'credited'

Calculation run (POST /calculation-runs)
  → for each active participant:
    → sum credits by component
    → compute attainmentPct = credited / quota
    → evaluate formulaId via rulesEngine
    → write Payout with full lineItems for audit
  → run status → 'completed'
```

## Data flow — Workflow 3: Dispute

```
Rep opens dispute (POST /disputes)
  → dispute record created (status: 'open')
  → ApprovalRequest created automatically
  → dispute.opened + approval.requested events fired

Manager assigns dispute (PATCH /disputes/:id/assign)
  → status → 'under_review'

Manager resolves dispute (POST /disputes/:id/resolve)
  → resolution: 'approved' | 'denied'
  → if approved + amount: Adjustment record created
  → Payout.adjustedAmountCents updated
  → dispute.resolved event fired
  → Audit trail complete
```

## Module dependency rules

```
packages/contracts  ←  depends on nothing
packages/events     ←  depends on contracts
packages/sdk        ←  depends on contracts, events

platform-audit      ←  depends on contracts
platform-tenancy    ←  depends on contracts
platform-auth       ←  depends on contracts, platform-audit
platform-rules      ←  depends on contracts, sdk
platform-events     ←  depends on contracts, events
platform-workflow   ←  depends on contracts, platform-audit, platform-events

participants        ←  depends on contracts, platform-audit, platform-events
plans               ←  depends on contracts, platform-audit, platform-events, platform-workflow
quotas              ←  depends on contracts, platform-audit, participants
goalsheets          ←  depends on contracts, platform-audit, platform-events, platform-files, plans, quotas
transactions        ←  depends on contracts, platform-audit, platform-events
credits             ←  depends on contracts, platform-audit, platform-rules, transactions
calculations        ←  depends on contracts, credits, plans, platform-audit, platform-rules, quotas
payouts             ←  depends on contracts, calculations, platform-audit, platform-events
disputes            ←  depends on contracts, platform-audit, platform-events, platform-files, platform-workflow
approvals           ←  depends on contracts, platform-audit, platform-events, platform-workflow
adjustments         ←  depends on contracts, approvals, payouts, platform-audit
```

No module may create a circular dependency. If a circular dependency appears, extract the shared concept to `packages/contracts` or `packages/events`.

## Audit trail

Every significant mutation records an `AuditEvent`:

```
entityType: 'plan' | 'goalsheet' | 'source_transaction' | 'credit' |
            'calculation_run' | 'payout' | 'dispute' | 'adjustment' ...
action:     'created' | 'updated' | 'published' | 'validated' |
            'distributed' | 'acknowledged' | 'calculated' | 'resolved' ...
before:     JSON snapshot of previous state (nullable)
after:      JSON snapshot of new state
actorId:    user or system ID
occurredAt: timestamp
```

The `audit_events` table is append-only. No row is ever updated or deleted.

## Extension points

See `docs/plugin-author-guide.md` for the full plugin authoring guide.

Extension points defined in `packages/sdk/src/extension-points.ts`:

| Extension point | Interface | Used in |
|---|---|---|
| Formula | `FormulaExtension` | `platform-rules` (rulesEngine) |
| Dispute router | `DisputeRouterExtension` | `disputes` module |
| Payroll export | `PayrollExportExtension` | `payouts` module |
| Transaction adapter | `TransactionAdapterExtension` | `transactions` module |
