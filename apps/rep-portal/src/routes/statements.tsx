import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, statementsApi, auth } from '../lib/api'

export const Route = createFileRoute('/statements')({
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

function StatementsPage() {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const [periodId, setPeriodId] = useState('')
  const [queriedPeriod, setQueriedPeriod] = useState('')

  const participantId = meQuery.data?.data.sub ?? ''

  const statementQuery = useQuery({
    queryKey: ['statement', participantId, queriedPeriod],
    queryFn: () => statementsApi.get(participantId, queriedPeriod),
    enabled: !!participantId && !!queriedPeriod,
  })

  const statement = statementQuery.data?.data as Statement | undefined

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Compensation Statement</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); setQueriedPeriod(periodId) }}
        className="flex gap-3 mb-8"
      >
        <input
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          placeholder="Period ID (UUID)"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
          View
        </button>
      </form>

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
