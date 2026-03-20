import { describe, it, expect } from 'vitest'
import { rulesEngine } from './rules-engine'

const baseCtx = {
  attainmentPct: 1.0,
  creditedAmountCents: 100_000_00, // $100,000
  quotaAmountCents: 100_000_00,
  config: {},
}

describe('RulesEngine — builtin formulas', () => {
  describe('builtin.flat-rate', () => {
    it('computes flat rate payout', async () => {
      const result = await rulesEngine.evaluate('builtin.flat-rate', {
        ...baseCtx,
        config: { rate: 0.08 },
      })
      expect(result.payoutCents).toBe(800_000) // 8% of $100,000 = $8,000
      expect(result.explanation).toContain('8.00%')
    })

    it('returns 0 for 0 rate', async () => {
      const result = await rulesEngine.evaluate('builtin.flat-rate', {
        ...baseCtx,
        config: { rate: 0 },
      })
      expect(result.payoutCents).toBe(0)
    })
  })

  describe('builtin.tiered-rate', () => {
    const rateTable = [
      { from: 0, to: 0.5, rate: 0.04 },
      { from: 0.5, to: 1.0, rate: 0.06 },
      { from: 1.0, to: null, rate: 0.10 },
    ]

    it('selects correct tier at 100% attainment', async () => {
      const result = await rulesEngine.evaluate('builtin.tiered-rate', {
        ...baseCtx,
        attainmentPct: 1.0,
        rateTable,
      })
      expect(result.payoutCents).toBe(1_000_000) // 10% of $100,000
    })

    it('selects correct tier below 50%', async () => {
      const result = await rulesEngine.evaluate('builtin.tiered-rate', {
        ...baseCtx,
        attainmentPct: 0.3,
        rateTable,
      })
      expect(result.payoutCents).toBe(400_000) // 4% of $100,000
    })

    it('returns 0 with empty rate table', async () => {
      const result = await rulesEngine.evaluate('builtin.tiered-rate', {
        ...baseCtx,
        rateTable: [],
      })
      expect(result.payoutCents).toBe(0)
    })
  })

  describe('builtin.on-target-bonus', () => {
    it('pays bonus when attainment meets threshold', async () => {
      const result = await rulesEngine.evaluate('builtin.on-target-bonus', {
        ...baseCtx,
        attainmentPct: 1.0,
        config: { threshold: 1.0, bonusCents: 500_000 },
      })
      expect(result.payoutCents).toBe(500_000)
    })

    it('pays 0 when attainment below threshold', async () => {
      const result = await rulesEngine.evaluate('builtin.on-target-bonus', {
        ...baseCtx,
        attainmentPct: 0.9,
        config: { threshold: 1.0, bonusCents: 500_000 },
      })
      expect(result.payoutCents).toBe(0)
    })
  })

  it('throws for unknown formula', async () => {
    await expect(
      rulesEngine.evaluate('unknown.formula', baseCtx),
    ).rejects.toThrow("Formula 'unknown.formula' not found")
  })
})
