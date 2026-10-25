import { API_BASE_URL } from '@shared/config/env'
import { HTTP_TIMEOUT_MS } from '@shared/config/constants'
import type { ApiEnvelope } from '@shared/types/api'
import { getAuthBridge } from './auth-bridge'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface HttpQuery {
  [key: string]: string | number | boolean | undefined | null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: HttpQuery
}

function buildUrl(path: string, query?: HttpQuery): string {
  if (!query) return API_BASE_URL + path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs.length > 0 ? `${API_BASE_URL}${path}?${qs}` : API_BASE_URL + path
}

async function parseErrorBody(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { message?: string; msg?: string }
    return payload.msg ?? payload.message ?? null
  } catch {
    return null
  }
}

let refreshInFlight: Promise<void> | null = null

async function refreshTokensOnce(): Promise<void> {
  const bridge = getAuthBridge()
  const refreshToken = bridge?.getRefreshToken()
  if (!refreshToken) throw new ApiError('未登录', 401)

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  })
  if (!response.ok) {
    bridge?.onAuthLost()
    throw new ApiError('登录已过期', 401)
  }
  const envelope = (await response.json()) as ApiEnvelope<{ accessToken: string; refreshToken: string }>
  if (!envelope.data?.accessToken) {
    bridge?.onAuthLost()
    throw new ApiError('登录已过期', 401)
  }
  bridge?.updateTokens(envelope.data)
}

async function ensureFreshToken(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokensOnce().finally(() => {
      refreshInFlight = null
    })
  }
  await refreshInFlight
}

/** 主动刷新 accessToken ( 供 WS 重连前使用 ); 失败会触发 onAuthLost */
export function refreshAccessToken(): Promise<void> {
  return ensureFreshToken()
}

/**
 * 统一 HTTP 请求入口:
 * - 自动附带 x-access-token;
 * - 401 时单飞刷新 token 并重试一次, 刷新失败引导回登录页;
 * - 归一化响应信封与错误。
 */
export async function httpRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const bridge = getAuthBridge()
  const token = bridge?.getAccessToken() ?? null
  const url = buildUrl(path, options.query)

  const doFetch = async (accessToken: string | null): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (accessToken) headers['x-access-token'] = `Bearer ${accessToken}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    return fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    })
  }

  let response = await doFetch(token)
  const isAuthPath = path.startsWith('/api/v1/auth/')

  if (response.status === 401 && token && !isAuthPath) {
    await ensureFreshToken()
    response = await doFetch(getAuthBridge()?.getAccessToken() ?? null)
  }

  if (response.status === 401) {
    if (!isAuthPath) bridge?.onAuthLost()
    throw new ApiError('登录已过期', 401)
  }

  if (response.status === 500) {
    const message = (await parseErrorBody(response)) ?? '服务端错误'
    throw new ApiError(message, 500)
  }

  if (!response.ok) {
    const message = (await parseErrorBody(response)) ?? `请求失败 (${response.status})`
    throw new ApiError(message, response.status)
  }

  const envelope = (await response.json()) as ApiEnvelope<T>
  if (envelope.code !== 200) {
    throw new ApiError(envelope.message || '请求失败', envelope.code)
  }
  return envelope.data
}
