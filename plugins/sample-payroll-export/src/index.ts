/**
 * Sample payroll export plugin.
 *
 * Demonstrates the PayrollExportExtension SDK interface.
 * Exports payouts as CSV in a format compatible with generic payroll systems.
 *
 * Real implementations would format to ADP, Workday, Rippling, etc.
 */

import { registerPlugin } from '../../../packages/sdk/src'
import type { PayrollExportExtension } from '../../../packages/sdk/src'

interface PayoutRecord {
  participantId: string
  participantName?: string
  employeeId?: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  periodId: string
}

const csvPayrollExporter: PayrollExportExtension = {
  extensionId: 'sample.csv-payroll-export',
  format: 'csv',

  /**
   * Export payouts to CSV bytes.
   * Columns: employee_id, full_name, period_id, gross_usd, adjusted_usd, currency
   */
  async export(payouts: PayoutRecord[]): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const header = 'employee_id,full_name,period_id,gross_amount,adjusted_amount,currency\n'
    const rows = payouts.map((p) => {
      const name = (p.participantName ?? p.participantId).replace(/,/g, ' ')
      const gross = (p.grossAmountCents / 100).toFixed(2)
      const adjusted = (p.adjustedAmountCents / 100).toFixed(2)
      return `${p.employeeId ?? p.participantId},${name},${p.periodId},${gross},${adjusted},${p.currency}`
    })

    const csv = header + rows.join('\n')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    return {
      content: Buffer.from(csv, 'utf-8'),
      filename: `payroll-export-${timestamp}.csv`,
      mimeType: 'text/csv',
    }
  },
}

// ─── JSON export variant ──────────────────────────────────────────────────────

const jsonPayrollExporter: PayrollExportExtension = {
  extensionId: 'sample.json-payroll-export',
  format: 'json',

  async export(payouts: PayoutRecord[]): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const records = payouts.map((p) => ({
      employeeId: p.employeeId ?? p.participantId,
      participantName: p.participantName,
      periodId: p.periodId,
      grossAmount: p.grossAmountCents / 100,
      adjustedAmount: p.adjustedAmountCents / 100,
      currency: p.currency,
    }))

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    return {
      content: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), records }, null, 2), 'utf-8'),
      filename: `payroll-export-${timestamp}.json`,
      mimeType: 'application/json',
    }
  },
}

registerPlugin({
  manifest: {
    id: 'sample-payroll-export',
    name: 'Sample Payroll Export',
    version: '0.1.0',
    description: 'Exports payouts as CSV or JSON for upload to payroll systems',
    author: 'OpenComp Contributors',
    license: 'Apache-2.0',
    extensionPoints: ['payroll-export'],
  },
  extensions: [
    { type: 'payroll-export', implementation: csvPayrollExporter },
    { type: 'payroll-export', implementation: jsonPayrollExporter },
  ],
})

export { csvPayrollExporter, jsonPayrollExporter }
