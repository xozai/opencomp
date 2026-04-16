import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, positionsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/positions/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PositionsPage,
})

type Position = {
  id: string
  name: string
  type: string
  level: number | null
  reportsTo: string | null
  isActive: boolean
}

const POSITION_TYPES = ['individual_contributor', 'manager', 'director', 'vp', 'executive']

function PositionsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'individual_contributor', level: '' })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: () => positionsApi.list(),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => positionsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['positions'] })
      setCreating(false)
      setForm({ name: '', type: 'individual_contributor', level: '' })
      setError(null)
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Failed to create position')
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      positionsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['positions'] }),
  })

  const positions = (data?.data ?? []) as Position[]

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createMut.mutate({
      name: form.name,
      type: form.type,
      ...(form.level ? { level: parseInt(form.level, 10) } : {}),
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Positions</h1>
          <p className="text-sm text-gray-500 mt-1">Define the sales org hierarchy for credit rule inheritance</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          Add Position
        </button>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6"
        >
          <h2 className="font-medium text-gray-800 mb-4">New Position</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Senior Account Executive"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level (optional)</label>
              <input
                type="number"
                value={form.level}
                onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="1–10"
                min={1}
                max={10}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {POSITION_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMut.isPending ? 'Creating…' : 'Create Position'}
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

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : positions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">No positions yet</p>
          <p className="text-sm mt-1">Add positions to define your sales org hierarchy</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Level</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {positions.map((pos) => (
                <tr key={pos.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{pos.name}</td>
                  <td className="px-4 py-3 text-gray-600">{pos.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-gray-600">{pos.level ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      pos.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {pos.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleMut.mutate({ id: pos.id, isActive: !pos.isActive })}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {pos.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
