# OpenComp

**Open-source sales compensation administration platform.**

OpenComp is a modular, extensible platform for designing sales compensation plans, running calculations, distributing goal sheets, and managing disputes. It is built to be production-ready, contributor-friendly, and enterprise-extensible from day one.

[![CI](https://github.com/opencomp/opencomp/actions/workflows/ci.yml/badge.svg)](https://github.com/opencomp/opencomp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is OpenComp?

Sales compensation administration is expensive, opaque, and locked inside proprietary SaaS platforms. OpenComp changes that by providing a transparent, auditable, and extensible foundation that any company can run, inspect, and extend.

**Three core workflows — fully open:**

| Workflow | What it does |
|---|---|
| **Plan Design → Goal Sheet Distribution** | Design comp plans, version them, set quotas, generate goal sheets, and get rep acknowledgments |
| **Sales Comp Calculation** | Ingest transactions, apply crediting rules, run calculations, generate payouts and statements |
| **Dispute Resolution** | Submit disputes, upload evidence, route for approval, apply adjustments, close with full audit trail |

---

## Architecture

OpenComp is a **modular monolith** — one deployable unit with strong domain boundaries. Modules communicate through typed interfaces and internal events, not network calls. This keeps it operationally simple while remaining architecturally clean.

```
apps/
  api/              → Fastify REST API server
  admin-portal/     → React admin UI (plan design, calc runs, disputes)
  rep-portal/       → React rep-facing UI (goal sheets, statements, disputes)
  worker/           → BullMQ async job worker
  docs-site/        → Astro/Starlight documentation site

modules/
  platform-auth/    → JWT auth, sessions, RBAC
  platform-tenancy/ → Multi-tenant isolation
  platform-audit/   → Immutable audit event log
  platform-workflow/→ State machine workflow engine
  platform-rules/   → Pluggable rules engine interface
  platform-events/  → Internal event bus
  plans/            → Plan design, versioning, components, measures
  quotas/           → Quota assignment and management
  goalsheets/       → Goal sheet generation and distribution
  transactions/     → Source transaction ingestion and validation
  credits/          → Crediting engine
  calculations/     → Calculation run orchestration
  payouts/          → Payout record management
  statements/       → Statement generation
  disputes/         → Dispute intake, evidence, routing
  approvals/        → Approval request workflows
  adjustments/      → Manual adjustment application
  integrations/     → CRM/HRIS/ERP connector framework

packages/
  contracts/        → Shared TypeScript types and Zod schemas
  events/           → Event type definitions and bus interface
  sdk/              → Plugin SDK for extension authors
  ui/               → Shared React component library
  config/           → Shared configuration utilities
  testing/          → Test helpers and fixtures
  cli/              → Developer CLI

plugins/            → Sample and community plugins
```

Full architecture documentation: [docs/architecture/](docs/architecture/)

Architecture Decision Records: [ADR/](ADR/)

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### Run locally

```bash
git clone https://github.com/opencomp/opencomp.git
cd opencomp

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis)
docker compose up -d

# Apply database migrations
pnpm db:migrate

# Seed demo data
pnpm db:seed

# Start API + worker + portals
pnpm dev
```

The API will be available at `http://localhost:3100`.
Admin portal: `http://localhost:3001`
Rep portal: `http://localhost:3002`
API docs: `http://localhost:3100/docs`

### Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@acme.example` | `admin123` |
| Manager | `manager@acme.example` | `manager123` |
| Rep (Demo) | `rep@acme.example` | `rep123` |
| Rep (Alice) | `alice.chen@acme.example` | `rep123` |
| Rep (Bob) | `bob.smith@acme.example` | `rep123` |
| Rep (Carol) | `carol.davis@acme.example` | `rep123` |

---

## Plugin System

OpenComp exposes documented extension points so you can add:

- Custom plan formula packs
- Crediting strategies
- Dispute routing policies
- Document template renderers
- Inbound transaction adapters
- Payroll export adapters
- Approval route resolvers
- Industry-specific rule packs

See [docs/plugins/](docs/plugins/) and [PLUGIN_AUTHOR_GUIDE.md](docs/plugins/PLUGIN_AUTHOR_GUIDE.md).

---

## Contributing

We welcome contributors of all experience levels.

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [GOVERNANCE.md](GOVERNANCE.md) — project governance and roles
- [RFC_PROCESS.md](RFC_PROCESS.md) — how to propose major changes
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [Good first issues](https://github.com/opencomp/opencomp/issues?q=label%3A%22good+first+issue%22)

---

## What's Built

### Admin Portal (`http://localhost:3001`)

| Page | Description |
|---|---|
| **Plans** | Create and manage comp plans; view plan versions and components |
| **Plan Versions & Components** | Define formula components (commission, bonus, spiff, MBO, draw, guarantee) per version; publish versions |
| **Periods** | Create and manage compensation periods (e.g. Q1 2026) |
| **Transactions** | View source transactions ingested from CRM; filter by status |
| **Calculations** | Trigger and monitor calculation runs by period |
| **Goal Sheets** | Generate and distribute goal sheets to reps for a period + plan version |
| **Adjustments** | Apply manual adjustments (increase/decrease/clawback/correction) to payouts |
| **Reports** | Payout summary with CSV export; attainment report by calculation run |
| **Disputes** | View and manage open disputes across all reps |
| **Approvals** | Review and action approval requests |

### Rep Portal (`http://localhost:3002`)

| Page | Description |
|---|---|
| **Goal Sheets** | View distributed goal sheets with quota targets (component, amount, currency); acknowledge receipt |
| **Statements** | View payout statement for a selected period |
| **Disputes** | File a dispute with period, amount in dispute, subject, and description; track status |

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Complete | Repo foundation, governance, CI |
| Phase 2 | ✅ Complete | Platform kernel (auth, tenancy, audit, events) |
| Phase 3 | ✅ Complete | Workflow 1: Plan design → goal sheet distribution |
| Phase 4 | 🚧 In progress | Workflow 2: Sales comp calculation |
| Phase 5 | ✅ Complete | Workflow 3: Dispute resolution |
| Phase 6 | 📋 Planned | Plugin examples and contributor readiness |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## License

**Apache 2.0** — see [LICENSE](LICENSE).

Apache 2.0 was chosen over MIT (no patent grant), AGPL-3.0 (blocks enterprise adoption and proprietary plugins), and BSL (not truly open-source) because it:

- Includes an explicit **patent grant**, which enterprise legal teams require
- Allows **proprietary plugins and integrations** without forcing them open
- Is **compatible** with the broadest range of open-source dependencies
- Signals that OpenComp is safe for enterprise use without hidden obligations

OpenComp is free to use, fork, and extend. Contributions back to the project are encouraged but not required.
