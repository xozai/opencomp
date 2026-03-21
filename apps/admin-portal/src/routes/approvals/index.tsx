import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, approvalsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvals/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: ApprovalsPage,
})

type ApprovalRequest = {
  id: string
  status: string
  entityType: string
  entityId: string
  requestedById: string
  assignedToId?: string
  notes?: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  escalated: 'bg-purple-100 text-purple-700',
}

function ApprovalsPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<ApprovalRequest | null>(null)
  const [comment, setComment] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', statusFilter],
    queryFn: () => approvalsApi.list(statusFilter ? { status: statusFilter } : undefined),
  })

  const approvals = (data?.data ?? []) as ApprovalRequest[]

  const decideMut = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: string; comment?: string }) =>
      approvalsApi.decide(id, { decision, comment }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approvals'] }); setSelected(null); setComment('') },
  })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Approvals</h1>

      <div className="flex items-center gap-3 mb-4">
        {['', 'pending', 'approved', 'rejected', 'escalated'].map((s) => (
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
          {!isLoading && approvals.length === 0 && <p className="p-6 text-sm text-gray-500">No approvals found.</p>}
          {approvals.map((a) => (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${selected?.id === a.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{a.entityType}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {a.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 font-mono">{a.entityId.slice(0, 16)}…</p>
              <p className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {selected && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h2 className="font-medium text-gray-800">Approval Request</h2>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-gray-500">Entity Type</dt><dd>{selected.entityType}</dd></div>
              <div><dt className="text-gray-500">Entity ID</dt><dd className="font-mono">{selected.entityId}</dd></div>
              <div><dt className="text-gray-500">Requested by</dt><dd className="font-mono">{selected.requestedById}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd>{selected.status}</dd></div>
            </dl>

            {selected.status === 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Comment (optional)</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decideMut.mutate({ id: selected.id, decision: 'approved', comment })}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decideMut.mutate({ id: selected.id, decision: 'rejected', comment })}
                    className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decideMut.mutate({ id: selected.id, decision: 'escalated', comment })}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700"
                  >
                    Escalate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
