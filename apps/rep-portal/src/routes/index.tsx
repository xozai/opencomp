import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAccessToken, auth, goalSheetsApi } from '../lib/api'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: GoalSheetsPage,
})

type GoalSheet = {
  id: string
  status: string
  periodId: string
  targetAmountCents: number
  currency: string
  acknowledgedAt?: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  distributed: 'bg-blue-100 text-blue-700',
  acknowledged: 'bg-green-100 text-green-700',
}

function GoalSheetsPage() {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const participantId = meQuery.data?.data.participantId ?? ''

  const sheetsQuery = useQuery({
    queryKey: ['goal-sheets', participantId],
    queryFn: () => goalSheetsApi.list(participantId ? { participantId } : undefined),
    enabled: !!participantId,
  })

  const me = meQuery.data?.data
  const sheets = (sheetsQuery.data?.data ?? []) as GoalSheet[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Goal Sheets</h1>
        {me && <p className="text-sm text-gray-500 mt-1">Signed in as {me.email}</p>}
      </div>

      {sheetsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="space-y-4">
        {sheets.length === 0 && !sheetsQuery.isLoading && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
            No goal sheets have been distributed yet.
          </div>
        )}
        {sheets.map((sheet) => (
          <div key={sheet.id} className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Period: <span className="font-mono text-gray-600">{sheet.periodId.slice(0, 8)}…</span></p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  Target: {(sheet.targetAmountCents / 100).toLocaleString('en-US', { style: 'currency', currency: sheet.currency ?? 'USD' })}
                </p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[sheet.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {sheet.status}
              </span>
            </div>
            {sheet.acknowledgedAt && (
              <p className="text-xs text-gray-400 mt-3">Acknowledged {new Date(sheet.acknowledgedAt).toLocaleDateString()}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
