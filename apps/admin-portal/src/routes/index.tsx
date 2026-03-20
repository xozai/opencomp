import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAccessToken, calculationsApi, disputesApi, approvalsApi } from '../lib/api'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: Dashboard,
})

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function Dashboard() {
  const runs = useQuery({ queryKey: ['calc-runs'], queryFn: () => calculationsApi.listRuns() })
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: () => disputesApi.list() })
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: () => approvalsApi.list({ status: 'pending' }) })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Calculation Runs" value={runs.data?.data.length ?? '—'} />
        <StatCard label="Open Disputes" value={disputes.data?.total ?? '—'} />
        <StatCard label="Pending Approvals" value={approvals.data?.total ?? '—'} />
        <StatCard label="Tenant" value="Acme Corp" />
      </div>
    </div>
  )
}
