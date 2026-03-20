---
title: Quick Start
description: Get OpenComp running locally in under 5 minutes.
---

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL + Redis)

## 1. Clone and install

```bash
git clone https://github.com/xozai/opencomp.git
cd opencomp
pnpm install
```

## 2. Start infrastructure

```bash
docker compose up -d   # starts postgres:16 and redis:7
```

## 3. Configure environment

```bash
cp .env.example .env
# Edit .env — the defaults work for local Docker
```

Key variables:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://opencomp:opencomp@localhost:5432/opencomp` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis for BullMQ |
| `JWT_SECRET` | `dev-secret-change-me` | **Change in production** |
| `DEFAULT_TENANT_ID` | `00000000-0000-0000-0000-000000000001` | Used when no tenant header |

## 4. Run migrations and seed

```bash
pnpm db:migrate   # runs Drizzle migrations
pnpm db:seed      # creates demo tenant, admin user, 3 reps
```

**Demo credentials**
- Admin: `admin@acme.example` / `admin123`
- Rep: `alice@acme.example` / `rep123`

## 5. Start the API and portals

```bash
pnpm dev
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Swagger docs | http://localhost:3000/docs |
| Admin portal | http://localhost:3001 |
| Rep portal | http://localhost:3002 |

## 6. Verify

```bash
curl http://localhost:3000/health
# → {"status":"ok","version":"0.1.0","timestamp":"..."}
```

Login to the admin portal and you'll see the Acme Corp demo data pre-loaded.
