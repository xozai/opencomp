import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, earningsRulesApi, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/earnings-rules/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: EarningsRulesPage,
})

type EarningsRule = {
  id: string
  name: string
  formulaType: string
  isActive: boolean
  componentId: string | null
  planVersionId: string | null
  config: Record<string, unknown>
  capType: string | null
  capValue: number | null
}

const FORMULA_TYPES = [
  { value: 'flat_rate', label: 'Flat Rate', hint: 'Fixed % of credited amount' },
  { value: 'tiered', label: 'Tiered', hint: 'Rate varies by attainment bands' },
  { value: 'accelerated', label: 'Accelerated', hint: 'Rate multiplier above quota' },
  { value: 'mbo', label: 'MBO', hint: 'Milestone-based bonus on completion' },
  { value: 'draw', label: 'Draw', hint: 'Advance against future earnings' },
  { value: 'guarantee', label: 'Guarantee', hint: 'Minimum earnings floor' },
]

const DEFAULT_CONFIGS: Record<string, string> = {
  flat_rate: '{"rate": 0.10}',
  tiered: '{"tiers": [{"upTo": 1.0, "rate": 0.08}, {"upTo": 1.25, "rate": 0.10}, {"rate": 0.12}]}',
  accelerated: '{"baseRate": 0.10, "acceleratorRate": 0.15, "threshold": 1.0}',
  mbo: '{"milestones": [{"targetPct": 0.5, "payoutPct": 0.5}, {"targetPct": 1.0, "payoutPct": 1.0}]}',
  draw: '{"drawAmountCents": 500000, "recoveryRate": 0.5}',
  guarantee: '{"guaranteeAmountCents": 1000000}',
}

function EarningsRulesPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'results'>('rules')
  const [periodFilter, setPeriodFilter] = useState('')
  const [form, setForm] = useState({
    name: '',
    formulaType: 'flat_rate',
    config: DEFAULT_CONFIGS['flat_rate'] ?? '',
    capType: '',
    capValue: '',
  })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['earnings-rules'],
    queryFn: () => earningsRulesApi.list(),
  })

  const { data: resultsData } = useQuery({
    queryKey: ['earnings-results', periodFilter],
    queryFn: () => earningsRulesApi.results(periodFilter ? { periodId: periodFilter } : undefined),
    enabled: activeTab === 'results',
  })

  const { data: periodsData } = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => earningsRulesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earnings-rules'] })
      setCreating(false)
      setForm({ name: '', formulaType: 'flat_rate', config: DEFAULT_CONFIGS['flat_rate'] ?? '', capType: '', capValue: '' })
      setError(null)
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to create rule'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive, rule }: { id: string; isActive: boolean; rule: EarningsRule }) =>
      earningsRulesApi.update(id, { ...rule, isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['earnings-rules'] }),
  })

  const rules = (data?.data ?? []) as EarningsRule[]
  const results = (resultsData?.data ?? []) as Array<{
    id: string; participantId: string; componentId: string;
    grossEarningsCents: number; cappedEarningsCents: number; attainmentPct: number
  }>
  const periods = (periodsData?.data ?? []) as Array<{ id: string; name: string }>

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    let config: unknown
    try { config = JSON.parse(form.config) } catch {
      setError('Config must be valid JSON')
      return
    }
    createMut.mutate({
      name: form.name,
      formulaType: form.formulaType,
      config,
      ...(form.capType ? { capType: form.capType } : {}),
      ...(form.capValue ? { capValue: parseFloat(form.capValue) } : {}),
    })
  }

  function handleFormulaChange(type: string) {
    setForm(f => ({ ...f, formulaType: type, config: DEFAULT_CONFIGS[type] ?? '{}' }))
  }

  function fmtDollars(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Earnings Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Configure how credited transactions translate into earnings</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Rule
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-medium text-gray-800 mb-4">Create Earnings Rule</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. New Business Accelerated Commission"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">Formula Type</label>
              <div className="grid grid-cols-3 gap-2">
                {FORMULA_TYPES.map(ft => (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => handleFormulaChange(ft.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      form.formulaType === ft.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-800">{ft.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{ft.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Formula Config (JSON)
              </label>
              <textarea
                required
                value={form.config}
                onChange={(e) => setForm(f => ({ ...f, config: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono resize-none"
                rows={5}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cap Type (optional)</label>
              <select
                value={form.capType}
                onChange={(e) => setForm(f => ({ ...f, capType: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">No cap</option>
                <option value="absolute">Absolute (fixed $ amount)</option>
                <option value="multiplier">Multiplier (× OTE)</option>
              </select>
            </div>

            {form.capType && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cap Value {form.capType === 'absolute' ? '(dollars)' : '(multiplier, e.g. 3 = 3×)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.capValue}
                  onChange={(e) => setForm(f => ({ ...f, capValue: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder={form.capType === 'absolute' ? '50000' : '3.0'}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMut.isPending ? 'Saving…' : 'Save Rule'}
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
        {(['rules', 'results'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'results' ? 'Earnings Results' : 'Rules'}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        isLoading ? <p className="text-gray-500 text-sm">Loading…</p> :
        rules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No earnings rules yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className={`bg-white border rounded-lg p-4 ${rule.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{rule.name}</span>
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        {FORMULA_TYPES.find(f => f.value === rule.formulaType)?.label ?? rule.formulaType}
                      </span>
                      {rule.capType && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          Cap: {rule.capType}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${rule.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 overflow-x-auto max-w-lg">
                      {JSON.stringify(rule.config, null, 2)}
                    </pre>
                  </div>
                  <button
                    onClick={() => toggleMut.mutate({ id: rule.id, isActive: !rule.isActive, rule })}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    {rule.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
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
              {periods.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No earnings results yet. Run a calculation to generate them.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Participant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Component</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Attainment</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Gross Earnings</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Capped Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">{r.participantId.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">{r.componentId.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${r.attainmentPct >= 1 ? 'text-green-700' : 'text-amber-700'}`}>
                          {Math.round(r.attainmentPct * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtDollars(r.grossEarningsCents)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDollars(r.cappedEarningsCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
