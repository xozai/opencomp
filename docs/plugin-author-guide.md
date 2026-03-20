# Plugin Author Guide

OpenComp is designed to be extended without forking the core. This guide shows you how to build, test, and distribute an OpenComp plugin.

## What is a plugin?

A plugin is an npm package that registers one or more **extensions** with the OpenComp platform at startup. Extensions are typed implementations of well-defined interfaces called **extension points**.

Plugins may only depend on:
- `@opencomp/sdk` — extension point interfaces and plugin registration
- `@opencomp/contracts` — shared domain types

Plugins must never import from `@opencomp/api`, any `modules/*` package, or any `apps/*` package.

## Quick start

```bash
# Scaffold a new plugin
pnpm dlx @opencomp/cli plugin:new my-plan-rules

# Or copy the sample plugin
cp -r plugins/sample-plan-rules plugins/my-plan-rules
```

## Plugin structure

```
my-plugin/
  package.json            # must include "opencomp.pluginManifest"
  src/
    index.ts              # calls registerPlugin() — entry point
    formulas.ts           # your formula implementations
    index.test.ts         # tests
```

### package.json

```json
{
  "name": "@myorg/my-opencomp-plugin",
  "version": "1.0.0",
  "dependencies": {
    "@opencomp/sdk": "^0.1.0"
  },
  "opencomp": {
    "pluginManifest": {
      "compatibleWith": "^0.1.0",
      "extends": ["plan-formula"]
    }
  }
}
```

### src/index.ts

```typescript
import { registerPlugin } from '@opencomp/sdk'
import type { FormulaExtension } from '@opencomp/sdk'

const myFormula: FormulaExtension = {
  id: 'myorg.revenue-bonus',
  name: 'Revenue Bonus',
  description: 'Pays a fixed bonus when revenue exceeds target',
  calculate(ctx) {
    const threshold = ctx.config.threshold as number ?? 1.0
    const bonusCents = ctx.config.bonusCents as number ?? 0
    const achieved = ctx.attainmentPct >= threshold
    return {
      payoutCents: achieved ? bonusCents : 0,
      explanation: `Attainment ${(ctx.attainmentPct * 100).toFixed(1)}% ${achieved ? '>=' : '<'} ${threshold * 100}% threshold`,
    }
  },
}

registerPlugin({
  manifest: {
    name: '@myorg/my-opencomp-plugin',
    version: '1.0.0',
    compatibleWith: '^0.1.0',
  },
  extensions: {
    formulas: [myFormula],
  },
})
```

## Extension points

### `FormulaExtension`

Used in plan component configuration (`component.formulaId`).

```typescript
interface FormulaExtension {
  id: string                    // unique, e.g. "myorg.my-formula"
  name: string
  description: string
  calculate(ctx: FormulaContext): FormulaResult | Promise<FormulaResult>
}
```

`FormulaContext` provides:
| Field | Type | Description |
|---|---|---|
| `attainmentPct` | `number` | Attainment as decimal (1.0 = 100%) |
| `creditedAmountCents` | `number` | Total credited amount in cents |
| `quotaAmountCents` | `number` | Quota in cents |
| `rateTable` | `RateTableEntry[]` | Optional rate table from component config |
| `config` | `Record<string, unknown>` | Component-level config object |

`FormulaResult` must return:
| Field | Type | Description |
|---|---|---|
| `payoutCents` | `number` | Computed payout in cents (integer) |
| `explanation` | `string` | Human-readable explanation for audit trail |
| `metadata` | `object?` | Optional extra data attached to payout line item |

### `DisputeRouterExtension`

Routes new disputes to the appropriate reviewer.

```typescript
interface DisputeRouterExtension {
  id: string
  name: string
  route(ctx: DisputeRouterContext): DisputeRouterResult | Promise<DisputeRouterResult>
}
```

### `PayrollExportExtension`

Exports payouts to a payroll system format.

```typescript
interface PayrollExportExtension {
  id: string
  name: string
  export(records: PayrollExportRecord[]): PayrollExportResult | Promise<PayrollExportResult>
}
```

### `TransactionAdapterExtension`

Normalizes raw transactions from an external source.

```typescript
interface TransactionAdapterExtension {
  sourceId: string   // e.g. "salesforce", "hubspot"
  name: string
  normalize(raw: RawTransaction): NormalizedTransaction | Promise<NormalizedTransaction>
  validate?(normalized: NormalizedTransaction): string[] | Promise<string[]>
}
```

## Testing your plugin

```typescript
import { describe, it, expect } from 'vitest'
import { pluginRegistry } from '@opencomp/sdk'
import './index' // triggers registration

describe('my plugin', () => {
  it('registers correctly', () => {
    const formulas = pluginRegistry.getFormulas()
    const myFormula = formulas.find(f => f.id === 'myorg.revenue-bonus')
    expect(myFormula).toBeDefined()
  })

  it('calculates correctly', async () => {
    const formula = pluginRegistry.getFormulas().find(f => f.id === 'myorg.revenue-bonus')!
    const result = await formula.calculate({
      attainmentPct: 1.1,
      creditedAmountCents: 110_000_00,
      quotaAmountCents: 100_000_00,
      config: { threshold: 1.0, bonusCents: 500_000 },
    })
    expect(result.payoutCents).toBe(500_000)
  })
})
```

Run tests:
```bash
pnpm --filter @myorg/my-opencomp-plugin test
```

## Publishing your plugin

```bash
# Build
pnpm build

# Publish to npm
npm publish --access public

# Users install with:
npm install @myorg/my-opencomp-plugin
```

Then in `apps/api/src/index.ts`, import your plugin before `buildApp()`:

```typescript
import '@myorg/my-opencomp-plugin'  // registers on import
```

## ID naming conventions

- Builtin formulas: `builtin.*` (reserved for core)
- Community plugins: `<npmorg>.<formula-name>`
- Do not use `opencomp.*` — reserved for official extensions

## Versioning and compatibility

The `compatibleWith` field in your manifest uses semver range syntax. OpenComp will warn (and in future versions, block) plugin registration if your plugin's `compatibleWith` range is incompatible with the installed SDK version.

Increment your plugin's major version whenever you change the behavior of an existing formula in a breaking way.

## Getting help

- Open a discussion: `github.com/opencomp/opencomp/discussions`
- Plugin examples: `plugins/` directory in this repo
- SDK types: `packages/sdk/src/extension-points.ts`
