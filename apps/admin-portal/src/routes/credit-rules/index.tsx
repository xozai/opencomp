import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, creditRulesApi, nlRulesApi, plansApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credit-rules/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: CreditRulesPage,
})

type CreditRule = {
  id: string
  name: string
  priority: number
  isActive: boolean
  planVersionId: string | null
  conditions: Array<{ field: string; operator: string; value: unknown }>
  actions: Array<{ type: string; positionId?: string; splitPct?: number }>
}

type NLParseResult = {
  parsedDefinition: unknown
  confidence: number
  warnings: string[]
  requiresReview: boolean
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'green' : pct >= 60 ? 'yellow' : 'red'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>
      {pct}% confidence
    </span>
  )
}

function CreditRulesPage() {
  const qc = useQueryClient()
  const [nlText, setNlText] = useState('')
  const [nlResult, setNlResult] = useState<NLParseResult | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedPlanVersionId, setSelectedPlanVersionId] = useState('')
  const [form, setForm] = useState({ name: '', priority: '10', definition: '' })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['credit-rules'],
    queryFn: () => creditRulesApi.list(),
  })

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.list(),
  })

  const nlParseMut = useMutation({
    mutationFn: (text: string) =>
      nlRulesApi.parse({
        text,
        ruleType: 'credit',
        ...(selectedPlanVersionId ? { planVersionId: selectedPlanVersionId } : {}),
      }),
    onSuccess: (res) => {
      setNlResult(res.data)
      // Pre-fill definition with parsed result
      setForm(f => ({ ...f, definition: JSON.stringify(res.data.parsedDefinition, null, 2) }))
    },
    onError: () => setError('AI parsing failed. Check your API key configuration.'),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => creditRulesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-rules'] })
      setShowCreate(false)
      setNlText('')
      setNlResult(null)
      setForm({ name: '', priority: '10', definition: '' })
      setError(null)
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to create rule'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive, rule }: { id: string; isActive: boolean; rule: CreditRule }) =>
      creditRulesApi.update(id, { ...rule, isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-rules'] }),
  })

  const rules = (data?.data ?? []) as CreditRule[]
  const plans = (plansData?.data ?? []) as Array<{ id: string; name: string }>

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    let definition: unknown
    try {
      definition = JSON.parse(form.definition)
    } catch {
      setError('Definition must be valid JSON')
      return
    }
    createMut.mutate({
      name: form.name,
      priority: parseInt(form.priority, 10),
      definition,
      ...(selectedPlanVersionId ? { planVersionId: selectedPlanVersionId } : {}),
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Credit Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Define how transactions are credited to positions in the sales hierarchy</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Rule
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-medium text-gray-800 mb-4">Create Credit Rule</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          {/* NL Parse section */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-indigo-800">✨ Parse with AI</span>
              <span className="text-xs text-indigo-600">Describe your rule in plain English</span>
            </div>
            <textarea
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              className="w-full border border-indigo-300 rounded-md px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder='e.g. "Credit the owning rep 100% when deal type is New Business. If the rep reports to a manager, also credit the manager 50% via inheritance."'
            />
            {plans.length > 0 && (
              <div className="mt-2">
                <label className="text-xs text-indigo-700 font-medium">Plan context (optional)</label>
                <select
                  value={selectedPlanVersionId}
                  onChange={(e) => setSelectedPlanVersionId(e.target.value)}
                  className="ml-2 text-xs border border-indigo-300 rounded px-2 py-1"
                >
                  <option value="">No plan context</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => nlParseMut.mutate(nlText)}
              disabled={!nlText.trim() || nlParseMut.isPending}
              className="mt-2 bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {nlParseMut.isPending ? 'Parsing…' : 'Parse with AI →'}
            </button>

            {nlResult && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ConfidenceBadge value={nlResult.confidence} />
                  {nlResult.requiresReview && (
                    <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Requires review</span>
                  )}
                </div>
                {nlResult.warnings.length > 0 && (
                  <ul className="text-xs text-amber-700 list-disc list-inside">
                    {nlResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <p className="text-xs text-indigo-600">Definition pre-filled below — review and adjust before saving.</p>
              </div>
            )}
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. New Business Full Credit"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority (lower = first)</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  min={1}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Definition (JSON)</label>
              <textarea
                required
                value={form.definition}
                onChange={(e) => setForm(f => ({ ...f, definition: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono resize-none"
                rows={6}
                placeholder='{"conditions": [], "actions": [{"type": "assign_to_position"}]}'
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMut.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMut.isPending ? 'Saving…' : 'Save Rule'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNlText(''); setNlResult(null); setError(null) }}
                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">No credit rules yet</p>
          <p className="text-sm mt-1">Create a rule to define how deals are credited across your org</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.sort((a, b) => a.priority - b.priority).map((rule) => (
            <div key={rule.id} className={`bg-white border rounded-lg p-4 ${rule.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{rule.name}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      Priority {rule.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rule.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 space-y-1">
                    <div><span className="font-medium">Conditions:</span> {rule.conditions?.length ?? 0}</div>
                    <div><span className="font-medium">Actions:</span> {rule.actions?.map(a => a.type).join(', ') || '—'}</div>
                  </div>
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
      )}
    </div>
  )
}
