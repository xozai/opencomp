import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, measureDefsApi, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/measure-definitions/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: MeasureDefinitionsPage,
})

type MeasureDef = {
  id: string
  name: string
  metricType: string
  aggregation: string
  isActive: boolean
  filters: unknown
  componentId: string | null
  planVersionId: string | null
}

type MeasureResult = {
  id: string
  participantId: string
  measureDefinitionId: string
  periodId: string
  rawValue: number
  creditedValue: number
  attainmentPct: number
  currency: string | null
}

const METRIC_TYPES = ['revenue', 'bookings', 'pipeline', 'activity', 'custom']
const AGGREGATIONS = ['sum', 'count', 'average', 'max', 'min']

function MeasureDefinitionsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'defs' | 'results'>('defs')
  const [periodFilter, setPeriodFilter] = useState('')
  const [form, setForm] = useState({
    name: '',
    metricType: 'revenue',
    aggregation: 'sum',
    filters: '{}',
  })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['measure-definitions'],
    queryFn: () => measureDefsApi.list(),
  })

  const { data: resultsData } = useQuery({
    queryKey: ['measure-results', periodFilter],
    queryFn: () => measureDefsApi.results(periodFilter ? { periodId: periodFilter } : undefined),
    enabled: activeTab === 'results',
  })

  const { data: periodsData } = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => measureDefsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measure-definitions'] })
      setCreating(false)
      setForm({ name: '', metricType: 'revenue', aggregation: 'sum', filters: '{}' })
      setError(null)
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to create definition'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive, def }: { id: string; isActive: boolean; def: MeasureDef }) =>
      measureDefsApi.update(id, { ...def, isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measure-definitions'] }),
  })

  const defs = (data?.data ?? []) as MeasureDef[]
  const results = (resultsData?.data ?? []) as MeasureResult[]
  const periods = (periodsData?.data ?? []) as Array<{ id: string; name: string }>

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    let filters: unknown
    try { filters = JSON.parse(form.filters) } catch {
      setError('Filters must be valid JSON')
      return
    }
    createMut.mutate({ name: form.name, metricType: form.metricType, aggregation: form.aggregation, filters })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Measure Definitions</h1>
          <p className="text-sm text-gray-500 mt-1">Define what metrics are tracked and how they aggregate</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Definition
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-medium text-gray-800 mb-4">New Measure Definition</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. New Business Revenue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Metric Type</label>
              <select
                value={form.metricType}
                onChange={(e) => setForm(f => ({ ...f, metricType: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {METRIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Aggregation</label>
              <select
                value={form.aggregation}
                onChange={(e) => setForm(f => ({ ...f, aggregation: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {AGGREGATIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Filters (JSON) — e.g. <code className="text-xs">{'{"dealType": "new_business"}'}</code>
              </label>
              <textarea
                value={form.filters}
                onChange={(e) => setForm(f => ({ ...f, filters: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono resize-none"
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMut.isPending ? 'Saving…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null) }}
              className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([
          { key: 'defs', label: 'Definitions' },
          { key: 'results', label: 'Measure Results' },
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

      {activeTab === 'defs' && (
        isLoading ? <p className="text-gray-500 text-sm">Loading…</p> :
        defs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No measure definitions yet</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Metric Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Aggregation</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {defs.map(def => (
                  <tr key={def.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{def.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{def.metricType}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{def.aggregation}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${def.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {def.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleMut.mutate({ id: def.id, isActive: !def.isActive, def })}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {def.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'results' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">All periods</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No measurement results yet. Run a calculation to populate this.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Participant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Raw Value</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Credited Value</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Attainment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map(r => {
                    const period = periods.find(p => p.id === r.periodId)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs">{r.participantId.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-gray-600">{period?.name ?? r.periodId.slice(0, 8) + '…'}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.rawValue.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.creditedValue.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${r.attainmentPct >= 1 ? 'text-green-700' : 'text-amber-700'}`}>
                            {Math.round(r.attainmentPct * 100)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
