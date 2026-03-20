# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x (pre-release) | Yes — best effort |

Once OpenComp reaches 1.0.0, we will maintain security patches for the current major version and the previous major version for 12 months.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report vulnerabilities by emailing **security@opencomp.dev**.

Include as much of the following as possible:

- Type of issue (e.g. SQL injection, authentication bypass, privilege escalation)
- Full paths of source files related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment — how an attacker might exploit it

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix / mitigation | Within 30 days for critical, 90 days for others |
| Public disclosure | Coordinated with reporter |

## Security Design Principles

OpenComp is built with these security properties:

- **Tenant isolation**: All data queries are scoped to `tenantId`. Cross-tenant data access is never allowed.
- **Audit trail**: All mutations produce `AuditEvent` records. These are append-only and never deleted.
- **JWT authentication**: Tokens are short-lived (15m default). Refresh tokens are rotated on use.
- **Input validation**: All API inputs are validated with Zod schemas before reaching business logic.
- **Parameterized queries**: All database access uses Drizzle ORM with parameterized queries. Raw SQL is prohibited except in migrations.
- **Least privilege**: Database roles are scoped. The application user cannot drop tables or modify schemas.
- **Secrets management**: No secrets in source code. All secrets via environment variables, documented in `.env.example`.

## Dependency Scanning

We use Dependabot and `pnpm audit` in CI to detect known vulnerabilities in dependencies. Critical and high severity findings block releases.

## Hall of Fame

We gratefully acknowledge security researchers who responsibly disclose vulnerabilities. Researchers will be credited in release notes (with permission).
