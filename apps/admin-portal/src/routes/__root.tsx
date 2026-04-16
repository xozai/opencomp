import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { getAccessToken, clearTokens } from '../lib/api'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    label: 'Plan Design',
    items: [
      { to: '/plans', label: 'Plans' },
      { to: '/positions', label: 'Positions' },
      { to: '/credit-rules', label: 'Credit Rules' },
      { to: '/measure-definitions', label: 'Measures' },
      { to: '/earnings-rules', label: 'Earnings Rules' },
    ],
  },
  {
    label: 'People & Periods',
    items: [
      { to: '/participants', label: 'Participants' },
      { to: '/periods', label: 'Periods' },
      { to: '/quotas', label: 'Quotas' },
      { to: '/goal-sheets', label: 'Goal Sheets' },
    ],
  },
  {
    label: 'Processing',
    items: [
      { to: '/transactions', label: 'Transactions' },
      { to: '/calculations', label: 'Calculations' },
      { to: '/payment-statements', label: 'Payments' },
      { to: '/adjustments', label: 'Adjustments' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { to: '/disputes', label: 'Disputes' },
      { to: '/approvals', label: 'Approvals' },
    ],
  },
]

function RootLayout() {
  const token = getAccessToken()

  if (!token) {
    return <Outlet />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
        <div className="h-14 flex items-center px-4 border-b border-gray-200 shrink-0">
          <span className="text-lg font-semibold text-indigo-600">OpenComp</span>
        </div>
        <nav className="flex-1 py-3 px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 [&.active]:bg-indigo-100 [&.active]:text-indigo-700"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => { clearTokens(); window.location.href = '/login' }}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 rounded-md"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
