/**
 * Rules engine interface.
 *
 * The rules engine is a registry of named formula functions.
 * Each formula takes a typed context and returns a result.
 *
 * Core formulas are built in. Plugin formulas are registered
 * via the plugin SDK at startup.
 */

export interface FormulaContext {
  /** The attainment percentage (0–200+), e.g. 1.0 = 100% */
  attainmentPct: number
  /** Total credited amount in cents for this component this period */
  creditedAmountCents: number
  /** Quota amount in cents */
  quotaAmountCents: number
  /** Rate table entries, if applicable */
  rateTable?: RateTableEntry[]
  /** Arbitrary extra config from component.config */
  config: Record<string, unknown>
}

export interface RateTableEntry {
  /** Lower bound (attainment pct, e.g. 0.0) */
  from: number
  /** Upper bound (attainment pct, e.g. 1.0), null = open-ended */
  to: number | null
  /** Commission rate (e.g. 0.08 = 8%) */
  rate: number
}

export interface FormulaResult {
  /** Computed payout amount in cents */
  payoutCents: number
  /** Human-readable explanation of how the result was computed */
  explanation: string
  /** Any metadata the formula wants to attach for audit */
  metadata?: Record<string, unknown>
}

export type FormulaFn = (ctx: FormulaContext) => FormulaResult | Promise<FormulaResult>

export interface FormulaDefinition {
  id: string
  name: string
  description: string
  formula: FormulaFn
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class RulesEngine {
  private formulas = new Map<string, FormulaDefinition>()

  register(def: FormulaDefinition): void {
    if (this.formulas.has(def.id)) {
      throw new Error(`Formula '${def.id}' is already registered`)
    }
    this.formulas.set(def.id, def)
  }

  async evaluate(formulaId: string, ctx: FormulaContext): Promise<FormulaResult> {
    const def = this.formulas.get(formulaId)
    if (!def) {
      throw new Error(`Formula '${formulaId}' not found. Did you register the plugin?`)
    }
    return def.formula(ctx)
  }

  list(): FormulaDefinition[] {
    return Array.from(this.formulas.values())
  }

  has(formulaId: string): boolean {
    return this.formulas.has(formulaId)
  }
}

export const rulesEngine = new RulesEngine()

// ─── Built-in formulas ────────────────────────────────────────────────────────

/** Flat rate commission: creditedAmount × rate */
rulesEngine.register({
  id: 'builtin.flat-rate',
  name: 'Flat Rate Commission',
  description: 'Applies a single commission rate to total credited amount regardless of attainment',
  formula: (ctx) => {
    const rate = (ctx.config.rate as number) ?? 0
    const payoutCents = Math.round(ctx.creditedAmountCents * rate)
    return {
      payoutCents,
      explanation: `Flat rate ${(rate * 100).toFixed(2)}% × ${ctx.creditedAmountCents}¢ = ${payoutCents}¢`,
    }
  },
})

/** Tiered rate commission: look up rate from rate table by attainment */
rulesEngine.register({
  id: 'builtin.tiered-rate',
  name: 'Tiered Rate Commission',
  description: 'Looks up commission rate from a rate table based on attainment percentage',
  formula: (ctx) => {
    const rateTable = ctx.rateTable ?? []
    const attainment = ctx.attainmentPct

    const tier = rateTable.find(
      (t) => attainment >= t.from && (t.to === null || attainment < t.to),
    )

    if (!tier) {
      return {
        payoutCents: 0,
        explanation: `No matching tier found for attainment ${(attainment * 100).toFixed(1)}%`,
      }
    }

    const payoutCents = Math.round(ctx.creditedAmountCents * tier.rate)
    return {
      payoutCents,
      explanation: `Tier [${tier.from * 100}%–${tier.to ? tier.to * 100 + '%' : '∞'}] rate ${(tier.rate * 100).toFixed(2)}% × ${ctx.creditedAmountCents}¢ = ${payoutCents}¢`,
      metadata: { tier },
    }
  },
})

/** On-target bonus: fixed amount paid if attainment >= threshold */
rulesEngine.register({
  id: 'builtin.on-target-bonus',
  name: 'On-Target Bonus',
  description: 'Pays a fixed bonus amount when attainment meets or exceeds a threshold',
  formula: (ctx) => {
    const threshold = (ctx.config.threshold as number) ?? 1.0
    const bonusCents = (ctx.config.bonusCents as number) ?? 0
    const achieved = ctx.attainmentPct >= threshold
    return {
      payoutCents: achieved ? bonusCents : 0,
      explanation: `Attainment ${(ctx.attainmentPct * 100).toFixed(1)}% ${achieved ? '>=' : '<'} threshold ${(threshold * 100).toFixed(1)}% → ${achieved ? bonusCents + '¢' : '0¢'}`,
    }
  },
})
