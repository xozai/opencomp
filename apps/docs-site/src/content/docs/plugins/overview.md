---
title: Plugin Overview
description: How to extend OpenComp with custom formulas, payroll exports, CRM adapters, and dispute routing.
---

OpenComp's plugin system lets community developers add new capabilities without forking the core.

## Extension points

| Extension point | Interface | Use case |
|---|---|---|
| `formula` | `FormulaExtension` | Custom commission formula |
| `dispute-router` | `DisputeRouterExtension` | Route disputes to reviewers |
| `payroll-export` | `PayrollExportExtension` | Export payouts to ADP, Workday, etc. |
| `transaction-adapter` | `TransactionAdapterExtension` | Pull deals from a CRM |

## Plugin manifest

Every plugin exports a manifest describing itself:

```typescript
import { registerPlugin } from '@opencomp/sdk'

registerPlugin({
  manifest: {
    id: 'acme-accelerator',
    name: 'Acme Accelerator Commission',
    version: '1.0.0',
    description: 'Accelerates commission above 100% attainment',
    author: 'Acme Corp',
    license: 'MIT',
    extensionPoints: ['formula'],
  },
  extensions: [
    { type: 'formula', implementation: myFormula },
  ],
})
```

## Loading plugins

Plugins are loaded by importing them at API startup. Add your plugin import to `apps/api/src/index.ts`:

```typescript
// Load optional plugins
import '../../../plugins/acme-accelerator/src/index'
```

Or configure them via the `OPENCOMP_PLUGINS` env var (comma-separated package names) for dynamic loading.

## Writing your first formula

See [Formula Extension](/plugins/formula) for a complete walkthrough with tests.

## Bundled sample plugins

| Plugin | Extension point | Description |
|---|---|---|
| `sample-plan-rules` | `formula` | Accelerated commission + MBO bonus |
| `sample-crm-importer` | `transaction-adapter` | Demo CRM deal sync |
| `sample-dispute-routing` | `dispute-router` | Route by dollar threshold |
| `sample-payroll-export` | `payroll-export` | CSV + JSON payroll export |
