import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, participantsApi } from '../../lib/api'

export const Route = createFileRoute('/participants/')({
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: ParticipantsPage,
})

type Participant = {
  id: string
  firstName: string
  lastName: string
  email: string
  employeeId: string
  status: string
  role: string
}

function ParticipantsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', employeeId: '', role: 'rep' })

  const { data, isLoading } = useQuery({
    queryKey: ['participants', search],
    queryFn: () => participantsApi.list(search ? { search } : undefined),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => participantsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participants'] })
      setCreating(false)
      setForm({ firstName: '', lastName: '', email: '', employeeId: '', role: 'rep' })
    },
  })

  const terminateMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => participantsApi.terminate(id, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['participants'] }),
  })

  const participants = (data?.data ?? []) as Participant[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Participants</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          Add Participant
        </button>
      </div>

      <input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm mb-4"
      />

      {creating && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-6 grid grid-cols-2 gap-3"
        >
          <h2 className="col-span-2 font-medium text-gray-800">Add Participant</h2>
          {(['firstName', 'lastName', 'email', 'employeeId'] as const).map((field) => (
            <input
              key={field}
              placeholder={field}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          ))}
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm col-span-2"
          >
            <option value="rep">Rep</option>
            <option value="manager">Manager</option>
            <option value="overlay">Overlay</option>
          </select>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">Save</button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Email', 'Employee ID', 'Role', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-gray-500 text-center">No participants found.</td></tr>
              )}
              {participants.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.firstName} {p.lastName}</td>
                  <td className="px-4 py-3 text-gray-600">{p.email}</td>
                  <td className="px-4 py-3 text-gray-600">{p.employeeId}</td>
                  <td className="px-4 py-3 text-gray-600">{p.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'active' && (
                      <button
                        onClick={() => terminateMut.mutate({ id: p.id, date: new Date().toISOString().split('T')[0] })}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Terminate
                      </button>
                    )}
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
