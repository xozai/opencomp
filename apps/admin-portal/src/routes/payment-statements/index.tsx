import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, paymentStatementsApi, periodsApi, participantsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/payment-statements/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PaymentStatementsPage,
})

type PaymentBalance = {
  id: string
  participantId: string
  componentId: string
  periodId: string
  openingBalanceCents: number
  earningsCents: number
  paidCents: number
  closingBalanceCents: number
  drawRecoveryCents: number
  currency: string
  status: string
  approvedAt: string | null
  paidAt: string | null
}

type CalcException = {
  id: string
  participantId: string
  exceptionType: string
  severity: string
  message: string
  isResolved: boolean
}

function fmtDollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
}

const EXCEPTION_SEVERITY: Record<string, string> = {
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-gray-100 text-gray-600',
}

export function PaymentStatementsPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'balances' | 'exceptions'>('balances')
  const [periodFilter, setPeriodFilter] = useState('')
  const [participantFilter, setParticipantFilter] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const { data: periodsData } = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })

  const { data: participantsData } = useQuery({
    queryKey: ['participants'],
    queryFn: () => participantsApi.list(),
  })

  const filterParams: Record<string, string> = {}
  if (periodFilter) filterParams['periodId'] = periodFilter
  if (participantFilter) filterParams['participantId'] = participantFilter

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payment-balances', periodFilter, participantFilter],
    queryFn: () => paymentStatementsApi.list(filterParams),
  })

  const { data: exceptionsData } = useQuery({
    queryKey: ['calc-exceptions', periodFilter],
    queryFn: () => paymentStatementsApi.calcExceptions(periodFilter ? { periodId: periodFilter } : undefined),
    enabled: activeTab === 'exceptions',
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => paymentStatementsApi.approve(id),
    onSuccess: () => {
      setActionSuccess('Statement approved.')
      setActionError(null)
      qc.invalidateQueries({ queryKey: ['payment-balances'] })
    },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : 'Approval failed'),
  })

  const markPaidMut = useMutation({
    mutationFn: (id: string) => paymentStatementsApi.markPaid(id),
    onSuccess: () => {
      setActionSuccess('Marked as paid.')
      setActionError(null)
      qc.invalidateQueries({ queryKey: ['payment-balances'] })
    },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : 'Mark paid failed'),
  })

  const balances = (data?.data ?? []) as PaymentBalance[]
  const exceptions = (exceptionsData?.data ?? []) as CalcException[]
  const periods = (periodsData?.data ?? []) as Array<{ id: string; name: string }>
  const participants = (participantsData?.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>

  const pendingCount = balances.filter(b => b.status === 'pending').length
  const approvedCount = balances.filter(b => b.status === 'approved').length
  const unresolvedExceptions = exceptions.filter(e => !e.isResolved).length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payment Statements</h1>
          <p className="text-sm text-gray-500 mt-1">Review, approve, and mark payment balances as paid</p>
        </div>
        <button onClick={() => refetch()} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pending Approval', value: pendingCount, color: 'text-yellow-700' },
          { label: 'Approved', value: approvedCount, color: 'text-blue-700' },
          { label: 'Total Owed', value: fmtDollars(balances.reduce((s, b) => s + b.closingBalanceCents - b.paidCents, 0)), color: 'text-gray-900' },
          { label: 'Unresolved Exceptions', value: unresolvedExceptions, color: unresolvedExceptions > 0 ? 'text-red-700' : 'text-green-700' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">{card.label}</div>
            <div className={`text-2xl font-semibold mt-1 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm mb-4">{actionError}</div>
      )}
      {actionSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm mb-4">{actionSuccess}</div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All periods</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={participantFilter}
          onChange={(e) => setParticipantFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All participants</option>
          {participants.map(p => (
            <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([
          { key: 'balances', label: 'Payment Balances' },
          { key: 'exceptions', label: `Exceptions${unresolvedExceptions > 0 ? ` (${unresolvedExceptions})` : ''}` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'balances' && (
        isLoading ? <p className="text-gray-500 text-sm">Loading…</p> :
        balances.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No payment balances</p>
            <p className="text-sm mt-1">Run a calculation to generate payment data</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Participant</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Opening</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Earnings</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Closing</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {balances.map(b => {
                  const participant = participants.find(p => p.id === b.participantId)
                  const period = periods.find(p => p.id === b.periodId)
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {participant ? `${participant.firstName} ${participant.lastName}` : b.participantId.slice(0, 8) + '…'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{period?.name ?? b.periodId.slice(0, 8) + '…'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtDollars(b.openingBalanceCents)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtDollars(b.earningsCents)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtDollars(b.paidCents)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtDollars(b.closingBalanceCents)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {b.status === 'pending' && !b.approvedAt && (
                            <button
                              onClick={() => approveMut.mutate(b.id)}
                              disabled={approveMut.isPending}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                          )}
                          {b.status === 'approved' && !b.paidAt && (
                            <button
                              onClick={() => markPaidMut.mutate(b.id)}
                              disabled={markPaidMut.isPending}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Mark Paid
                            </button>
                          )}
                          {b.paidAt && (
                            <span className="text-xs text-green-600">✓ Paid {new Date(b.paidAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'exceptions' && (
        exceptions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium text-green-600">✓ No exceptions</p>
            <p className="text-sm mt-1">All calculations look clean</p>
          </div>
        ) : (
          <div className="space-y-2">
            {exceptions.map(ex => (
              <div key={ex.id} className={`bg-white border rounded-lg p-4 ${ex.isResolved ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EXCEPTION_SEVERITY[ex.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ex.severity}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{ex.exceptionType.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{ex.message}</p>
                    <p className="text-xs text-gray-400 mt-1 font-mono">Participant: {ex.participantId.slice(0, 8)}…</p>
                  </div>
                  {ex.isResolved && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

export default PaymentStatementsPage
