import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAccessToken, goalSheetsApi, auth } from '../lib/api'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/goal-sheets',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: GoalSheetsPage,
})

type QuotaTarget = {
  componentName: string
  quotaAmountCents: number
  currency: string
}

type GoalSheet = {
  id: string
  participantId: string
  planVersionId: string
  periodId: string
  status: 'draft' | 'distributed' | 'acknowledged'
  distributedAt: string | null
  acknowledgedAt: string | null
  data: {
    targets?: QuotaTarget[]
  }
}

const statusLabel: Record<GoalSheet['status'], string> = {
  draft: 'Draft',
  distributed: 'Awaiting Acknowledgement',
  acknowledged: 'Acknowledged',
}

const statusClass: Record<GoalSheet['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  distributed: 'bg-blue-100 text-blue-700',
  acknowledged: 'bg-green-100 text-green-700',
}

function fmt(cents: number, currency = 'USD') {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency })
}

function GoalSheetsPage() {
  const queryClient = useQueryClient()
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const participantId = meQuery.data?.data.participantId ?? ''

  const sheetsQuery = useQuery({
    queryKey: ['goal-sheets', participantId],
    queryFn: () => goalSheetsApi.list({ participantId }),
    enabled: !!participantId,
  })

  const acknowledge = useMutation({
    mutationFn: (id: string) => goalSheetsApi.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goal-sheets', participantId] }),
  })

  const sheets = (sheetsQuery.data?.data ?? []) as GoalSheet[]

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">My Goal Sheets</h1>

      {sheetsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {sheetsQuery.isError && <p className="text-sm text-red-500">Failed to load goal sheets.</p>}

      {!sheetsQuery.isLoading && sheets.length === 0 && (
        <p className="text-sm text-gray-400">No goal sheets found.</p>
      )}

      <div className="space-y-4">
        {sheets.map((sheet) => {
          const targets = sheet.data?.targets ?? []
          return (
            <div key={sheet.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">Period: {sheet.periodId}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">Plan version: {sheet.planVersionId}</p>
                    {sheet.distributedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Distributed {new Date(sheet.distributedAt).toLocaleDateString()}
                      </p>
                    )}
                    {sheet.acknowledgedAt && (
                      <p className="text-xs text-green-600 mt-0.5 font-medium">
                        Acknowledged on {new Date(sheet.acknowledgedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusClass[sheet.status]}`}>
                      {statusLabel[sheet.status]}
                    </span>
                    {sheet.status === 'distributed' && (
                      <button
                        onClick={() => acknowledge.mutate(sheet.id)}
                        disabled={acknowledge.isPending}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {acknowledge.isPending ? 'Acknowledging…' : 'Acknowledge'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {targets.length > 0 && (
                <div className="border-t border-gray-100">
                  <div className="px-6 py-3">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">Quota Targets</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400">
                          <th className="text-left pb-1">Component</th>
                          <th className="text-right pb-1">Quota Amount</th>
                          <th className="text-right pb-1">Currency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {targets.map((t, i) => (
                          <tr key={i}>
                            <td className="py-1.5 text-gray-700">{t.componentName}</td>
                            <td className="py-1.5 text-right font-medium text-gray-900">{fmt(t.quotaAmountCents, t.currency)}</td>
                            <td className="py-1.5 text-right text-gray-500">{t.currency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
