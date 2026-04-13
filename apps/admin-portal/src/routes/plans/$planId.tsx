import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, plansApi, planVersionsApi, componentsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans/$planId',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PlanDetailPage,
})

type Plan = { id: string; name: string; description?: string; status: string; currency: string; effectiveFrom: string }
type PlanVersion = { id: string; planId: string; version: number; status: string; createdAt: string; publishedAt?: string }
type Component = { id: string; name: string; type: string; formulaId?: string; config: Record<string, unknown>; sortOrder: number }

const COMPONENT_TYPES = ['commission', 'bonus', 'spiff', 'mbo', 'draw', 'guarantee']
const FORMULA_IDS = ['accelerated-commission', 'mbo-bonus', 'flat-rate', 'tiered-commission']

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  published: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-600',
}

function PlanDetailPage() {
  const { planId } = Route.useParams()
  const qc = useQueryClient()
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null)
  const [showAddComponent, setShowAddComponent] = useState<string | null>(null)
  const [componentForm, setComponentForm] = useState({ name: '', type: 'commission', formulaId: '', sortOrder: 0 })
  const [successMsg, setSuccessMsg] = useState('')

  const planQuery = useQuery({
    queryKey: ['plans', planId],
    queryFn: () => plansApi.get(planId),
  })

  const versionsQuery = useQuery({
    queryKey: ['plan-versions', planId],
    queryFn: () => planVersionsApi.list(planId),
  })

  const plan = planQuery.data?.data as Plan | undefined
  const versions = (versionsQuery.data?.data ?? []) as PlanVersion[]

  const publishMut = useMutation({
    mutationFn: () => planVersionsApi.publish(planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans', planId] })
      qc.invalidateQueries({ queryKey: ['plan-versions', planId] })
      setSuccessMsg('Plan published successfully.')
      setTimeout(() => setSuccessMsg(''), 3000)
    },
  })

  const addComponentMut = useMutation({
    mutationFn: ({ versionId, body }: { versionId: string; body: unknown }) =>
      componentsApi.create(planId, versionId, body),
    onSuccess: (_, { versionId }) => {
      qc.invalidateQueries({ queryKey: ['components', versionId] })
      setShowAddComponent(null)
      setComponentForm({ name: '', type: 'commission', formulaId: '', sortOrder: 0 })
    },
  })

  if (planQuery.isLoading) return <div className="p-8 text-sm text-gray-500">Loading…</div>
  if (!plan) return <div className="p-8 text-sm text-red-500">Plan not found.</div>

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{plan.name}</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[plan.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {plan.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{plan.description ?? 'No description'}</p>
          <p className="text-xs text-gray-400 mt-1">Effective from {plan.effectiveFrom} · {plan.currency}</p>
        </div>
        <div className="flex gap-2">
          {['draft', 'approved', 'pending_approval'].includes(plan.status) && (
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {publishMut.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-2 text-sm">
          {successMsg}
        </div>
      )}
      {publishMut.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-2 text-sm">
          Failed to publish plan.
        </div>
      )}

      {/* Versions */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-medium text-gray-900">Plan Versions</h2>
        </div>

        {versionsQuery.isLoading && <p className="p-5 text-sm text-gray-500">Loading versions…</p>}

        {versions.length === 0 && !versionsQuery.isLoading && (
          <p className="p-5 text-sm text-gray-400">No versions yet.</p>
        )}

        <div className="divide-y divide-gray-100">
          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              planId={planId}
              expanded={expandedVersionId === v.id}
              onToggle={() => setExpandedVersionId(expandedVersionId === v.id ? null : v.id)}
              showAddComponent={showAddComponent === v.id}
              onToggleAddComponent={() => setShowAddComponent(showAddComponent === v.id ? null : v.id)}
              componentForm={componentForm}
              setComponentForm={setComponentForm}
              onAddComponent={(body) => addComponentMut.mutate({ versionId: v.id, body })}
              addComponentPending={addComponentMut.isPending}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VersionRow({
  version, planId, expanded, onToggle,
  showAddComponent, onToggleAddComponent,
  componentForm, setComponentForm, onAddComponent, addComponentPending,
}: {
  version: PlanVersion
  planId: string
  expanded: boolean
  onToggle: () => void
  showAddComponent: boolean
  onToggleAddComponent: () => void
  componentForm: { name: string; type: string; formulaId: string; sortOrder: number }
  setComponentForm: (f: typeof componentForm) => void
  onAddComponent: (body: unknown) => void
  addComponentPending: boolean
}) {
  const componentsQuery = useQuery({
    queryKey: ['components', version.id],
    queryFn: () => componentsApi.list(planId, version.id),
    enabled: expanded,
  })

  const comps = (componentsQuery.data?.data ?? []) as Component[]

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-900">v{version.version}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[version.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {version.status}
          </span>
          <span className="text-xs text-gray-400">
            Created {new Date(version.createdAt).toLocaleDateString()}
            {version.publishedAt && ` · Published ${new Date(version.publishedAt).toLocaleDateString()}`}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between py-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Components ({comps.length})
            </p>
            <button
              onClick={onToggleAddComponent}
              className="text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50"
            >
              + Add Component
            </button>
          </div>

          {componentsQuery.isLoading && <p className="text-xs text-gray-400">Loading…</p>}

          {comps.length === 0 && !componentsQuery.isLoading && (
            <p className="text-xs text-gray-400 py-2">No components yet.</p>
          )}

          <div className="space-y-2 mb-3">
            {comps.map((c) => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Type: <span className="font-medium">{c.type}</span>
                    {c.formulaId && <> · Formula: <span className="font-medium">{c.formulaId}</span></>}
                  </p>
                </div>
                <span className="text-xs text-gray-400">order {c.sortOrder}</span>
              </div>
            ))}
          </div>

          {showAddComponent && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onAddComponent({
                  name: componentForm.name,
                  type: componentForm.type,
                  formulaId: componentForm.formulaId || undefined,
                  sortOrder: componentForm.sortOrder,
                  config: {},
                })
              }}
              className="bg-white border border-gray-200 rounded-md p-4 space-y-3"
            >
              <p className="text-xs font-medium text-gray-700">New Component</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Name</label>
                  <input
                    value={componentForm.name}
                    onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                    required
                    placeholder="e.g. Quota Attainment"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Type</label>
                  <select
                    value={componentForm.type}
                    onChange={(e) => setComponentForm({ ...componentForm, type: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                  >
                    {COMPONENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Formula</label>
                  <select
                    value={componentForm.formulaId}
                    onChange={(e) => setComponentForm({ ...componentForm, formulaId: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                  >
                    <option value="">— none —</option>
                    {FORMULA_IDS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Sort Order</label>
                  <input
                    type="number"
                    value={componentForm.sortOrder}
                    onChange={(e) => setComponentForm({ ...componentForm, sortOrder: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addComponentPending}
                  className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addComponentPending ? 'Adding…' : 'Add Component'}
                </button>
                <button type="button" onClick={onToggleAddComponent} className="text-xs text-gray-500 px-3 py-1.5">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
