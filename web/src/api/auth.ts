/**
 * 鉴权相关 API —— 直接调 SSR 端点（不走 /api/v1）
 * 因为 /api/v1 走的是同源 cookie session，但 CSRF 在我们的 axios 拦截器中
 * 是从 session store 拿的（首次未拉到时为空）。登录前 session 为空，
 * 走 SSR 端点并带 meta csrf token。
 */
import { api } from './client'

function getMetaCsrf(): string {
  return (document.querySelector('meta[name="csrf"]') as HTMLMetaElement | null)?.content || ''
}

interface LoginResult { ok: boolean; error?: string; redirect?: string }

/**
 * 登录：POST /login，302 重定向视为成功
 */
export async function login(username: string, password: string, next = '/'): Promise<LoginResult> {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)
  body.set('next', next)
  body.set('_csrf', getMetaCsrf())
  try {
    const res = await api.post('/login', body, {
      baseURL: '/',                  // 直接走 /login
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    })
    if (res.status === 302 || res.status === 200) {
      // 登录成功：从后端带过来的 Set-Cookie + session 已就绪
      // 重新拉一次 session store
      return { ok: true }
    }
    return { ok: false, error: res.data?.error || '登录失败' }
  } catch (e: any) {
    // 401 / 429 由后端返 HTML，提取错误信息（粗略）
    const msg = e?.response?.data?.error || e?.message || '登录失败'
    return { ok: false, error: msg }
  }
}

/**
 * 注册（仅在 allow_register=true 时可用）
 */
export async function register(payload: {
  username: string
  password: string
  display_name: string
  email?: string
  invite_code?: string
}): Promise<LoginResult> {
  const body = new URLSearchParams()
  body.set('username', payload.username)
  body.set('password', payload.password)
  body.set('display_name', payload.display_name)
  if (payload.email) body.set('email', payload.email)
  if (payload.invite_code) body.set('invite_code', payload.invite_code)
  body.set('_csrf', getMetaCsrf())
  try {
    await api.post('/register', body, {
      baseURL: '/',
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.error || e?.message || '注册失败' }
  }
}

/**
 * 通过邀请码加入账本
 */
export async function joinLedger(token: string, displayName?: string, password?: string): Promise<LoginResult> {
  const body = new URLSearchParams()
  if (displayName) body.set('display_name', displayName)
  if (password) body.set('password', password)
  body.set('_csrf', getMetaCsrf())
  try {
    await api.post(`/join/${encodeURIComponent(token)}`, body, {
      baseURL: '/',
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.error || e?.message || '加入失败' }
  }
}
