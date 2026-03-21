import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, disputesApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/disputes/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: DisputesPage,
})

type Dispute = {
  id: string
  status: string
  reason: string
  participantId: string
  payoutId: string
  createdAt: string
  assignedToId?: string
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
}

function DisputesPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Dispute | null>(null)
  const [resolution, setResolution] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['disputes', statusFilter],
    queryFn: () => disputesApi.list(statusFilter ? { status: statusFilter } : undefined),
  })

  const disputes = (data?.data ?? []) as Dispute[]

  const resolveMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => disputesApi.resolve(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disputes'] }); setSelected(null); setResolution('') },
  })

  const assignMut = useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string }) => disputesApi.assign(id, assignedToId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disputes'] }); setAssignTo('') },
  })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Disputes</h1>

      <div className="flex items-center gap-3 mb-4">
        {['', 'open', 'under_review', 'resolved', 'escalated'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {isLoading && <p className="p-6 text-sm text-gray-500">Loading…</p>}
          {!isLoading && disputes.length === 0 && <p className="p-6 text-sm text-gray-500">No disputes found.</p>}
          {disputes.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelected(d)}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${selected?.id === d.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{d.reason}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {d.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(d.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {selected && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h2 className="font-medium text-gray-800">Dispute Detail</h2>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-gray-500">ID</dt><dd className="font-mono text-gray-800">{selected.id}</dd></div>
              <div><dt className="text-gray-500">Reason</dt><dd>{selected.reason}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd>{selected.status}</dd></div>
              <div><dt className="text-gray-500">Participant</dt><dd className="font-mono">{selected.participantId}</dd></div>
            </dl>

            {selected.status !== 'resolved' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Assign to (user ID)</label>
                  <div className="flex gap-2">
                    <input
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => assignMut.mutate({ id: selected.id, assignedToId: assignTo })}
                      className="bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-sm hover:bg-gray-200"
                    >
                      Assign
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Resolution notes</label>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => resolveMut.mutate({ id: selected.id, body: { resolution, outcome: 'approved' } })}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Resolve (Approve)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
