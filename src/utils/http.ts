/**
 * HTTP client — dual transport layer.
 *
 * Platforms:
 *  - **微信小程序 (MP-WEIXIN)**: uses `wx.cloud.callContainer` via WeChat
 *    internal network — no domain/HTTPS/CORS required.
 *  - **H5 / others**: uses `uni.request` with `VITE_API_BASE` base URL.
 *
 * Both transports return the same `{ statusCode, data }` shape, so all
 * downstream logic (auth, error handling, retry) is shared.
 *
 * See EXPANSION_PLAN.md §7.2 and §4.2.
 */
import type { RefreshResponse } from '@/api/types'

/* ------------------------------------------------------------------
 * Base URL (H5 / non-cloud fallback)
 * ------------------------------------------------------------------ */

const DEV_API_BASE = 'http://localhost:3000/api'

function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE || DEV_API_BASE
}

/* ------------------------------------------------------------------
 * Cloud Run config (MP-WEIXIN only, injected at build time)
 * Set VITE_CLOUD_ENV + VITE_CLOUD_SERVICE in build command:
 *   VITE_CLOUD_ENV=prod-xxx VITE_CLOUD_SERVICE=holdem npm run build:mp-weixin
 * ------------------------------------------------------------------ */

const CLOUD_ENV: string | undefined = import.meta.env.VITE_CLOUD_ENV
const CLOUD_SERVICE: string | undefined = import.meta.env.VITE_CLOUD_SERVICE

/* ------------------------------------------------------------------
 * ApiError
 * ------------------------------------------------------------------ */

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
 * Unified transport — picks callContainer or uni.request per platform
 * ------------------------------------------------------------------ */

interface TransportOpts {
  path: string
  method: string
  data?: any
  header: Record<string, string>
  timeout?: number
}

interface TransportResult {
  statusCode: number
  data: any
}

function buildPath(path: string, query?: RequestOpts['query']): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!query) return p
  const parts: string[] = []
  for (const k of Object.keys(query)) {
    const v = query[k]
    if (v === undefined || v === null) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `${p}?${parts.join('&')}` : p
}

function doTransport(opts: TransportOpts): Promise<TransportResult> {
  // #ifdef MP-WEIXIN
  if (CLOUD_ENV && CLOUD_SERVICE) {
    return new Promise<TransportResult>((resolve, reject) => {
      const callOpts: any = {
        config: { env: CLOUD_ENV },
        path: `/api${opts.path}`,
        method: opts.method,
        header: {
          'X-WX-SERVICE': CLOUD_SERVICE,
          ...opts.header,
        },
        success: (res: any) => resolve({ statusCode: res.statusCode, data: res.data }),
        fail: (err: any) => reject(err),
      }
      // Only attach data for methods that have a request body
      if (opts.method !== 'GET' && opts.method !== 'DELETE' && opts.data !== undefined) {
        callOpts.data = opts.data
      }
      ;(wx as any).cloud.callContainer(callOpts)
    })
  }
  // #endif

  // H5 / fallback: standard uni.request with full URL
  const base = getBaseUrl().replace(/\/+$/, '')
  const url = base + opts.path
  return new Promise<TransportResult>((resolve, reject) => {
    uni.request({
      url,
      method: opts.method as any,
      data: opts.data,
      header: opts.header,
      timeout: opts.timeout ?? 15000,
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(err),
    })
  })
}

/* ------------------------------------------------------------------
 * Error extraction
 * ------------------------------------------------------------------ */

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
      const res = await doTransport({
        path: '/auth/refresh',
        method: 'POST',
        data: { refresh },
        header: { 'content-type': 'application/json' },
        timeout: 15000,
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
  const reqPath = buildPath(path, opts.query)
  const header: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  if (!opts.skipAuth && tokenBridge) {
    const access = tokenBridge.getAccess()
    if (access) header.authorization = `Bearer ${access}`
  }

  let res: TransportResult
  try {
    res = await doTransport({
      path: reqPath,
      method,
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
