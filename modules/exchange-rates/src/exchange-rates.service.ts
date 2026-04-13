import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { exchangeRates } from '../../../apps/api/src/db/schema'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateExchangeRateSchema = z.object({
  fromCurrency: z.string().length(3),
  toCurrency: z.string().length(3),
  rate: z.number().positive(),
  effectiveDate: z.string(),
  source: z.string().default('manual'),
})
export type CreateExchangeRateInput = z.infer<typeof CreateExchangeRateSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export class ExchangeRatesService {
  constructor(private db: Db) {}

  async listRates(tenantId: string) {
    return this.db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.tenantId, tenantId))
  }

  async getRate(tenantId: string, from: string, to: string, date?: string) {
    const all = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.tenantId, tenantId),
          eq(exchangeRates.fromCurrency, from),
          eq(exchangeRates.toCurrency, to),
        ),
      )

    if (all.length === 0) return null

    if (date) {
      // Find closest rate on or before the given date
      const candidates = all.filter((r) => r.effectiveDate <= date)
      if (candidates.length === 0) return all[0]
      return candidates.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
    }

    // Return most recent
    return all.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
  }

  async createRate(tenantId: string, input: CreateExchangeRateInput) {
    const data = CreateExchangeRateSchema.parse(input)

    const [rate] = await this.db
      .insert(exchangeRates)
      .values({
        tenantId,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: String(data.rate),
        effectiveDate: data.effectiveDate,
        source: data.source,
      })
      .returning()

    return rate
  }

  async upsertRate(tenantId: string, input: CreateExchangeRateInput) {
    const data = CreateExchangeRateSchema.parse(input)

    const [rate] = await this.db
      .insert(exchangeRates)
      .values({
        tenantId,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: String(data.rate),
        effectiveDate: data.effectiveDate,
        source: data.source,
      })
      .onConflictDoUpdate({
        target: [exchangeRates.tenantId, exchangeRates.fromCurrency, exchangeRates.toCurrency, exchangeRates.effectiveDate],
        set: {
          rate: String(data.rate),
          source: data.source,
          updatedAt: new Date(),
        },
      })
      .returning()

    return rate
  }
}
