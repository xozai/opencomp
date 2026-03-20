# Contributing to OpenComp

Thank you for considering contributing to OpenComp. This document explains how to get involved, what kinds of contributions are welcome, and how the review process works.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Module Contribution Guide](#module-contribution-guide)
- [Plugin Authorship](#plugin-authorship)
- [Issue Triage Labels](#issue-triage-labels)
- [Getting Help](#getting-help)

---

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Ways to Contribute

You do not need to write code to contribute:

- **Report bugs** — Open a [bug report](https://github.com/opencomp/opencomp/issues/new?template=bug_report.yml)
- **Request features** — Open a [feature request](https://github.com/opencomp/opencomp/issues/new?template=feature_request.yml)
- **Improve documentation** — Fix typos, clarify explanations, add examples
- **Write tests** — Increase coverage in any module
- **Review PRs** — Comment on open pull requests
- **Answer questions** — Help others in GitHub Discussions
- **Write plugins** — Publish plugins that extend OpenComp
- **Propose RFCs** — See [RFC_PROCESS.md](RFC_PROCESS.md) for major change proposals

---

## Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 LTS or later |
| pnpm | 9.x |
| Docker | 24+ |
| Docker Compose | v2 |
| Git | 2.40+ |

### Setup

```bash
# Clone the repository
git clone https://github.com/opencomp/opencomp.git
cd opencomp

# Install all workspace dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start Postgres and Redis
docker compose up -d

# Run database migrations
pnpm db:migrate

# Seed demo data
pnpm db:seed

# Start all apps in development mode
pnpm dev
```

### Running a specific app

```bash
# API only
pnpm --filter api dev

# Admin portal only
pnpm --filter admin-portal dev

# Worker only
pnpm --filter worker dev
```

### Running tests

```bash
# All tests
pnpm test

# Specific module
pnpm --filter @opencomp/plans test

# Watch mode
pnpm --filter @opencomp/plans test --watch
```

### Linting and formatting

```bash
# Check all
pnpm lint
pnpm format:check

# Fix
pnpm lint:fix
pnpm format
```

---

## Project Structure

OpenComp is a pnpm monorepo managed with Turborepo.

```
apps/        → Deployable applications (API, portals, worker, docs)
modules/     → Domain modules with business logic
packages/    → Shared libraries (contracts, SDK, UI, events)
plugins/     → Sample and community plugins
docs/        → Documentation source
ADR/         → Architecture Decision Records
scripts/     → Developer scripts
infrastructure/ → IaC and deployment configuration
```

Each module in `modules/` follows this internal layout:

```
modules/plans/
  src/
    entities/        → TypeScript types and Drizzle schema
    services/        → Business logic
    handlers/        → Fastify route handlers
    events/          → Module-level event definitions
    __tests__/       → Unit and integration tests
  index.ts           → Public interface (what other modules can import)
  package.json
  README.md
```

**Important:** Never import from inside another module's `src/` directory. Only import from its `index.ts` public interface.

---

## Coding Standards

- **TypeScript strict mode** required for all new code
- **No `any`** types unless explicitly justified with a comment
- **Zod** for runtime validation at API boundaries
- **Drizzle ORM** for all database access — no raw SQL except in migrations
- **No circular dependencies** between modules — enforced by lint rules
- Prefer **explicit over implicit** — readable code over clever code
- Every public function should have a JSDoc comment with `@param` and `@returns`
- Error handling: use typed error classes, not generic `Error`
- All timestamps are **UTC** stored as `timestamptz`
- All IDs are **UUIDs** (v7 preferred for time-sortability)

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/).

Format: `<type>(<scope>): <description>`

Types:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — build system or dependency changes
- `perf` — performance improvement

Scope: the module or package name (e.g., `plans`, `calculations`, `api`, `sdk`)

Examples:
```
feat(plans): add plan version archival support
fix(calculations): handle zero-quota edge case in attainment calc
docs(sdk): add plugin lifecycle hook examples
test(disputes): add evidence upload integration tests
```

---

## Pull Request Process

1. **Fork** the repository and create a branch from `main`
2. Branch naming: `feat/short-description`, `fix/short-description`, `docs/short-description`
3. Make your changes following the coding standards above
4. Add or update tests for any changed behavior
5. Run `pnpm test`, `pnpm lint`, and `pnpm build` — all must pass
6. Open a PR against `main` with a clear description
7. Fill out the PR template completely
8. A maintainer will review within 5 business days
9. Address review feedback — do not force-push to in-review branches
10. Once approved by at least one maintainer, a maintainer will merge

### PR size guidance

- Keep PRs focused. One concern per PR.
- If a PR exceeds ~500 lines of changed code, consider splitting it.
- Large feature PRs should be preceded by an RFC or a design discussion issue.

---

## Testing Requirements

All contributions that change behavior must include tests.

| Type | Tool | Location |
|---|---|---|
| Unit tests | Vitest | `src/__tests__/*.unit.test.ts` |
| Integration tests | Vitest + test DB | `src/__tests__/*.integration.test.ts` |
| API tests | Supertest + Vitest | `apps/api/src/__tests__/` |

Minimum requirements:
- New service functions: unit test required
- New API endpoints: integration test required
- Bug fixes: regression test required
- New modules: `index.ts` public interface must have tests

Coverage is tracked but not enforced by a hard threshold. Aim to maintain or improve coverage in the files you touch.

---

## Module Contribution Guide

If you are adding a new module:

1. Create the directory under `modules/`
2. Follow the standard module layout (see [Project Structure](#project-structure))
3. Export only from `index.ts` — this is your module's public contract
4. Add a `README.md` explaining the module's responsibility, public interface, and events
5. Register the module in `apps/api/src/module-registry.ts`
6. Add migrations if you introduce new tables
7. Add seed data to `scripts/seed/`
8. Open a PR with the label `new-module`

For modules that require breaking changes to existing modules, open an RFC first.

---

## Plugin Authorship

Plugins extend OpenComp without modifying core. See:

- [docs/plugins/PLUGIN_AUTHOR_GUIDE.md](docs/plugins/PLUGIN_AUTHOR_GUIDE.md)
- [plugins/sample-plan-rules/](plugins/sample-plan-rules/) — example plugin

Plugin PRs are welcome in the `plugins/` directory as sample and reference implementations. Production plugins maintained by third parties should be published as separate npm packages using the `opencomp-plugin-*` naming convention.

---

## Issue Triage Labels

| Label | Meaning |
|---|---|
| `good first issue` | Well-scoped, low-risk, great for new contributors |
| `help wanted` | Maintainers want community help |
| `bug` | Confirmed bug |
| `enhancement` | Feature request or improvement |
| `module:<name>` | Affects a specific module |
| `needs-rfc` | Requires an RFC before implementation |
| `blocked` | Waiting on something external |
| `wontfix` | Out of scope or intentionally not addressed |
| `documentation` | Docs-only change |
| `breaking-change` | Would break existing behavior |
| `plugin` | Related to the plugin system |

---

## Getting Help

- **GitHub Discussions** — general questions, ideas, and show-and-tell
- **GitHub Issues** — bug reports and feature requests
- **Discord** — real-time chat (link in GitHub repo description)

If you are unsure whether something is a bug or a feature, open a Discussion first.

We appreciate every contribution, no matter how small. Thank you.
