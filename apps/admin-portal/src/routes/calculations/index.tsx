import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, calculationsApi, creditsApi, payoutsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calculations/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: CalculationsPage,
})

type Run = { id: string; status: string; periodId: string; planVersionId?: string; createdAt: string }
type Payout = { id: string; participantId: string; grossAmountCents: number; adjustedAmountCents: number; currency: string; status: string }

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
}

function CalculationsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ periodId: '', planVersionId: '' })
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [creditResult, setCreditResult] = useState<{ credited: number; skipped: number; total: number } | null>(null)
  const [paidCount, setPaidCount] = useState<number | null>(null)

  const runsQuery = useQuery({ queryKey: ['calc-runs'], queryFn: () => calculationsApi.listRuns() })
  const runs = (runsQuery.data?.data ?? []) as Run[]

  const payoutsQuery = useQuery({
    queryKey: ['payouts', selectedRun],
    queryFn: () => payoutsApi.list({ calculationRunId: selectedRun! }),
    enabled: !!selectedRun,
  })
  const payouts = (payoutsQuery.data?.data ?? []) as Payout[]

  const startMut = useMutation({
    mutationFn: (body: unknown) => calculationsApi.startRun(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calc-runs'] }); setForm({ periodId: '', planVersionId: '' }) },
  })

  const creditMut = useMutation({
    mutationFn: (body: { periodId: string; planVersionId: string }) => creditsApi.creditPeriod(body),
    onSuccess: (res) => setCreditResult(res.data),
  })

  const markPaidMut = useMutation({
    mutationFn: (ids: string[]) => payoutsApi.markPaid(ids),
    onSuccess: (res) => {
      setPaidCount(res.data.paid)
      qc.invalidateQueries({ queryKey: ['payouts', selectedRun] })
    },
  })

  const unpaidPayouts = payouts.filter((p) => p.status !== 'paid')

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Calculation Runs</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Period ID</label>
            <input
              value={form.periodId}
              onChange={(e) => setForm({ ...form, periodId: e.target.value })}
              placeholder="UUID"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Plan Version ID</label>
            <input
              value={form.planVersionId}
              onChange={(e) => setForm({ ...form, planVersionId: e.target.value })}
              placeholder="UUID"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              if (!form.periodId || !form.planVersionId) return
              setCreditResult(null)
              creditMut.mutate({ periodId: form.periodId, planVersionId: form.planVersionId })
            }}
            disabled={creditMut.isPending || !form.periodId || !form.planVersionId}
            className="border border-indigo-300 text-indigo-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
          >
            {creditMut.isPending ? 'Applying Credits…' : '1. Apply Credits'}
          </button>
          <button
            onClick={() => {
              if (!form.periodId || !form.planVersionId) return
              startMut.mutate(form)
            }}
            disabled={startMut.isPending || !form.periodId || !form.planVersionId}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {startMut.isPending ? 'Starting…' : '2. Start Calculation Run'}
          </button>
          {creditResult && (
            <span className="text-xs text-green-700 self-center">
              Credits applied: {creditResult.credited} new, {creditResult.skipped} skipped of {creditResult.total} transactions
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {runs.length === 0 && <p className="p-6 text-sm text-gray-500">No runs yet.</p>}
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => { setSelectedRun(run.id); setPaidCount(null) }}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${selectedRun === run.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{run.id.slice(0, 8)}…</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {run.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(run.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {selectedRun && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-800">Payouts</h2>
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
              <p className="text-xs text-green-600 mb-2">{paidCount} payout(s) marked paid.</p>
            )}
            {payoutsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {!payoutsQuery.isLoading && payouts.length === 0 && (
              <p className="text-sm text-gray-400">No payouts for this run.</p>
            )}
            <div className="space-y-1">
              {payouts.map((p) => (
                <div key={p.id} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                  <div className="min-w-0">
                    <span className="text-gray-500 font-mono text-xs">{p.participantId.slice(0, 8)}…</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  <span className="font-medium shrink-0 ml-2">
                    {(p.adjustedAmountCents / 100).toLocaleString('en-US', { style: 'currency', currency: p.currency })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
