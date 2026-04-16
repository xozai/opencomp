import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  getAccessToken, calculationsApi, creditsApi, payoutsApi,
  earningsRulesApi, paymentStatementsApi, periodsApi, plansApi,
} from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calculations/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: CalculationsPage,
})

type Run = {
  id: string
  status: string
  periodId: string
  planVersionId?: string
  createdAt: string
  config?: {
    summary?: {
      credited?: number
      measured?: number
      earningsGenerated?: number
      statementsGenerated?: number
      exceptionsDetected?: number
    }
  }
}
type Payout = {
  id: string
  participantId: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  status: string
}
type EarningsResult = {
  id: string
  participantId: string
  componentId: string
  grossEarningsCents: number
  cappedEarningsCents: number
  attainmentPct: number
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
}

function fmtDollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ActiveTab = 'payouts' | 'earnings' | 'pipeline'

function CalculationsPage() {
  const qc = useQueryClient()
  const [periodId, setPeriodId] = useState('')
  const [planVersionId, setPlanVersionId] = useState('')
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('pipeline')
  const [creditResult, setCreditResult] = useState<{ credited: number; skipped: number; total: number } | null>(null)
  const [paidCount, setPaidCount] = useState<number | null>(null)

  const { data: periodsData } = useQuery({ queryKey: ['periods'], queryFn: () => periodsApi.list() })
  const { data: plansData } = useQuery({ queryKey: ['plans'], queryFn: () => plansApi.list() })
  const periods = (periodsData?.data ?? []) as Array<{ id: string; name: string }>
  const plans = (plansData?.data ?? []) as Array<{ id: string; name: string }>

  const runsQuery = useQuery({
    queryKey: ['calc-runs', periodId],
    queryFn: () => calculationsApi.listRuns(periodId || undefined),
  })
  const runs = (runsQuery.data?.data ?? []) as Run[]

  const payoutsQuery = useQuery({
    queryKey: ['payouts', selectedRun?.id],
    queryFn: () => payoutsApi.list({ calculationRunId: selectedRun!.id }),
    enabled: !!selectedRun && activeTab === 'payouts',
  })
  const payouts = (payoutsQuery.data?.data ?? []) as Payout[]

  const earningsQuery = useQuery({
    queryKey: ['earnings-results', selectedRun?.id],
    queryFn: () => earningsRulesApi.results(selectedRun ? { calculationRunId: selectedRun.id } : undefined),
    enabled: !!selectedRun && activeTab === 'earnings',
  })
  const earnings = (earningsQuery.data?.data ?? []) as EarningsResult[]

  const startMut = useMutation({
    mutationFn: (body: unknown) => calculationsApi.startRun(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calc-runs'] })
      setCreditResult(null)
    },
  })

  const creditMut = useMutation({
    mutationFn: (body: { periodId: string; planVersionId: string }) => creditsApi.creditPeriod(body),
    onSuccess: (res) => setCreditResult(res.data),
  })

  const markPaidMut = useMutation({
    mutationFn: (ids: string[]) => payoutsApi.markPaid(ids),
    onSuccess: (res) => {
      setPaidCount(res.data.paid)
      qc.invalidateQueries({ queryKey: ['payouts', selectedRun?.id] })
    },
  })

  const genStatementsMut = useMutation({
    mutationFn: (body: { periodId: string; planVersionId: string; calculationRunId: string }) =>
      paymentStatementsApi.calculate(body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payment-balances'] })
      alert(`Generated ${res.data.statementsGenerated} payment statements`)
    },
  })

  const unpaidPayouts = payouts.filter((p) => p.status !== 'paid')
  const canSubmit = periodId && planVersionId

  const summary = selectedRun?.config?.summary

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Calculation Runs</h1>

      {/* Launch panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Start New Run</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period</label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-40"
            >
              <option value="">Select period…</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Plan</label>
            <select
              value={planVersionId}
              onChange={(e) => setPlanVersionId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-48"
            >
              <option value="">Select plan…</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          <button
            onClick={() => {
              if (!canSubmit) return
              setCreditResult(null)
              creditMut.mutate({ periodId, planVersionId })
            }}
            disabled={creditMut.isPending || !canSubmit}
            className="border border-indigo-300 text-indigo-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
          >
            {creditMut.isPending ? 'Applying Credits…' : '1. Apply Credits'}
          </button>
          <button
            onClick={() => { if (canSubmit) startMut.mutate({ periodId, planVersionId }) }}
            disabled={startMut.isPending || !canSubmit}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {startMut.isPending ? 'Starting…' : '2. Start Calculation Run'}
          </button>
          {selectedRun && (
            <button
              onClick={() => {
                if (!canSubmit) return
                genStatementsMut.mutate({
                  periodId,
                  planVersionId,
                  calculationRunId: selectedRun.id,
                })
              }}
              disabled={genStatementsMut.isPending || !canSubmit}
              className="border border-green-300 text-green-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-green-50 disabled:opacity-50"
            >
              {genStatementsMut.isPending ? 'Generating…' : '3. Generate Statements'}
            </button>
          )}
          {creditResult && (
            <span className="text-xs text-green-700 self-center">
              ✓ {creditResult.credited} credited, {creditResult.skipped} skipped of {creditResult.total} transactions
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 lg:col-span-1 max-h-[600px] overflow-y-auto">
          {runsQuery.isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {!runsQuery.isLoading && runs.length === 0 && (
            <p className="p-6 text-sm text-gray-500">No runs yet.</p>
          )}
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => { setSelectedRun(run); setActiveTab('pipeline'); setPaidCount(null) }}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${selectedRun?.id === run.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{run.id.slice(0, 8)}…</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {run.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(run.createdAt).toLocaleString()}</p>
              {run.config?.summary && (
                <div className="mt-1.5 flex gap-2 flex-wrap">
                  {run.config.summary.credited !== undefined && (
                    <span className="text-xs text-gray-500">{run.config.summary.credited} credited</span>
                  )}
                  {run.config.summary.earningsGenerated !== undefined && (
                    <span className="text-xs text-gray-500">{run.config.summary.earningsGenerated} earnings</span>
                  )}
                  {(run.config.summary.exceptionsDetected ?? 0) > 0 && (
                    <span className="text-xs text-red-600">{run.config.summary.exceptionsDetected} exceptions</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Run detail */}
        {selectedRun ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4 lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {([
                { key: 'pipeline', label: 'Pipeline Status' },
                { key: 'payouts', label: 'Payouts' },
                { key: 'earnings', label: 'Earnings' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'pipeline' && (
              <div>
                <h2 className="text-sm font-medium text-gray-800 mb-3">Run {selectedRun.id.slice(0, 8)}…</h2>
                {summary ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Transactions Credited', value: summary.credited ?? 0, icon: '↪' },
                      { label: 'Measurements', value: summary.measured ?? 0, icon: '📏' },
                      { label: 'Earnings Generated', value: summary.earningsGenerated ?? 0, icon: '💰' },
                      { label: 'Statements Generated', value: summary.statementsGenerated ?? 0, icon: '📄' },
                      { label: 'Exceptions Detected', value: summary.exceptionsDetected ?? 0, icon: '⚠️', warning: (summary.exceptionsDetected ?? 0) > 0 },
                    ].map(item => (
                      <div
                        key={item.label}
                        className={`border rounded-lg p-3 ${item.warning ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        <div className={`text-2xl font-semibold ${item.warning ? 'text-red-700' : 'text-gray-900'}`}>
                          {item.value.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No pipeline summary available for this run.</p>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Status:</span> <span className={`font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[selectedRun.status] ?? ''}`}>{selectedRun.status}</span></div>
                    <div><span className="text-gray-500">Created:</span> <span className="text-gray-700">{new Date(selectedRun.createdAt).toLocaleString()}</span></div>
                    <div><span className="text-gray-500">Period:</span> <span className="font-mono text-gray-700">{selectedRun.periodId.slice(0, 8)}…</span></div>
                    {selectedRun.planVersionId && (
                      <div><span className="text-gray-500">Plan version:</span> <span className="font-mono text-gray-700">{selectedRun.planVersionId.slice(0, 8)}…</span></div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'payouts' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-gray-800">Payouts ({payouts.length})</h2>
                  {unpaidPayouts.length > 0 && (
                    <button
                      onClick={() => markPaidMut.mutate(unpaidPayouts.map((p) => p.id))}
                      disabled={markPaidMut.isPending}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {markPaidMut.isPending ? 'Marking…' : `Mark All Paid (${unpaidPayouts.length})`}
                    </button>
                  )}
                </div>
                {paidCount !== null && (
                  <p className="text-xs text-green-600 mb-2">✓ {paidCount} payout(s) marked paid</p>
                )}
                {payoutsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                {!payoutsQuery.isLoading && payouts.length === 0 && (
                  <p className="text-sm text-gray-400">No payouts for this run.</p>
                )}
                <div className="space-y-1">
                  {payouts.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm border-b border-gray-50 py-2">
                      <div className="min-w-0">
                        <span className="text-gray-500 font-mono text-xs">{p.participantId.slice(0, 8)}…</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.status}
                        </span>
                      </div>
                      <span className="font-medium shrink-0 ml-2">{fmtDollars(p.adjustedAmountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'earnings' && (
              <div>
                <h2 className="text-sm font-medium text-gray-800 mb-3">Earnings Results ({earnings.length})</h2>
                {earningsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                {!earningsQuery.isLoading && earnings.length === 0 && (
                  <p className="text-sm text-gray-400">No earnings results for this run.</p>
                )}
                {earnings.length > 0 && (
                  <>
                    {/* Summary stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Total Gross</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {fmtDollars(earnings.reduce((s, e) => s + e.grossEarningsCents, 0))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Total Capped</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {fmtDollars(earnings.reduce((s, e) => s + e.cappedEarningsCents, 0))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Avg Attainment</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {earnings.length > 0
                            ? Math.round(earnings.reduce((s, e) => s + e.attainmentPct, 0) / earnings.length * 100) + '%'
                            : '—'}
                        </div>
                      </div>
                    </div>

                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Participant</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Attainment</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Gross</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Capped</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {earnings.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-600">{e.participantId.slice(0, 8)}…</td>
                            <td className="px-3 py-2 text-right">
                              <span className={e.attainmentPct >= 1 ? 'text-green-700 font-medium' : 'text-amber-700'}>
                                {Math.round(e.attainmentPct * 100)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmtDollars(e.grossEarningsCents)}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtDollars(e.cappedEarningsCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 lg:col-span-2 flex items-center justify-center text-gray-400 text-sm">
            Select a run to view details
          </div>
        )}
      </div>
    </div>
  )
}
