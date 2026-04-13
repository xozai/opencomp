import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, disputesApi, periodsApi, auth } from '../lib/api'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/disputes',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: DisputesPage,
})

type Dispute = {
  id: string
  status: string
  subject: string
  requestedAmountCents: number | null
  createdAt: string
}

type Period = { id: string; name: string }

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function DisputesPage() {
  const qc = useQueryClient()
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => auth.me() })
  const [form, setForm] = useState({ periodId: '', amount: '', subject: '', description: '' })
  const [showForm, setShowForm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const participantId = meQuery.data?.data.participantId ?? ''

  const periodsQuery = useQuery({ queryKey: ['periods'], queryFn: () => periodsApi.list() })
  const periods = (periodsQuery.data?.data ?? []) as Period[]

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
      setForm({ periodId: '', amount: '', subject: '', description: '' })
      setErrorMsg('')
      setSuccessMsg('Dispute submitted')
      setTimeout(() => setSuccessMsg(''), 5000)
    },
    onError: () => setErrorMsg('Failed to submit dispute. Please try again.'),
  })

  const disputes = (data?.data ?? []) as Dispute[]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const selectedPeriod = periods.find((p) => p.id === form.periodId)
    const subject = selectedPeriod ? `[${selectedPeriod.name}] ${form.subject}` : form.subject
    openMut.mutate({
      participantId,
      subject,
      description: form.description,
      requestedAmountCents: form.amount ? Math.round(parseFloat(form.amount) * 100) : undefined,
      requestedCurrency: form.amount ? 'USD' : undefined,
    })
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Disputes</h1>
        <button
          onClick={() => { setShowForm(!showForm); setErrorMsg(''); setSuccessMsg('') }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'File a Dispute'}
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg">
          {successMsg}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3"
        >
          <h2 className="font-medium text-gray-800">File a Dispute</h2>
          <div>
            <label className="text-xs text-gray-500">Period</label>
            <select
              value={form.periodId}
              onChange={(e) => setForm({ ...form, periodId: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            >
              <option value="">Select a period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Amount in Dispute ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. 1250.00"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Subject <span className="text-red-500">*</span></label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Brief summary of the issue"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Description <span className="text-red-500">*</span></label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the issue in detail — deal names, transaction IDs, expected vs. actual amounts…"
              rows={3}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
            />
          </div>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={openMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {openMut.isPending ? 'Submitting…' : 'Submit Dispute'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setErrorMsg('') }} className="text-sm text-gray-500 px-4 py-2">
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
              <p className="text-sm font-medium text-gray-900">{d.subject}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ml-3 ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {d.status}
              </span>
            </div>
            {d.requestedAmountCents != null && (
              <p className="text-xs text-gray-600 mt-1">Requested: {fmt(d.requestedAmountCents)}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">Filed {new Date(d.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
