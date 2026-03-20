/**
 * Sample Plan Rules Plugin
 *
 * Demonstrates how to register custom formula extensions via the OpenComp SDK.
 * Plugin authors copy this pattern and publish as an npm package.
 *
 * Install: npm install @opencomp/sdk @opencomp/contracts
 * Register: import and call registerPlugin() at API startup
 */
import { registerPlugin } from '../../../packages/sdk/src'
import type { FormulaExtension } from '../../../packages/sdk/src/extension-points'

// ─── Custom formula: Accelerated Commission ───────────────────────────────────
// Pays a higher commission rate above 100% attainment (accelerator).
// Config: { baseRate: 0.08, acceleratorRate: 0.12, acceleratorThreshold: 1.0 }

const acceleratedCommission: FormulaExtension = {
  id: 'sample.accelerated-commission',
  name: 'Accelerated Commission',
  description:
    'Pays base rate up to attainment threshold, then accelerator rate above it. ' +
    'Common in SaaS AE plans.',
  calculate(ctx) {
    const baseRate = (ctx.config.baseRate as number) ?? 0.08
    const acceleratorRate = (ctx.config.acceleratorRate as number) ?? 0.12
    const threshold = (ctx.config.acceleratorThreshold as number) ?? 1.0

    if (ctx.attainmentPct <= threshold) {
      const payoutCents = Math.round(ctx.creditedAmountCents * baseRate)
      return {
        payoutCents,
        explanation: `Below threshold (${(ctx.attainmentPct * 100).toFixed(1)}% < ${threshold * 100}%): base rate ${(baseRate * 100).toFixed(2)}% × ${ctx.creditedAmountCents}¢ = ${payoutCents}¢`,
      }
    }

    // Split: base rate up to quota, accelerator rate on excess
    const atQuota = ctx.quotaAmountCents
    const excess = ctx.creditedAmountCents - atQuota
    const basePayout = Math.round(atQuota * baseRate)
    const acceleratorPayout = Math.round(excess * acceleratorRate)
    const payoutCents = basePayout + acceleratorPayout

    return {
      payoutCents,
      explanation:
        `Above threshold (${(ctx.attainmentPct * 100).toFixed(1)}%): ` +
        `base ${(baseRate * 100).toFixed(2)}% × ${atQuota}¢ = ${basePayout}¢ + ` +
        `accelerator ${(acceleratorRate * 100).toFixed(2)}% × ${excess}¢ excess = ${acceleratorPayout}¢. ` +
        `Total: ${payoutCents}¢`,
      metadata: { basePayout, acceleratorPayout, excess },
    }
  },
}

// ─── Custom formula: MBO Bonus ────────────────────────────────────────────────
// Pays a percentage of a fixed bonus amount based on MBO score (0–100).
// Config: { bonusCents: 500000, maxScore: 100 }

const mboBonus: FormulaExtension = {
  id: 'sample.mbo-bonus',
  name: 'MBO Bonus',
  description:
    'Scales a fixed target bonus by MBO score percentage. ' +
    'Score passed via attainmentPct (e.g. 0.85 = 85 out of 100).',
  calculate(ctx) {
    const bonusCents = (ctx.config.bonusCents as number) ?? 0
    const scorePct = Math.min(ctx.attainmentPct, 1.0) // cap at 100%
    const payoutCents = Math.round(bonusCents * scorePct)
    return {
      payoutCents,
      explanation: `MBO score ${(scorePct * 100).toFixed(0)}% × ${bonusCents}¢ target = ${payoutCents}¢`,
      metadata: { scorePct, bonusCents },
    }
  },
}

// ─── Plugin registration ──────────────────────────────────────────────────────

export const samplePlanRulesPlugin = {
  manifest: {
    name: '@opencomp/sample-plan-rules',
    version: '0.1.0',
    compatibleWith: '^0.1.0',
    description: 'Sample commission formulas: accelerated commission and MBO bonus',
    author: 'OpenComp Contributors',
  },
  extensions: {
    formulas: [acceleratedCommission, mboBonus],
  },
  onRegister() {
    console.log('[sample-plan-rules] Plugin registered: accelerated-commission, mbo-bonus')
  },
}

// Register immediately when imported
registerPlugin(samplePlanRulesPlugin)
