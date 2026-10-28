/**
 * 裸 fetch 辅助函数（统一 CSRF 处理）
 *
 * axios 实例（api/client.ts）已自带 CSRF 拦截器，但以下两类请求必须走裸 fetch：
 * 1. SSR 端点（/login、/logout、/ledgers/switch 等，不在 /api/v1 下）
 * 2. 需要自定义 Accept / 读取原始响应体的场景
 *
 * 这里统一收敛，避免各处手写 headers 漏掉 token。
 */
import { useSessionStore } from '@/stores/session'

/** 从 session store 取 CSRF token，兜底读 meta 标签 */
export function csrfToken(): string {
  const s = useSessionStore()
  return s.csrf || (document.querySelector('meta[name="csrf"]') as HTMLMetaElement | null)?.content || ''
}

export interface CsrfFetchOptions extends Omit<RequestInit, 'headers'> {
  /** 额外请求头 */
  headers?: Record<string, string>
  /** 跳过 CSRF token（仅限 GET/HEAD 等幂等请求） */
  skipCsrf?: boolean
}

/**
 * 带 CSRF token 的 fetch。
 * - 非幂等方法自动带 X-CSRF-Token
 * - 401 时跳登录（与 axios 拦截器同口径）
 */
export async function csrfFetch(url: string, opts: CsrfFetchOptions = {}): Promise<Response> {
  const { headers, skipCsrf, ...rest } = opts
  const method = (rest.method || 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

  const finalHeaders: Record<string, string> = { ...(headers || {}) }
  if (!skipCsrf && !idempotent) {
    const token = csrfToken()
    if (token) finalHeaders['X-CSRF-Token'] = token
  }

  const res = await fetch(url, { ...rest, headers: finalHeaders, credentials: 'include' })

  if (res.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search)
    import('@/router').then(({ router }) => {
      if (router.currentRoute.value.path !== '/login') {
        router.replace(`/login?next=${next}`)
      }
    })
  }
  return res
}
