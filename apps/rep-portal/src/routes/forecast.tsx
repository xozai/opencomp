import { createRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getAccessToken, forecastApi, periodsApi } from '../lib/api'
import type { ForecastQuota, ForecastEarning, ForecastPayment } from '../lib/api'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forecast',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' })
  },
  component: ForecastPage,
})

function fmtDollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function AttainmentBar({ pct }: { pct: number }) {
  const width = Math.min((Math.min(pct, 1.5) / 1.5) * 100, 100)
  const color = pct >= 1 ? 'bg-green-500' : pct >= 0.75 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}

function QuotaCard({ quota, earnings, payment }: {
  quota: ForecastQuota
  earnings: ForecastEarning | undefined
  payment: ForecastPayment | undefined
}) {
  const attainment = earnings?.attainmentPct ?? 0
  const earned = earnings?.cappedEarningsCents ?? 0
  const paid = payment?.paidCents ?? 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-gray-900 capitalize">{quota.type.replace(/_/g, ' ')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Quota: {fmtDollars(quota.amountCents)}</p>
        </div>
        {earnings && (
          <div className="text-right">
            <div className={`text-lg font-bold ${attainment >= 1 ? 'text-green-600' : attainment >= 0.75 ? 'text-amber-600' : 'text-red-600'}`}>
              {Math.round(attainment * 100)}%
            </div>
            <div className="text-xs text-gray-400">attainment</div>
          </div>
        )}
      </div>

      {earnings ? (
        <>
          <AttainmentBar pct={attainment} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-sm font-semibold text-indigo-700">{fmtDollars(earned)}</div>
              <div className="text-xs text-gray-400 mt-0.5">Earned</div>
            </div>
            <div>
              <div className={`text-sm font-semibold ${paid > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {paid > 0 ? fmtDollars(paid) : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Paid</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-700">
                {earned > paid ? fmtDollars(earned - paid) : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Pending</div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400 mt-2 italic">No calculation data yet for this quota.</p>
      )}
    </div>
  )
}

function ForecastPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('')

  const { data: periodsData } = useQuery({
    queryKey: ['periods'],
    queryFn: () => periodsApi.list(),
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['forecast', selectedPeriod],
    queryFn: () => forecastApi.get(selectedPeriod || undefined),
  })

  const periods = (periodsData?.data ?? []) as Array<{ id: string; name: string }>
  const forecast = data?.data
  const summary = forecast?.summary

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Earnings Forecast</h1>
          {forecast?.period && (
            <p className="text-sm text-gray-500 mt-0.5">
              {forecast.period.name}
              {' · '}
              {forecast.period.startDate} – {forecast.period.endDate}
              {forecast.period.isClosed && (
                <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Closed</span>
              )}
            </p>
          )}
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">Current period</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Loading forecast…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error instanceof Error ? error.message : 'Failed to load forecast'}
        </div>
      )}

      {forecast && !isLoading && (
        <>
          {/* Summary strip */}
          {summary && summary.totalQuotaAmountCents > 0 && (
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl p-5 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-indigo-200 mb-1">Total Quota</div>
                  <div className="text-3xl font-bold">{fmtDollars(summary.totalQuotaAmountCents)}</div>
                </div>
                {summary.totalEarnedCents > 0 && (
                  <div className="text-right">
                    <div className="text-sm text-indigo-200 mb-1">Overall Attainment</div>
                    <div className="text-2xl font-semibold">
                      {Math.round((summary.totalEarnedCents / Math.max(summary.totalQuotaAmountCents, 1)) * 100)}%
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-indigo-500">
                <div>
                  <div className="text-xs text-indigo-300">Earned (projected)</div>
                  <div className="font-semibold mt-0.5">
                    {summary.totalEarnedCents > 0 ? fmtDollars(summary.totalEarnedCents) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-indigo-300">Paid to date</div>
                  <div className="font-semibold mt-0.5">
                    {summary.totalPaidCents > 0 ? fmtDollars(summary.totalPaidCents) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-indigo-300">Pending payment</div>
                  <div className="font-semibold mt-0.5">
                    {summary.totalEarnedCents > summary.totalPaidCents
                      ? fmtDollars(summary.totalEarnedCents - summary.totalPaidCents)
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Per-quota breakdown */}
          {forecast.quotas.length > 0 ? (
            <div className="space-y-4">
              {forecast.quotas.map(quota => {
                // Try to match earnings by componentId (from goal sheet data if available)
                const earnings = forecast.earnings[0] // Simple: first earnings result
                const payment = forecast.payments[0]
                return (
                  <QuotaCard
                    key={quota.id}
                    quota={quota}
                    earnings={earnings}
                    payment={payment}
                  />
                )
              })}

              {/* Earnings breakdown table if multiple components */}
              {forecast.earnings.length > 1 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-medium text-gray-900 mb-3">Earnings by Component</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left pb-2">Component</th>
                        <th className="text-right pb-2">Attainment</th>
                        <th className="text-right pb-2">Earned</th>
                        <th className="text-right pb-2">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {forecast.earnings.map(e => {
                        const payment = forecast.payments.find(p => p.componentId === e.componentId)
                        return (
                          <tr key={e.componentId}>
                            <td className="py-2 text-gray-600 font-mono text-xs">{e.componentId.slice(0, 8)}…</td>
                            <td className="py-2 text-right">
                              <span className={`font-medium ${e.attainmentPct >= 1 ? 'text-green-700' : 'text-amber-700'}`}>
                                {Math.round(e.attainmentPct * 100)}%
                              </span>
                            </td>
                            <td className="py-2 text-right text-indigo-700">{fmtDollars(e.cappedEarningsCents)}</td>
                            <td className="py-2 text-right text-green-700">
                              {payment?.paidCents ? fmtDollars(payment.paidCents) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📊</div>
              <p className="text-gray-600 font-medium">No forecast data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                {forecast.period
                  ? 'Quota targets will appear once your manager sets them up.'
                  : 'No active period found.'}
              </p>
            </div>
          )}

          {forecast.goalSheet && (
            <div className="mt-6 text-xs text-gray-400 text-center">
              {forecast.goalSheet.acknowledgedAt
                ? `Goal sheet acknowledged on ${new Date(forecast.goalSheet.acknowledgedAt).toLocaleDateString()}`
                : 'Goal sheet not yet acknowledged — check Goal Sheets tab'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
