---
title: Environment Variables
description: All environment variables used by OpenComp.
---

Copy `.env.example` to `.env` and edit. Variables marked **required** have no safe default.

## Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |

## Redis / BullMQ

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | Yes | — | Redis connection string |

## API

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | `dev-secret-change-me` | HMAC secret — **must change in production** |
| `JWT_ACCESS_EXPIRES` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | No | `7d` | Refresh token lifetime |
| `API_PORT` | No | `3000` | HTTP port |
| `API_HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `CORS_ORIGINS` | No | `` | Comma-separated allowed origins |
| `DEFAULT_TENANT_ID` | No | — | Fallback tenant (single-tenant deployments) |

## File storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILES_DRIVER` | No | `local` | `local` or `s3` |
| `FILES_LOCAL_DIR` | No | `/tmp/opencomp-files` | Local storage base path |
| `FILES_S3_BUCKET` | When s3 | — | S3 bucket name |
| `FILES_S3_REGION` | When s3 | `us-east-1` | AWS region |
| `FILES_S3_ENDPOINT` | No | — | Override endpoint (MinIO, R2, etc.) |

## Email / notifications

| Variable | Required | Default | Description |
|---|---|---|---|
| `EMAIL_DRIVER` | No | `console` | `console` (dev) or `smtp` |
| `SMTP_HOST` | When smtp | — | SMTP host |
| `SMTP_PORT` | When smtp | `587` | SMTP port |
| `SMTP_USER` | When smtp | — | SMTP username |
| `SMTP_PASS` | When smtp | — | SMTP password |
| `EMAIL_FROM` | No | `noreply@opencomp.dev` | Sender address |

## Production security checklist

- [ ] Rotate `JWT_SECRET` to a cryptographically random 64-byte value
- [ ] Use `DATABASE_URL` with a least-privilege DB user
- [ ] Set `CORS_ORIGINS` to your exact frontend domains
- [ ] Enable TLS on your reverse proxy
- [ ] Set `LOG_LEVEL=warn` to reduce log volume
