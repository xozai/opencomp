import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, plansApi } from '../../lib/api'

export const Route = createFileRoute('/plans/')({
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PlansPage,
})

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-700',
}

function PlansPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.list(),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => plansApi.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); setCreating(false); setName(''); setDescription('') },
  })

  const submitMut = useMutation({
    mutationFn: (id: string) => plansApi.submit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })

  const publishMut = useMutation({
    mutationFn: (id: string) => plansApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })

  const plans = (data?.data ?? []) as Array<{ id: string; name: string; status: string; description?: string }>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Plans</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Plan
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate({ name, description }) }}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3"
        >
          <h2 className="font-medium text-gray-800">Create Plan</h2>
          <input
            placeholder="Plan name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {plans.length === 0 && (
            <p className="p-6 text-sm text-gray-500">No plans yet.</p>
          )}
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <Link to="/plans/$planId" params={{ planId: plan.id }} className="font-medium text-gray-900 hover:text-indigo-600">
                  {plan.name}
                </Link>
                {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[plan.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {plan.status}
                </span>
                {plan.status === 'draft' && (
                  <button
                    onClick={() => submitMut.mutate(plan.id)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Submit
                  </button>
                )}
                {plan.status === 'approved' && (
                  <button
                    onClick={() => publishMut.mutate(plan.id)}
                    className="text-xs text-green-600 hover:underline"
                  >
                    Publish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
