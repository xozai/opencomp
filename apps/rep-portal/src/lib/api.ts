/**
 * Rep Portal API client — subset of endpoints accessible to sales reps.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

let _accessToken: string | null = localStorage.getItem('oc_rep_access_token')
let _refreshToken: string | null = localStorage.getItem('oc_rep_refresh_token')

export function setTokens(access: string, refresh: string) {
  _accessToken = access
  _refreshToken = refresh
  localStorage.setItem('oc_rep_access_token', access)
  localStorage.setItem('oc_rep_refresh_token', refresh)
}

export function clearTokens() {
  _accessToken = null
  _refreshToken = null
  localStorage.removeItem('oc_rep_access_token')
  localStorage.removeItem('oc_rep_refresh_token')
}

export function getAccessToken() {
  return _accessToken
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`)
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const tenantId = import.meta.env.VITE_DEFAULT_TENANT_ID
  if (tenantId) headers['X-Tenant-Id'] = tenantId

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && _refreshToken) {
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    })
    if (refreshRes.ok) {
      const data = await refreshRes.json()
      setTokens(data.data.accessToken, data.data.refreshToken)
      headers['Authorization'] = `Bearer ${_accessToken}`
      const retried = await fetch(`${BASE_URL}${path}`, { ...options, headers })
      if (!retried.ok) throw new ApiError(retried.status, await retried.json())
      return retried.json()
    } else {
      clearTokens()
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body)
  }

  return res.json()
}

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ success: true; data: { accessToken: string; refreshToken: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  me: () => apiFetch<{ success: true; data: { sub: string; email: string; role: string } }>('/auth/me'),
}

export const goalSheetsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[] }>(`/goal-sheets${qs}`)
  },
  acknowledge: (id: string) =>
    apiFetch<{ success: true; data: unknown }>(`/goal-sheets/${id}/acknowledge`, { method: 'POST' }),
}

export const statementsApi = {
  get: (participantId: string, periodId: string) =>
    apiFetch<{ success: true; data: unknown }>(`/statements/${participantId}/${periodId}`),
}

export const disputesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[] }>(`/disputes${qs}`)
  },
  open: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/disputes', { method: 'POST', body: JSON.stringify(body) }),
}
