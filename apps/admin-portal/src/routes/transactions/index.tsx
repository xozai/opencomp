import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, transactionsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transactions/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: TransactionsPage,
})

type Transaction = {
  id: string
  externalId: string
  source: string
  participantId: string | null
  amountCents: number
  currency: string
  status: string
  transactionDate: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  validated: 'bg-green-100 text-green-700',
  credited: 'bg-blue-100 text-blue-700',
  invalid: 'bg-red-100 text-red-700',
}

const SAMPLE_PAYLOAD = JSON.stringify({
  source: 'salesforce',
  transactions: [
    {
      externalId: 'sf-opp-001',
      transactionDate: '2026-01-15',
      amountCents: 1000000,
      currency: 'USD',
      participantExternalId: 'rep@acme.example',
      payload: { opportunityName: 'Acme Deal', stage: 'Closed Won' },
    },
  ],
}, null, 2)

function TransactionsPage() {
  const qc = useQueryClient()
  const [showIngest, setShowIngest] = useState(false)
  const [json, setJson] = useState(SAMPLE_PAYLOAD)
  const [jsonError, setJsonError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.list(),
  })
  const transactions = (data?.data ?? []) as Transaction[]

  const ingestMut = useMutation({
    mutationFn: (body: unknown) => transactionsApi.ingest(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setShowIngest(false)
    },
  })

  const validateMut = useMutation({
    mutationFn: () => transactionsApi.validatePending(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  function handleIngest(e: React.FormEvent) {
    e.preventDefault()
    setJsonError('')
    try {
      const parsed = JSON.parse(json)
      ingestMut.mutate(parsed)
    } catch {
      setJsonError('Invalid JSON')
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
        <div className="flex gap-2">
          <button
            onClick={() => validateMut.mutate()}
            disabled={validateMut.isPending}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {validateMut.isPending ? 'Validating…' : 'Validate Pending'}
          </button>
          <button
            onClick={() => setShowIngest(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            Ingest Transactions
          </button>
        </div>
      </div>

      {showIngest && (
        <form onSubmit={handleIngest} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3">
          <h2 className="font-medium text-gray-800">Bulk Ingest</h2>
          <p className="text-xs text-gray-500">Paste JSON matching the bulk ingest format: <code>{'{source, transactions[]}'}</code></p>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={10}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono"
          />
          {jsonError && <p className="text-xs text-red-600">{jsonError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={ingestMut.isPending} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
              {ingestMut.isPending ? 'Ingesting…' : 'Submit'}
            </button>
            <button type="button" onClick={() => setShowIngest(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['External ID', 'Source', 'Participant', 'Amount', 'Date', 'Status'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No transactions yet.</td></tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{tx.externalId}</td>
                <td className="px-4 py-3 text-gray-600">{tx.source}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {tx.participantId ? tx.participantId.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-4 py-3 text-gray-900 font-medium">
                  {(tx.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: tx.currency })}
                </td>
                <td className="px-4 py-3 text-gray-600">{tx.transactionDate}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
