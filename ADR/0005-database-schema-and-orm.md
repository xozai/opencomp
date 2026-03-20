# ADR-0005: Database Schema Strategy and ORM

**Status:** Accepted
**Date:** 2026-03-19
**Deciders:** Core maintainers

## Decision

Use **Drizzle ORM** with **PostgreSQL** following these schema conventions:

### Naming Conventions
- Tables: `snake_case`, plural (e.g., `plan_versions`, `source_transactions`)
- Primary keys: `id UUID DEFAULT gen_random_uuid()`
- Tenant scoping: every tenant-scoped table has `tenant_id UUID NOT NULL`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- Soft deletes: `deleted_at TIMESTAMPTZ` (nullable — null means active)

### Module Scoping
Each domain module owns its tables. Cross-module joins are done via foreign key IDs only — never by importing another module's schema objects directly. This enforces module boundaries at the query level.

### Separation of Canonical vs Derived Data
- **Canonical (inputs)**: `plans`, `plan_versions`, `participants`, `quotas`, `source_transactions`
  → Never modified after creation; changes create new versions
- **Derived (outputs)**: `credits`, `calculation_runs`, `payouts`, `statements`
  → Regenerated from canonical inputs; always traceable back to their source

### Audit Pattern
Every significant mutation emits an `audit_events` record:
```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,          -- 'created' | 'updated' | 'deleted' | custom
  actor_id UUID,                 -- NULL for system actions
  actor_type TEXT NOT NULL,      -- 'user' | 'system' | 'plugin'
  before JSONB,
  after JSONB,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration Strategy
- Migrations are plain SQL files managed by Drizzle Kit
- Each migration is forward-only (no down migrations in production)
- Migrations are numbered sequentially and committed to the repo
- Local dev uses `db:migrate` to apply; seed data via `db:seed`

### Indexing Strategy
- Always index `tenant_id` on every tenant-scoped table
- Index foreign keys used in common joins
- Composite indexes for common filter patterns (e.g., `tenant_id + period_id`)
- Use `EXPLAIN ANALYZE` before adding any index — document in migration comments

## Consequences

**Positive:**
- Full SQL visibility — no hidden queries
- Migrations are auditable plain SQL
- Type-safe queries eliminate SQL injection at the ORM layer
- Canonical/derived separation makes recalculation safe

**Negative:**
- More verbose than Prisma for simple CRUD
- Developers must understand SQL to contribute effectively
- Schema changes require coordination across modules that share tables (minimized by module ownership)
