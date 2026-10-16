/**
 * axios 实例 + CSRF / 401 拦截器
 * 鉴权沿用现有 cookie-based session；CSRF 通过 meta 注入
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useSessionStore } from '@/stores/session'

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 30_000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})

// CSRF：从 session store 拿（首屏后由 /api/v1/session 注入）
const csrf = () => {
  const s = useSessionStore()
  return s.csrf || (document.querySelector('meta[name="csrf"]') as HTMLMetaElement | null)?.content || ''
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const m = (config.method || 'get').toLowerCase()
  if (m !== 'get' && m !== 'head' && m !== 'options') {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>)['X-CSRF-Token'] = csrf()
  }
  return config
})

// 401：让 router 跳登录（这里用动态 import 避免循环依赖）
api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError<{ ok?: boolean; error?: string; redirect?: string; code?: string }>) => {
    const status = err?.response?.status
    const data = err?.response?.data
    if (status === 401 && data?.ok === false) {
      // 触发路由跳登录；保留当前路径为 next
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      // 用动态 import 调用 router
      import('@/router').then(({ router }) => {
        const redirect = data.redirect || '/login'
        if (router.currentRoute.value.path !== '/login') {
          router.replace(`${redirect}${redirect.includes('?') ? '&' : '?'}next=${next}`)
        }
      })
    } else if (!status && !err.message.includes('canceled')) {
      // 网络/超时错误：通知用户
      const { useFlash } = await import('@/composables/useFlash')
      useFlash().error(err.code === 'ECONNABORTED' ? '请求超时，请重试' : '网络错误，请检查连接')
    } else if (status === 403 && data?.code === 'CSRF_INVALID') {
      const { useSessionStore } = await import('@/stores/session')
      const { useFlash } = await import('@/composables/useFlash')
      const s = useSessionStore()
      s.csrf = ''
      useFlash().error('会话已过期，请刷新页面')
    }
    return Promise.reject(err)
  }
)

/** 从 axios 错误中提取人类可读的错误信息 */
export function errorMessage(e: unknown, fallback = '操作失败'): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string; message?: string } | undefined
    return data?.error || data?.message || e.message || fallback
  }
  if (e instanceof Error) return e.message || fallback
  return fallback
}
