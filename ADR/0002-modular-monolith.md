# ADR-0002: Modular Monolith Architecture

**Status:** Accepted
**Date:** 2026-03-19
**Deciders:** Core maintainers

## Context

We need to choose a deployment and architectural topology for the OpenComp platform. Options are:

1. Microservices — independent services per domain
2. Monolith — single process, all code together
3. Modular monolith — single process, enforced module boundaries

## Decision

Use a **modular monolith** as the initial architecture.

All domain modules are loaded into a single Fastify API process. Module boundaries are enforced through:

- Each module lives under `modules/<name>/` as its own package
- Modules only communicate through their **public index exports**
- Modules never import from each other's internal files
- Cross-module side effects go through the **event bus** (`packages/events`)
- Direct service calls between modules are documented as explicit dependencies

A separate **worker process** (`apps/worker`) handles async jobs via BullMQ.

## Why Not Microservices

- Distributed systems have serious operational complexity (service discovery, network failures, distributed tracing, eventual consistency)
- Small teams and early-stage projects cannot absorb that complexity
- Most sales compensation workloads are not high-throughput — calculation runs are batched, not real-time
- Module boundaries enforced in code are more contributor-friendly than service boundaries enforced by network

## Migration Path

The modular design explicitly prepares for future extraction:

- Each module has its own `package.json` and can be published independently
- Cross-module communication via events means loose coupling
- Database access is scoped per module — no shared ORM models across boundaries
- When a module needs independent scaling, it can be extracted to a service without rewriting its logic

## Consequences

**Positive:**
- Simple local dev (`docker compose up` starts everything)
- No distributed tracing required initially
- Atomic transactions are possible within a single DB connection
- Fast contributor onboarding

**Negative:**
- A bug in one module can crash the whole API (mitigated by Fastify error boundaries)
- All modules share the same database (mitigated by schema namespacing conventions)
- Cannot scale modules independently (acceptable for this workload profile)
