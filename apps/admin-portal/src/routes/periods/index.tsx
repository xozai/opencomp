import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, periodsApi } from '../../lib/api'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/periods/',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PeriodsPage,
})

type Period = {
  id: string
  name: string
  startDate: string
  endDate: string
  isClosed: boolean
  createdAt: string
}

function PeriodsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })
  const periods = (data?.data ?? []) as Period[]

  const createMut = useMutation({
    mutationFn: (body: unknown) => periodsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      setCreating(false)
      setForm({ name: '', startDate: '', endDate: '' })
    },
  })

  const closeMut = useMutation({
    mutationFn: (id: string) => periodsApi.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['periods'] }),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Periods</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          New Period
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6 flex gap-3 flex-wrap items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Q2 2026"
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">End Date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMut.isPending} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Start', 'End', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {periods.length === 0 && !isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No periods yet.</td></tr>
            )}
            {periods.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.startDate}</td>
                <td className="px-4 py-3 text-gray-600">{p.endDate}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.isClosed ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                    {p.isClosed ? 'Closed' : 'Open'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {!p.isClosed && (
                    <button
                      onClick={() => closeMut.mutate(p.id)}
                      disabled={closeMut.isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Close
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
