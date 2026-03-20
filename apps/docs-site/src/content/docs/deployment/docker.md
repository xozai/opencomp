---
title: Docker Compose
description: Running OpenComp with Docker Compose.
---

A `docker-compose.yml` is included at the repo root for local development and simple self-hosted deployments.

## Services

| Service | Port | Description |
|---|---|---|
| `postgres` | 5432 | PostgreSQL 16 (persistent volume) |
| `redis` | 6379 | Redis 7 with append-only persistence |
| `api` | 3000 | Fastify HTTP API + Swagger at `/docs` |
| `worker` | — | BullMQ background job processor |
| `admin-portal` | 3001 | React admin UI |
| `rep-portal` | 3002 | React rep UI |
| `mailhog` | 8025 | Email UI for dev (catches outgoing SMTP) |

## Quick start

```bash
docker compose up -d
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed   # optional demo data
```

## View logs

```bash
docker compose logs -f api
docker compose logs -f worker
```

## Stopping

```bash
docker compose down      # stop, keep volumes
docker compose down -v   # stop + delete volumes (resets DB)
```
