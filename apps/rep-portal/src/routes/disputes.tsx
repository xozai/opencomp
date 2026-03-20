import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, disputesApi, auth } from '../lib/api'

export const Route = createFileRoute('/disputes')({
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: DisputesPage,
})

type Dispute = {
  id: string
  status: string
  reason: string
  payoutId: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
}

function DisputesPage() {
  const qc = useQueryClient()
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const [form, setForm] = useState({ payoutId: '', reason: '' })
  const [showForm, setShowForm] = useState(false)

  const participantId = meQuery.data?.data.sub ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['my-disputes', participantId],
    queryFn: () => disputesApi.list(participantId ? { participantId } : undefined),
    enabled: !!participantId,
  })

  const openMut = useMutation({
    mutationFn: (body: unknown) => disputesApi.open(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-disputes'] })
      setShowForm(false)
      setForm({ payoutId: '', reason: '' })
    },
  })

  const disputes = (data?.data ?? []) as Dispute[]

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Disputes</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          Open Dispute
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            openMut.mutate({ ...form, participantId })
          }}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3"
        >
          <h2 className="font-medium text-gray-800">File a Dispute</h2>
          <div>
            <label className="text-xs text-gray-500">Payout ID</label>
            <input
              value={form.payoutId}
              onChange={(e) => setForm({ ...form, payoutId: e.target.value })}
              placeholder="UUID of the payout in question"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Describe the issue…"
              rows={3}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
              Submit
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="space-y-3">
        {disputes.length === 0 && !isLoading && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
            No disputes filed yet.
          </div>
        )}
        {disputes.map((d) => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">{d.reason}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ml-3 ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {d.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Filed {new Date(d.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
