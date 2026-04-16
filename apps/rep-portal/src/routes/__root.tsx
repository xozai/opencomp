import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { getAccessToken, clearTokens } from '../lib/api'

export interface RouterContext { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const NAV = [
  { to: '/forecast', label: '📊 Forecast' },
  { to: '/', label: 'Goal Sheets' },
  { to: '/statements', label: 'Statements' },
  { to: '/disputes', label: 'Disputes' },
]

function RootLayout() {
  const token = getAccessToken()
  if (!token) return <Outlet />

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-200">
          <span className="text-base font-semibold text-indigo-600">OpenComp</span>
          <span className="ml-2 text-xs text-gray-400">Rep</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 [&.active]:bg-indigo-100 [&.active]:text-indigo-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => { clearTokens(); window.location.href = '/login' }}
            className="w-full text-left text-sm text-gray-500 hover:text-red-600"
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
