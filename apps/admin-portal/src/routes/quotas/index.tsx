import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, participantsApi, quotasApi, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quotas/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: QuotasPage,
})

type Quota = {
  id: string
  participantId: string
  periodId: string
  planVersionId: string
  type: string
  amount: number
  currency: string
}

type Participant = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type Period = { id: string; name: string; isClosed: boolean }

function QuotasPage() {
  const qc = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [planVersionId, setPlanVersionId] = useState('')
  const [edits, setEdits] = useState<Record<string, number>>({})

  const periodsQuery = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })
  const periods = (periodsQuery.data?.data ?? []) as Period[]

  const queriedPeriod = selectedPeriodId || (periods[0]?.id ?? '')

  const participantsQuery = useQuery({
    queryKey: ['participants'],
    queryFn: () => participantsApi.list(),
  })

  const quotasQuery = useQuery({
    queryKey: ['quotas', queriedPeriod],
    queryFn: () => quotasApi.list({ periodId: queriedPeriod }),
    enabled: !!queriedPeriod,
  })

  const saveMut = useMutation({
    mutationFn: (body: unknown[]) => quotasApi.bulkUpsert(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotas'] })
      setEdits({})
    },
  })

  const participants = (participantsQuery.data?.data ?? []) as Participant[]
  const quotas = (quotasQuery.data?.data ?? []) as Quota[]

  const quotaByParticipant = Object.fromEntries(quotas.map((q) => [q.participantId, q]))

  function getAmount(participantId: string) {
    if (participantId in edits) return edits[participantId]
    return (quotaByParticipant[participantId]?.amount ?? 0) / 100
  }

  function handleSave() {
    if (!planVersionId) {
      alert('Enter a Plan Version ID first.')
      return
    }
    const payload = Object.entries(edits).map(([participantId, amountDollars]) => ({
      participantId,
      planVersionId,
      periodId: selectedPeriodId || queriedPeriod,
      type: 'revenue',
      amount: Math.round(amountDollars * 100),
      currency: 'USD',
    }))
    if (payload.length === 0) return
    saveMut.mutate(payload)
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Quotas</h1>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Period</label>
          <select
            value={selectedPeriodId || queriedPeriod}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.isClosed ? ' (closed)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Plan Version ID (for saving)</label>
          <input
            value={planVersionId}
            onChange={(e) => setPlanVersionId(e.target.value)}
            placeholder="Plan Version UUID"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-80"
          />
        </div>
      </div>

      {quotasQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {participants.length > 0 && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Participant', 'Email', 'Quota (USD)', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participants.map((p) => {
                  const existing = quotaByParticipant[p.id]
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.firstName} {p.lastName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.email}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={getAmount(p.id)}
                          onChange={(e) =>
                            setEdits({ ...edits, [p.id]: Number(e.target.value) })
                          }
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-32 text-right"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {existing ? 'Set' : 'Not set'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveMut.isPending || Object.keys(edits).length === 0}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            {Object.keys(edits).length > 0 && (
              <span className="text-xs text-gray-500">{Object.keys(edits).length} unsaved change(s)</span>
            )}
            {saveMut.isSuccess && <span className="text-xs text-green-600">Saved!</span>}
          </div>
        </>
      )}
    </div>
  )
}
