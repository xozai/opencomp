import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, adjustmentsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/adjustments',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: AdjustmentsPage,
})

type Adjustment = {
  id: string
  participantId: string
  payoutId: string
  amountCents: number
  currency: string
  type: string
  reason: string
  status: string
  createdAt: string
}

const TYPE_COLORS: Record<string, string> = {
  increase: 'bg-green-100 text-green-700',
  decrease: 'bg-yellow-100 text-yellow-700',
  clawback: 'bg-red-100 text-red-700',
}

function AdjustmentsPage() {
  const qc = useQueryClient()
  const [filterParticipantId, setFilterParticipantId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ payoutId: '', amountCents: '', reason: '', type: 'increase' })
  const [errorMsg, setErrorMsg] = useState('')

  const adjustmentsQuery = useQuery({
    queryKey: ['adjustments', filterParticipantId],
    queryFn: () => adjustmentsApi.list(filterParticipantId ? { participantId: filterParticipantId } : undefined),
  })
  const adjustments = (adjustmentsQuery.data?.data ?? []) as Adjustment[]

  const createMut = useMutation({
    mutationFn: (body: unknown) => adjustmentsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjustments'] })
      setShowForm(false)
      setForm({ payoutId: '', amountCents: '', reason: '', type: 'increase' })
      setErrorMsg('')
    },
    onError: () => setErrorMsg('Failed to create adjustment.'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMut.mutate({
      payoutId: form.payoutId,
      amountCents: parseInt(form.amountCents, 10),
      reason: form.reason,
      type: form.type,
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Adjustments</h1>
        <button
          onClick={() => { setShowForm(!showForm); setErrorMsg('') }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Adjustment
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3">
          <h2 className="font-medium text-gray-800">New Adjustment</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Payout ID</label>
              <input
                value={form.payoutId}
                onChange={(e) => setForm({ ...form, payoutId: e.target.value })}
                placeholder="UUID"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Amount (cents, negative for decrease)</label>
              <input
                type="number"
                value={form.amountCents}
                onChange={(e) => setForm({ ...form, amountCents: e.target.value })}
                placeholder="e.g. 50000 or -25000"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-0.5"
              >
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
                <option value="clawback">Clawback</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason for adjustment"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-0.5"
              />
            </div>
          </div>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMut.isPending ? 'Creating…' : 'Create Adjustment'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <input
          value={filterParticipantId}
          onChange={(e) => setFilterParticipantId(e.target.value)}
          placeholder="Filter by participant ID…"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-80"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Participant</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Payout</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {adjustmentsQuery.isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            )}
            {!adjustmentsQuery.isLoading && adjustments.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No adjustments found.</td></tr>
            )}
            {adjustments.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.participantId?.slice(0, 8)}…</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.payoutId?.slice(0, 8)}…</td>
                <td className={`px-4 py-3 text-sm font-medium ${a.amountCents < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {(a.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: a.currency ?? 'USD' })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[a.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {a.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{a.reason}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{a.status}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
