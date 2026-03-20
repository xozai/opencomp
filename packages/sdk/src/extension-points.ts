/**
 * Extension point interfaces.
 * All plugin authors must implement these interfaces.
 * These are the ONLY contracts plugins may depend on.
 */

// ─── Formula Extension ────────────────────────────────────────────────────────

export interface FormulaContext {
  attainmentPct: number
  creditedAmountCents: number
  quotaAmountCents: number
  rateTable?: Array<{ from: number; to: number | null; rate: number }>
  config: Record<string, unknown>
}

export interface FormulaResult {
  payoutCents: number
  explanation: string
  metadata?: Record<string, unknown>
}

export interface FormulaExtension {
  /** Unique formula ID — must not conflict with builtin.* */
  id: string
  name: string
  description: string
  calculate(ctx: FormulaContext): FormulaResult | Promise<FormulaResult>
}

// ─── Dispute Router Extension ─────────────────────────────────────────────────

export interface DisputeRouterContext {
  disputeId: string
  tenantId: string
  participantId: string
  amountCents?: number
  metadata: Record<string, unknown>
}

export interface DisputeRouterResult {
  /** User ID to assign the dispute to */
  assignToUserId: string
  reason?: string
}

export interface DisputeRouterExtension {
  id: string
  name: string
  route(ctx: DisputeRouterContext): DisputeRouterResult | Promise<DisputeRouterResult>
}

// ─── Payroll Export Extension ─────────────────────────────────────────────────

export interface PayrollExportRecord {
  participantId: string
  employeeId?: string
  firstName: string
  lastName: string
  payoutCents: number
  currency: string
  periodId: string
  metadata: Record<string, unknown>
}

export interface PayrollExportResult {
  /** File content as a UTF-8 string or Buffer */
  content: string | Buffer
  filename: string
  mimeType: string
}

export interface PayrollExportExtension {
  id: string
  name: string
  export(records: PayrollExportRecord[]): PayrollExportResult | Promise<PayrollExportResult>
}

// ─── Transaction Adapter Extension ───────────────────────────────────────────

export interface RawTransaction {
  externalId: string
  source: string
  payload: Record<string, unknown>
}

export interface NormalizedTransaction {
  externalId: string
  source: string
  participantExternalId?: string
  transactionDate: string // ISO date
  amountCents: number
  currency: string
  payload: Record<string, unknown>
}

export interface TransactionAdapterExtension {
  /** Source system identifier this adapter handles, e.g. "salesforce" */
  sourceId: string
  name: string
  normalize(raw: RawTransaction): NormalizedTransaction | Promise<NormalizedTransaction>
  validate?(normalized: NormalizedTransaction): string[] | Promise<string[]>
}
