import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, goalSheetsApi, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/goal-sheets',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: GoalSheetsAdminPage,
})

type GoalSheet = {
  id: string
  participantId: string
  periodId: string
  planVersionId: string
  status: 'draft' | 'distributed' | 'acknowledged'
  distributedAt: string | null
  acknowledgedAt: string | null
}
type Period = { id: string; name: string }

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  distributed: 'bg-blue-100 text-blue-700',
  acknowledged: 'bg-green-100 text-green-700',
}

function GoalSheetsAdminPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ periodId: '', planVersionId: '' })
  const [successMsg, setSuccessMsg] = useState('')
  const [filterPeriodId, setFilterPeriodId] = useState('')

  const periodsQuery = useQuery({ queryKey: ['periods'], queryFn: () => periodsApi.list() })
  const periods = (periodsQuery.data?.data ?? []) as Period[]

  const sheetsQuery = useQuery({
    queryKey: ['goal-sheets-admin', filterPeriodId],
    queryFn: () => goalSheetsApi.list(filterPeriodId ? { periodId: filterPeriodId } : undefined),
  })
  const sheets = (sheetsQuery.data?.data ?? []) as GoalSheet[]

  const generateMut = useMutation({
    mutationFn: (body: unknown) => goalSheetsApi.generate(body),
    onSuccess: (res) => {
      const generated = (res as { data: unknown[] }).data
      if (generated.length === 0) {
        setSuccessMsg('No goal sheets to distribute (all may already exist).')
      } else {
        const ids = generated.map((s: any) => s.id as string)
        distributeMut.mutate(ids)
      }
    },
  })

  const distributeMut = useMutation({
    mutationFn: (ids: string[]) => goalSheetsApi.distribute(ids),
    onSuccess: (res) => {
      const count = (res as { data: unknown[] }).data.length
      setSuccessMsg(`${count} goal sheet${count !== 1 ? 's' : ''} distributed successfully.`)
      setTimeout(() => setSuccessMsg(''), 4000)
      qc.invalidateQueries({ queryKey: ['goal-sheets-admin'] })
      setForm({ periodId: '', planVersionId: '' })
    },
  })

  function handleDistribute(e: React.FormEvent) {
    e.preventDefault()
    generateMut.mutate({ periodId: form.periodId, planVersionId: form.planVersionId })
  }

  const isPending = generateMut.isPending || distributeMut.isPending
  const isError = generateMut.isError || distributeMut.isError

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Goal Sheets</h1>

      {/* Distribute form */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-medium text-gray-800 mb-4">Distribute Goal Sheets</h2>
        <form onSubmit={handleDistribute} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period</label>
            <select
              value={form.periodId}
              onChange={(e) => setForm({ ...form, periodId: e.target.value })}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
            >
              <option value="">Select period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Plan Version ID</label>
            <input
              value={form.planVersionId}
              onChange={(e) => setForm({ ...form, planVersionId: e.target.value })}
              placeholder="UUID"
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-72"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? 'Distributing…' : 'Generate & Distribute'}
          </button>
        </form>
        {successMsg && (
          <p className="mt-3 text-sm text-green-600">{successMsg}</p>
        )}
        {isError && (
          <p className="mt-3 text-sm text-red-600">Failed to distribute goal sheets.</p>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterPeriodId}
          onChange={(e) => setFilterPeriodId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
        >
          <option value="">All periods</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Participant</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan Version</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Distributed</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acknowledged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sheetsQuery.isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            )}
            {!sheetsQuery.isLoading && sheets.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No goal sheets found.</td></tr>
            )}
            {sheets.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.participantId.slice(0, 8)}…</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.periodId.slice(0, 8)}…</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.planVersionId.slice(0, 8)}…</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {s.distributedAt ? new Date(s.distributedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {s.acknowledgedAt ? new Date(s.acknowledgedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
