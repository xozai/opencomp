# ADR-0004: Plugin and Extension Model

**Status:** Accepted
**Date:** 2026-03-19
**Deciders:** Core maintainers

## Context

OpenComp must be extensible without requiring forks or core hacks. Extensions are needed for:

- Custom plan formula packs (tiered commission rates, SPIFFs, accelerators)
- Custom crediting strategies (split credit, overlay credit, partner credit)
- Dispute routing policies (route by territory, amount, manager level)
- Payroll export adapters (ADP, Workday, SAP, custom CSV)
- Inbound transaction adapters (CRM webhooks, ERP exports, flat file imports)
- Document template renderers (PDF, HTML, Excel)
- Industry-specific rule packs (SaaS ARR, insurance, pharma)

## Decision

Implement a **manifest-based plugin system** with typed extension points.

### Plugin Manifest (`opencomp-plugin.json`)
```json
{
  "name": "@myorg/my-plugin",
  "version": "1.0.0",
  "compatibleWith": "^0.1.0",
  "extends": ["plan-formula", "payroll-export"]
}
```

### Extension Points (Typed Contracts)
Each extension point is defined as a TypeScript interface in `packages/sdk`:

```typescript
interface PlanFormulaExtension {
  id: string
  name: string
  calculate(context: FormulaContext): Promise<FormulaResult>
}

interface PayrollExportExtension {
  id: string
  name: string
  export(payouts: Payout[], options: ExportOptions): Promise<ExportResult>
}
```

### Plugin Registration
Plugins register at startup via the module registry:

```typescript
import { registerPlugin } from '@opencomp/sdk'

registerPlugin({
  manifest: { ... },
  extensions: {
    'plan-formula': [myFormulaExtension],
    'payroll-export': [myExportAdapter],
  }
})
```

### Isolation Contract
- Plugins may only import from `@opencomp/sdk` and `@opencomp/contracts`
- Plugins may NOT import from `@opencomp/api`, any `modules/*`, or `apps/*`
- Plugin contracts are versioned — breaking changes require a major version bump in the SDK
- Plugins run in the same process but are loaded through a registry, not direct imports

## Consequences

**Positive:**
- Extensions are first-class — no core hacks required
- Community can publish plugins as npm packages
- Type-safe extension points prevent interface drift
- Plugin authors have a clear, documented API surface

**Negative:**
- Plugin loading adds startup complexity
- Plugins in the same process can affect stability (future: sandboxed workers)
- Must maintain SDK backward compatibility — breaking changes are costly

## Future Consideration

Once the platform matures, investigate running plugins in isolated worker threads or WASM sandboxes for stronger isolation guarantees.
