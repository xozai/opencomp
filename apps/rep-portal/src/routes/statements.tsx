import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, statementsApi, periodsApi, auth } from '../lib/api'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/statements',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: StatementsPage,
})

type Statement = {
  participantId: string
  participantName: string
  periodId: string
  periodName: string
  grossAmountCents: number
  adjustedAmountCents: number
  currency: string
  status: string
  lineItems: Array<{ componentId: string; formulaId: string; payout: number }>
  generatedAt: string
}

type Period = { id: string; name: string; isClosed: boolean }

function StatementsPage() {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const periodsQuery = useQuery({ queryKey: ['periods'], queryFn: () => periodsApi.list() })
  const periods = (periodsQuery.data?.data ?? []) as Period[]

  const participantId = meQuery.data?.data.participantId ?? ''

  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const periodId = selectedPeriodId || (periods[0]?.id ?? '')

  const statementQuery = useQuery({
    queryKey: ['statement', participantId, periodId],
    queryFn: () => statementsApi.get(participantId, periodId),
    enabled: !!participantId && !!periodId,
  })

  const statement = statementQuery.data?.data as Statement | undefined

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Compensation Statement</h1>

      <div className="mb-8">
        <label className="block text-xs text-gray-500 mb-1">Period</label>
        <select
          value={selectedPeriodId || periodId}
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

      {statementQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {statementQuery.isError && <p className="text-sm text-red-500">Statement not found for this period.</p>}

      {statement && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{statement.participantName}</h2>
            <p className="text-sm text-gray-500">{statement.periodName}</p>
          </div>
          <div className="px-6 py-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Gross Payout</p>
              <p className="text-xl font-semibold text-gray-900">
                {(statement.grossAmountCents / 100).toLocaleString('en-US', { style: 'currency', currency: statement.currency })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Adjusted Payout</p>
              <p className="text-xl font-semibold text-indigo-600">
                {(statement.adjustedAmountCents / 100).toLocaleString('en-US', { style: 'currency', currency: statement.currency })}
              </p>
            </div>
          </div>
          {statement.lineItems.length > 0 && (
            <div className="px-6 pb-5">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Line Items</p>
              <div className="space-y-2">
                {statement.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700 border-b border-gray-50 pb-2">
                    <span>{item.formulaId}</span>
                    <span className="font-medium">${(item.payout / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="px-6 py-3 bg-gray-50 text-xs text-gray-400">
            Generated {new Date(statement.generatedAt).toLocaleString()} · Status: {statement.status}
          </div>
        </div>
      )}
    </div>
  )
}
