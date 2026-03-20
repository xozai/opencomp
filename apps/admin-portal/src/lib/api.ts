/**
 * Typed API client for the OpenComp REST API.
 * Uses fetch with automatic auth token injection.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

// ─── Auth token storage ───────────────────────────────────────────────────────

let _accessToken: string | null = localStorage.getItem('oc_access_token')
let _refreshToken: string | null = localStorage.getItem('oc_refresh_token')

export function setTokens(access: string, refresh: string) {
  _accessToken = access
  _refreshToken = refresh
  localStorage.setItem('oc_access_token', access)
  localStorage.setItem('oc_refresh_token', refresh)
}

export function clearTokens() {
  _accessToken = null
  _refreshToken = null
  localStorage.removeItem('oc_access_token')
  localStorage.removeItem('oc_refresh_token')
}

export function getAccessToken() {
  return _accessToken
}

// ─── Base fetch ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  const tenantId = import.meta.env.VITE_DEFAULT_TENANT_ID
  if (tenantId) headers['X-Tenant-Id'] = tenantId

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && _refreshToken) {
    // Attempt token refresh
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    })
    if (refreshRes.ok) {
      const data = await refreshRes.json()
      setTokens(data.data.accessToken, data.data.refreshToken)
      // Retry original request
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

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`)
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ success: true; data: { accessToken: string; refreshToken: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  me: () => apiFetch<{ success: true; data: { sub: string; email: string; role: string } }>('/auth/me'),
}

// ─── Participants ─────────────────────────────────────────────────────────────

export const participantsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[]; total: number }>(`/participants${qs}`)
  },
  get: (id: string) => apiFetch<{ success: true; data: unknown }>(`/participants/${id}`),
  create: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/participants', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: unknown) =>
    apiFetch<{ success: true; data: unknown }>(`/participants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  terminate: (id: string, terminationDate: string) =>
    apiFetch<{ success: true; data: unknown }>(`/participants/${id}/terminate`, {
      method: 'POST', body: JSON.stringify({ terminationDate }),
    }),
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export const plansApi = {
  list: () => apiFetch<{ success: true; data: unknown[] }>('/plans'),
  get: (id: string) => apiFetch<{ success: true; data: unknown }>(`/plans/${id}`),
  create: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/plans', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: unknown) =>
    apiFetch<{ success: true; data: unknown }>(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  submit: (id: string) =>
    apiFetch<{ success: true; data: unknown }>(`/plans/${id}/submit`, { method: 'POST' }),
  publish: (id: string) =>
    apiFetch<{ success: true; data: unknown }>(`/plans/${id}/publish`, { method: 'POST' }),
}

// ─── Goal Sheets ──────────────────────────────────────────────────────────────

export const goalSheetsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[] }>(`/goal-sheets${qs}`)
  },
  generate: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/goal-sheets/generate', { method: 'POST', body: JSON.stringify(body) }),
  distribute: (goalSheetIds: string[]) =>
    apiFetch<{ success: true; data: unknown[] }>('/goal-sheets/distribute', {
      method: 'POST', body: JSON.stringify({ goalSheetIds }),
    }),
}

// ─── Calculation runs ─────────────────────────────────────────────────────────

export const calculationsApi = {
  listRuns: (periodId?: string) => {
    const qs = periodId ? `?periodId=${periodId}` : ''
    return apiFetch<{ success: true; data: unknown[] }>(`/calculation-runs${qs}`)
  },
  startRun: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/calculation-runs', { method: 'POST', body: JSON.stringify(body) }),
  getPayouts: (runId: string) =>
    apiFetch<{ success: true; data: unknown[] }>(`/calculation-runs/${runId}/payouts`),
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export const disputesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[]; total: number }>(`/disputes${qs}`)
  },
  get: (id: string) => apiFetch<{ success: true; data: unknown }>(`/disputes/${id}`),
  resolve: (id: string, body: unknown) =>
    apiFetch<{ success: true; data: unknown }>(`/disputes/${id}/resolve`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  assign: (id: string, assignedToId: string) =>
    apiFetch<{ success: true; data: unknown }>(`/disputes/${id}/assign`, {
      method: 'PATCH', body: JSON.stringify({ assignedToId }),
    }),
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export const approvalsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[]; total: number }>(`/approvals${qs}`)
  },
  decide: (id: string, body: unknown) =>
    apiFetch<{ success: true; data: unknown }>(`/approvals/${id}/decide`, {
      method: 'POST', body: JSON.stringify(body),
    }),
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

export const adjustmentsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch<{ success: true; data: unknown[] }>(`/adjustments${qs}`)
  },
  get: (id: string) => apiFetch<{ success: true; data: unknown }>(`/adjustments/${id}`),
  create: (body: unknown) =>
    apiFetch<{ success: true; data: unknown }>('/adjustments', { method: 'POST', body: JSON.stringify(body) }),
}
