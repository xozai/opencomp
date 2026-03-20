import { describe, it, expect, beforeAll } from 'vitest'
import { pluginRegistry } from '../../../packages/sdk/src'
import { rulesEngine } from '../../../modules/platform-rules/src/rules-engine'
import './index' // triggers plugin registration

const baseCtx = {
  attainmentPct: 1.0,
  creditedAmountCents: 100_000_00, // $100,000
  quotaAmountCents: 100_000_00,
  config: {},
}

describe('sample-plan-rules plugin', () => {
  it('registers in the plugin registry', () => {
    const plugins = pluginRegistry.list()
    const found = plugins.find((p) => p.manifest.name === '@opencomp/sample-plan-rules')
    expect(found).toBeDefined()
    expect(found?.extensions.formulas).toHaveLength(2)
  })

  describe('sample.accelerated-commission', () => {
    const formula = pluginRegistry.getFormulas().find((f) => f.id === 'sample.accelerated-commission')!

    it('pays base rate at exactly 100% attainment', async () => {
      const result = await formula.calculate({
        ...baseCtx,
        attainmentPct: 1.0,
        config: { baseRate: 0.08, acceleratorRate: 0.12, acceleratorThreshold: 1.0 },
      })
      expect(result.payoutCents).toBe(800_000) // 8% of $100k = $8,000
    })

    it('pays accelerator rate above threshold', async () => {
      const result = await formula.calculate({
        ...baseCtx,
        attainmentPct: 1.2, // 120% — 20% above quota
        creditedAmountCents: 120_000_00, // $120,000
        config: { baseRate: 0.08, acceleratorRate: 0.12, acceleratorThreshold: 1.0 },
      })
      // base: $100k × 8% = $8,000 + accelerator: $20k × 12% = $2,400 = $10,400
      expect(result.payoutCents).toBe(1_040_000)
      expect(result.metadata?.acceleratorPayout).toBe(240_000)
    })
  })

  describe('sample.mbo-bonus', () => {
    const formula = pluginRegistry.getFormulas().find((f) => f.id === 'sample.mbo-bonus')!

    it('pays full bonus at 100% MBO score', async () => {
      const result = await formula.calculate({
        ...baseCtx,
        attainmentPct: 1.0,
        config: { bonusCents: 500_000 }, // $5,000 target bonus
      })
      expect(result.payoutCents).toBe(500_000)
    })

    it('scales bonus at 80% score', async () => {
      const result = await formula.calculate({
        ...baseCtx,
        attainmentPct: 0.8,
        config: { bonusCents: 500_000 },
      })
      expect(result.payoutCents).toBe(400_000) // 80% of $5,000 = $4,000
    })

    it('caps payout at 100% even if score > 100', async () => {
      const result = await formula.calculate({
        ...baseCtx,
        attainmentPct: 1.5, // capped to 1.0
        config: { bonusCents: 500_000 },
      })
      expect(result.payoutCents).toBe(500_000)
    })
  })
})
