import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, calculationsApi } from '../../lib/api'
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

  const runsQuery = useQuery({ queryKey: ['calc-runs'], queryFn: () => calculationsApi.listRuns() })
  const runs = (runsQuery.data?.data ?? []) as Run[]

  const payoutsQuery = useQuery({
    queryKey: ['payouts', selectedRun],
    queryFn: () => calculationsApi.getPayouts(selectedRun!),
    enabled: !!selectedRun,
  })

  const startMut = useMutation({
    mutationFn: (body: unknown) => calculationsApi.startRun(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calc-runs'] }); setForm({ periodId: '', planVersionId: '' }) },
  })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Calculation Runs</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); startMut.mutate(form) }}
        className="bg-white border border-gray-200 rounded-lg p-5 mb-6 flex gap-3 items-end"
      >
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Period ID</label>
          <input
            value={form.periodId}
            onChange={(e) => setForm({ ...form, periodId: e.target.value })}
            placeholder="UUID"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Plan Version ID</label>
          <input
            value={form.planVersionId}
            onChange={(e) => setForm({ ...form, planVersionId: e.target.value })}
            placeholder="UUID"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
          Start Run
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {runs.length === 0 && <p className="p-6 text-sm text-gray-500">No runs yet.</p>}
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedRun(run.id)}
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
            <h2 className="text-sm font-medium text-gray-800 mb-3">Payouts</h2>
            {payoutsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {!payoutsQuery.isLoading && (
              <div className="space-y-2">
                {((payoutsQuery.data?.data ?? []) as Array<Record<string, unknown>>).map((p, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                    <span className="text-gray-600">{p.participantId as string}</span>
                    <span className="font-medium">${((p.adjustedAmountCents as number) / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
