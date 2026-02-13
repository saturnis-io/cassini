import { type APIRequestContext } from '@playwright/test'

export const API_BASE = 'http://localhost:8000/api/v1'

/**
 * Get a JWT access token by logging in via the API.
 */
export async function getAuthToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin', remember_me: false },
  })
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  }
  const body = await res.json()
  return body.access_token
}

/**
 * Make an authenticated GET request to the backend API.
 */
export async function apiGet(
  request: APIRequestContext,
  endpoint: string,
  token: string,
) {
  const res = await request.get(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    throw new Error(`GET ${endpoint} failed: ${res.status()} ${await res.text()}`)
  }
  return res.json()
}

/**
 * Make an authenticated POST request to the backend API.
 */
export async function apiPost(
  request: APIRequestContext,
  endpoint: string,
  token: string,
  data?: object,
) {
  const res = await request.post(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: data ?? {},
  })
  if (!res.ok()) {
    throw new Error(`POST ${endpoint} failed: ${res.status()} ${await res.text()}`)
  }
  return res.json()
}

/**
 * Make an authenticated PATCH request to the backend API.
 */
export async function apiPatch(
  request: APIRequestContext,
  endpoint: string,
  token: string,
  data?: object,
) {
  const res = await request.patch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: data ?? {},
  })
  if (!res.ok()) {
    throw new Error(`PATCH ${endpoint} failed: ${res.status()} ${await res.text()}`)
  }
  return res.json()
}

/**
 * Make an authenticated PUT request to the backend API.
 */
export async function apiPut(
  request: APIRequestContext,
  endpoint: string,
  token: string,
  data?: object,
) {
  const res = await request.put(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: data ?? {},
  })
  if (!res.ok()) {
    throw new Error(`PUT ${endpoint} failed: ${res.status()} ${await res.text()}`)
  }
  return res.json()
}

/**
 * Make an authenticated DELETE request to the backend API.
 */
export async function apiDelete(
  request: APIRequestContext,
  endpoint: string,
  token: string,
) {
  const res = await request.delete(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    throw new Error(`DELETE ${endpoint} failed: ${res.status()} ${await res.text()}`)
  }
}
