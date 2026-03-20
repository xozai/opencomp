# ADR-0001: Monorepo with Turborepo and pnpm Workspaces

**Status:** Accepted
**Date:** 2026-03-19
**Deciders:** Core maintainers

## Context

OpenComp is a multi-app platform with shared domain logic, UI components, event contracts, and SDK packages. We need a repository structure that supports:

- Multiple deployable apps (API, worker, admin portal, rep portal, docs)
- Shared packages (contracts, events, SDK, UI, config)
- Independent module boundaries (23+ domain modules)
- Contributor-friendly navigation and local development

## Decision

Use a **pnpm workspace monorepo** with **Turborepo** as the build orchestration layer.

### Structure
```
apps/        — deployable applications
modules/     — domain modules (internal packages)
packages/    — shared cross-cutting packages
plugins/     — example plugins
```

### Why pnpm
- Efficient disk usage via content-addressable store
- Strict dependency isolation (no phantom dependencies)
- Workspace protocol (`workspace:*`) for local package references
- Fastest install time among npm/yarn/pnpm

### Why Turborepo
- Incremental builds — only rebuilds what changed
- Remote caching support (Vercel or self-hosted)
- Parallel task execution with dependency graph awareness
- Pipeline configuration in `turbo.json` is readable and maintainable

## Consequences

**Positive:**
- Single `git clone` gets the full platform
- Shared TypeScript configs, ESLint, Prettier across all packages
- Atomic commits across module boundaries
- Easy to run the full stack locally

**Negative:**
- CI must be configured to only run affected packages (Turborepo handles this)
- Contributors unfamiliar with monorepos have a small learning curve
- Repo size grows over time — mitigated by `.gitignore` of build artifacts

## Alternatives Considered

- **Polyrepo**: Rejected. Too much coordination overhead for a platform with many shared contracts.
- **Nx**: Considered. More powerful but higher complexity and steeper learning curve for contributors.
- **Yarn workspaces**: Rejected in favor of pnpm for stricter isolation and speed.
