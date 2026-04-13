import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, reportingApi, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: ReportsPage,
})

type Period = { id: string; name: string }
type PayoutRow = {
  participantId: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  status: string
  payoutCount: number
}
type AttainmentRow = {
  participantId: string
  quotaAmountCents: number
  attainedAmountCents: number
  attainmentPct: number
}

function fmt(cents: number, currency = 'USD') {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency })
}

function ReportsPage() {
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [runId, setRunId] = useState('')
  const [queriedRunId, setQueriedRunId] = useState('')
  const [csvLoading, setCsvLoading] = useState(false)

  const periodsQuery = useQuery({ queryKey: ['periods'], queryFn: () => periodsApi.list() })
  const periods = (periodsQuery.data?.data ?? []) as Period[]
  const periodId = selectedPeriodId || (periods[0]?.id ?? '')

  const payoutsQuery = useQuery({
    queryKey: ['report-payouts', periodId],
    queryFn: () => reportingApi.payoutSummary(periodId),
    enabled: !!periodId,
  })

  const attainmentQuery = useQuery({
    queryKey: ['report-attainment', queriedRunId],
    queryFn: () => reportingApi.attainmentBreakdown(queriedRunId),
    enabled: !!queriedRunId,
  })

  const rows = (payoutsQuery.data?.data ?? []) as PayoutRow[]
  const attainmentRows = (attainmentQuery.data?.data ?? []) as AttainmentRow[]

  const totalGross = rows.reduce((s, r) => s + r.grossAmountCents, 0)
  const totalAdjusted = rows.reduce((s, r) => s + r.adjustedAmountCents, 0)
  const avgAdjusted = rows.length ? Math.round(totalAdjusted / rows.length) : 0
  const currency = rows[0]?.currency ?? 'USD'

  async function handleDownloadCsv() {
    if (!periodId) return
    setCsvLoading(true)
    try {
      const blob = await reportingApi.downloadPayoutsCsv(periodId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'payouts.csv'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setCsvLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Period</label>
          <select
            value={selectedPeriodId || periodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <button
            onClick={handleDownloadCsv}
            disabled={!periodId || csvLoading}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {csvLoading ? 'Downloading…' : '↓ Export CSV'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {payoutsQuery.isLoading && <p className="text-sm text-gray-500 mb-6">Loading…</p>}
      {rows.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Gross Payout', value: fmt(totalGross, currency) },
            { label: 'Total Adjusted Payout', value: fmt(totalAdjusted, currency) },
            { label: 'Participants', value: rows.length },
            { label: 'Avg Adjusted Payout', value: fmt(avgAdjusted, currency) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Payout table */}
      {rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900">Payout Summary</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Participant</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Adjusted</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Payouts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...rows].sort((a, b) => b.adjustedAmountCents - a.adjustedAmountCents).map((r) => (
                <tr key={r.participantId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.participantId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(r.grossAmountCents, r.currency)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmt(r.adjustedAmountCents, r.currency)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.status}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{r.payoutCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Attainment report */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <h2 className="font-medium text-gray-900">Attainment Report</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); setQueriedRunId(runId) }}
            className="flex gap-2"
          >
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="Calculation Run ID (UUID)"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-72"
            />
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700">
              Load
            </button>
          </form>
        </div>
        {attainmentQuery.isLoading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!queriedRunId && <p className="p-4 text-sm text-gray-400">Enter a calculation run ID above.</p>}
        {attainmentRows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Participant</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Quota</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Attained</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Attainment %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {attainmentRows.map((r) => (
                <tr key={r.participantId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.participantId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(r.quotaAmountCents)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(r.attainedAmountCents)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${r.attainmentPct >= 100 ? 'text-green-600' : r.attainmentPct >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {r.attainmentPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {queriedRunId && attainmentRows.length === 0 && !attainmentQuery.isLoading && (
          <p className="p-4 text-sm text-gray-400">No attainment data found for this run.</p>
        )}
      </div>
    </div>
  )
}
