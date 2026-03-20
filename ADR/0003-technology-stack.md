# ADR-0003: Technology Stack

**Status:** Accepted
**Date:** 2026-03-19
**Deciders:** Core maintainers

## Decisions

### Runtime: Node.js 20 LTS + TypeScript 5
- Largest contributor ecosystem for web platforms
- TypeScript provides compile-time safety critical for financial calculations
- Node 20 LTS ensures stability and long support window

### API Framework: Fastify 4
- Fastest Node.js HTTP framework by benchmark
- First-class TypeScript support
- Plugin system maps cleanly to module registration
- Built-in JSON schema validation (supplemented by Zod)
- `@fastify/swagger` provides automatic OpenAPI docs

### ORM: Drizzle ORM
- Type-safe SQL — queries are fully typed, no magic strings
- Lightweight — no hidden query builders or ORM magic
- Migrations are plain SQL files, readable by DBAs
- Supports PostgreSQL natively
- Preferred over Prisma for explicit SQL control needed in financial calculations

### Database: PostgreSQL 16
- Industry standard for transactional financial data
- ACID compliance required for compensation calculations
- JSONB for flexible metadata fields
- Row-level security (future multi-tenancy hardening)
- UUID primary keys for distributed-friendly IDs

### Queue: BullMQ + Redis
- Battle-tested job queue for Node.js
- Repeatable jobs, priority queues, rate limiting
- Redis is already a common infrastructure dependency
- Used for: calculation runs, notification dispatch, report generation, integration syncs

### Frontend: React 18 + Vite + TanStack Router + TanStack Query + Tailwind CSS
- React for component model and ecosystem
- Vite for fast HMR during development
- TanStack Router for type-safe routing
- TanStack Query for server state management
- Tailwind + shadcn/ui for consistent, accessible UI components
- No NextJS — SSR not required, simpler contributor setup

### Testing: Vitest + Supertest
- Vitest: Jest-compatible, Vite-native, fast
- Supertest for HTTP integration tests
- Test database per test run using separate schema

### Package Manager: pnpm 9
- See ADR-0001

### Build: Turborepo 2
- See ADR-0001

### Docs: Astro + Starlight
- Static site generation for documentation
- Starlight provides doc-site structure out of the box
- MDX support for interactive examples

## Alternatives Rejected

| Considered | Rejected Because |
|---|---|
| Express | No built-in TypeScript types, slower |
| Prisma | Abstraction hides SQL, harder to audit |
| MySQL | PostgreSQL preferred for JSONB and window functions |
| GraphQL | REST is simpler for contributors and integrations |
| NextJS | SSR overhead not needed; simpler with Vite SPA |
| Jest | Vitest is faster and Vite-native |
