/**
 * HTTP client wrapping uni.request.
 * See EXPANSION_PLAN.md §7.2 and §4.2.
 *
 * Behaviour:
 *  - reads Bearer access token from authStore
 *  - base URL from import.meta.env.VITE_API_BASE (fallback to DEV_API_BASE)
 *  - on 401 + code=TOKEN_EXPIRED: single-flight refresh, retry original once
 *  - on 401 + code=MUST_CHANGE_PASSWORD: reLaunch to change-password page
 *  - on other 401 / REFRESH_INVALID / REFRESH_REVOKED: logout + reLaunch to login
 *  - non-2xx throws ApiError (with server-provided code/message)
 */
import type { RefreshResponse } from '@/api/types'

const DEV_API_BASE = 'http://localhost:3000/api'

function getBaseUrl(): string {
  // Vite injects import.meta.env.* at build time; fallback for safety.
  // @ts-ignore
  const viteBase = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE : undefined
  return (viteBase as string | undefined) || DEV_API_BASE
}

export class ApiError extends Error {
  code: string
  status: number
  errorId?: string
  constructor(code: string, message: string, status: number, errorId?: string) {
    super(message)
    this.code = code
    this.status = status
    this.errorId = errorId
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface RequestOpts {
  method?: Method
  data?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  skipAuth?: boolean
  /** Skip the auto 401 → refresh → retry → redirect flow. For login/refresh themselves. */
  skipAuthHandling?: boolean
}

/* ------------------------------------------------------------------
 * Token accessor hooks installed by authStore at startup (avoids
 * importing the store here and creating a circular dep at module load).
 * ------------------------------------------------------------------ */

interface TokenBridge {
  getAccess(): string | null
  getRefresh(): string | null
  setTokens(access: string, refresh: string): void
  onAuthFailure(reason: 'expired' | 'must-change-pwd' | 'invalid'): Promise<void>
}

let tokenBridge: TokenBridge | null = null
export function installTokenBridge(bridge: TokenBridge) {
  tokenBridge = bridge
}

/* ------------------------------------------------------------------
 * Core request implementation
 * ------------------------------------------------------------------ */

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const base = getBaseUrl().replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  if (!query) return base + p
  const parts: string[] = []
  for (const k of Object.keys(query)) {
    const v = query[k]
    if (v === undefined || v === null) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `${base}${p}?${parts.join('&')}` : base + p
}

function uniRequestPromise(opts: UniApp.RequestOptions): Promise<UniApp.RequestSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...opts,
      success: (res) => resolve(res as UniApp.RequestSuccessCallbackResult),
      fail: (err) => reject(err),
    })
  })
}

function extractError(resBody: any, status: number): ApiError {
  const err = resBody && typeof resBody === 'object' ? resBody.error : null
  if (err && typeof err === 'object') {
    return new ApiError(
      err.code ?? 'ERROR',
      err.message ?? '请求失败',
      status,
      err.errorId,
    )
  }
  return new ApiError('ERROR', `HTTP ${status}`, status)
}

/* ------------------------------------------------------------------
 * Single-flight refresh — prevents thundering herd when many requests
 * 401 at once.
 * ------------------------------------------------------------------ */

let refreshInFlight: Promise<boolean> | null = null

async function attemptRefresh(): Promise<boolean> {
  if (!tokenBridge) return false
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const refresh = tokenBridge!.getRefresh()
      if (!refresh) return false
      const url = buildUrl('/auth/refresh')
      const res = await uniRequestPromise({
        url,
        method: 'POST',
        data: { refresh },
        header: { 'content-type': 'application/json' },
      })
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const body = res.data as RefreshResponse
        tokenBridge!.setTokens(body.access, body.refresh)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      // release the lock on next microtask so concurrent awaiters see the result
      setTimeout(() => {
        refreshInFlight = null
      }, 0)
    }
  })()
  return refreshInFlight
}

/* ------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------ */

export async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const url = buildUrl(path, opts.query)
  const header: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  if (!opts.skipAuth && tokenBridge) {
    const access = tokenBridge.getAccess()
    if (access) header.authorization = `Bearer ${access}`
  }

  let res: UniApp.RequestSuccessCallbackResult
  try {
    res = await uniRequestPromise({
      url,
      method: method as any,
      data: opts.data as any,
      header,
      timeout: 15000,
    })
  } catch (err: any) {
    // network-level failure
    uni.showToast({ title: '网络连接失败，请重试', icon: 'none', duration: 2000 })
    throw new ApiError('NETWORK', err?.errMsg ?? 'network error', 0)
  }

  const status = res.statusCode

  if (status >= 200 && status < 300) {
    return (res.data ?? undefined) as T
  }

  const apiErr = extractError(res.data, status)

  if (!opts.skipAuthHandling && status === 401 && tokenBridge) {
    if (apiErr.code === 'TOKEN_EXPIRED') {
      const ok = await attemptRefresh()
      if (ok) {
        // retry once, preventing loops
        return request<T>(path, { ...opts, skipAuthHandling: true })
      }
      await tokenBridge.onAuthFailure('expired')
      throw apiErr
    }
    // REFRESH_REVOKED / TOKEN_INVALID / UNAUTHENTICATED -> fail hard
    await tokenBridge.onAuthFailure('invalid')
    throw apiErr
  }

  if (status === 409 && apiErr.code === 'MUST_CHANGE_PASSWORD' && tokenBridge) {
    await tokenBridge.onAuthFailure('must-change-pwd')
    throw apiErr
  }

  if (status >= 500) {
    uni.showToast({
      title: apiErr.errorId ? `服务器错误 [${apiErr.errorId.slice(0, 6)}]` : '服务器错误',
      icon: 'none',
      duration: 2000,
    })
  }

  throw apiErr
}

export const api = {
  get: <T = unknown>(p: string, query?: RequestOpts['query']) =>
    request<T>(p, { method: 'GET', query }),
  post: <T = unknown>(p: string, data?: unknown) => request<T>(p, { method: 'POST', data }),
  patch: <T = unknown>(p: string, data?: unknown) => request<T>(p, { method: 'PATCH', data }),
  del: <T = unknown>(p: string) => request<T>(p, { method: 'DELETE' }),
}
