import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAccessToken, plansApi } from '../../lib/api'

export const Route = createFileRoute('/plans/$planId')({
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: PlanDetailPage,
})

function PlanDetailPage() {
  const { planId } = Route.useParams()
  const { data, isLoading } = useQuery({
    queryKey: ['plans', planId],
    queryFn: () => plansApi.get(planId),
  })

  if (isLoading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  const plan = data?.data as Record<string, unknown> | undefined
  if (!plan) return <div className="p-8 text-sm text-red-500">Plan not found.</div>

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">{plan.name as string}</h1>
      <p className="text-sm text-gray-500 mb-6">{(plan.description as string) ?? 'No description'}</p>
      <dl className="grid grid-cols-2 gap-4">
        {(['status', 'id', 'createdAt', 'updatedAt'] as const).map((key) => (
          <div key={key} className="bg-white border border-gray-200 rounded-lg p-4">
            <dt className="text-xs text-gray-500 uppercase tracking-wide">{key}</dt>
            <dd className="text-sm text-gray-900 mt-1 break-all">{String(plan[key] ?? '—')}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
