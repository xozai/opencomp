---
title: Introduction
description: What OpenComp is and why it exists.
---

**OpenComp** is an open-source sales compensation administration platform built for revenue operations, finance, and sales teams that need full control over how they design, calculate, and communicate sales incentive plans.

## What problem does it solve?

Commercial comp tools are expensive, opaque, and hard to integrate. Spreadsheets break at scale. OpenComp gives you:

- **Plan design** — version-controlled comp plans with approval workflows
- **Automated calculation** — rules-engine-based payout computation with full audit trail
- **Goal sheet distribution** — one-click push to reps with digital acknowledgement
- **Dispute resolution** — structured intake, routing, and resolution with adjustments
- **Plugin extensibility** — add custom formulas, payroll exports, CRM adapters, and more

## Key principles

| Principle | Detail |
|---|---|
| **Canonical vs. derived** | Plans, quotas, transactions are canonical. Credits, payouts, statements are derived and always re-computable. |
| **Immutable audit trail** | Every mutation is recorded in `audit_events`. Nothing is deleted — only soft-deleted. |
| **Multi-tenant** | Every row is scoped to a `tenant_id`. Safe to run multiple orgs in one deployment. |
| **Plugin-first** | Core business logic is extensible via typed extension points without forking. |

## Who is it for?

- **Self-hosted teams** that want data ownership
- **Operators** building comp tooling on top of a solid open foundation
- **Developers** who want to contribute formulas, integrations, or UI improvements

## Next steps

- [Quick Start](/intro/quick-start) — get running in under 5 minutes
- [Architecture](/intro/architecture) — understand the module structure
- [Plugin Development](/plugins/overview) — extend the platform
