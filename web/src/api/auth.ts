/**
 * 鉴权相关 API —— 直接调 SSR 端点（不走 /api/v1）
 * 登录前 session 未登录但仍会通过 GET /api/v1/session 拿到 csrf（store 持有），
 * 提交时带上；meta 标签仅作为兜底（SPA 静态 index.html 通常没有）。
 */
import { api } from './client'
import { useSessionStore } from '@/stores/session'

function getCsrf(): string {
  const fromStore = useSessionStore().csrf
  if (fromStore) return fromStore
  return (document.querySelector('meta[name="csrf"]') as HTMLMetaElement | null)?.content || ''
}

interface LoginResult { ok: boolean; error?: string; redirect?: string }

/**
 * 登录：POST /login
 *
 * 后端在 Accept: application/json 时直接返回 { ok: true, next } 或 { ok: false, error }；
 * 否则退回 SSR 行为（302 重定向 + flash）。两种都兼容。
 */
export async function login(username: string, password: string, next = '/', remember = true): Promise<LoginResult> {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)
  body.set('next', next)
  body.set('remember', remember ? '1' : '0')
  body.set('_csrf', getCsrf())
  try {
    const res = await api.post('/login', body, {
      baseURL: '/',                  // 直接走 /login
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    })
    // 后端 JSON 分支
    const j = res.data
    if (j && typeof j.ok === 'boolean') {
      return j.ok ? { ok: true, redirect: j.next } : { ok: false, error: j.error || '登录失败' }
    }
    // 兜底：SSR 重定向分支（后端未走 JSON 时）
    const loc = String(res.headers?.location || '')
    if (loc.startsWith('/login')) {
      return { ok: false, error: '用户名或密码不正确。' }
    }
    return { ok: true }
  } catch (e: any) {
    // 401（密码错）/ 429（尝试过多）由后端返 JSON { ok:false, error }
    const msg = e?.response?.data?.error || (e?.response?.status === 401 ? '用户名或密码不正确。' : e?.message) || '登录失败'
    return { ok: false, error: msg }
  }
}

/**
 * 注册（仅在 allow_register=true 时可用）
 *
 * 后端在 Accept: application/json 时直接返回 { ok: true } 或 { ok: false, error }；
 * 否则退回 SSR 行为（302 重定向 + flash）。两种都兼容。
 */
export async function register(payload: {
  username: string
  password: string
  display_name: string
  email?: string
}): Promise<LoginResult> {
  const body = new URLSearchParams()
  body.set('username', payload.username)
  body.set('password', payload.password)
  body.set('display_name', payload.display_name)
  if (payload.email) body.set('email', payload.email)
  body.set('_csrf', getCsrf())
  try {
    const res = await api.post('/register', body, {
      baseURL: '/',
      maxRedirects: 0,
      // 后端 JSON 分支失败时返 400/403/500，也要进成功路径由下面的 ok 字段统一处理
      validateStatus: (s) => s >= 200 && s < 500,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    })
    // 后端 JSON 分支
    const j = res.data
    if (j && typeof j.ok === 'boolean') {
      return j.ok ? { ok: true } : { ok: false, error: j.error || '注册失败' }
    }
    // 兜底：SSR 重定向分支
    if (res.status === 403) {
      return { ok: false, error: '本站未开放自助注册，请联系管理员邀请你加入账本。' }
    }
    return { ok: true }
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '注册失败'
    return { ok: false, error: msg }
  }
}

interface JoinResult extends LoginResult {
  alreadyMember?: boolean
  ledgerName?: string
  message?: string
}

/**
 * 通过邀请码加入账本：POST /join/:code
 *
 * 后端在 Accept: application/json 时直接返回
 * { ok: true, ledgerName, message } / { ok: true, alreadyMember: true, ... } / { ok: false, error }；
 * 否则退回 SSR 行为（302 重定向 + flash）。两种都兼容。
 * 老版表单只提交 _csrf（无 display_name/password 字段），后端也不读这两个参数。
 */
export async function joinLedger(code: string): Promise<JoinResult> {
  const body = new URLSearchParams()
  body.set('_csrf', getCsrf())
  try {
    const res = await api.post(`/join/${encodeURIComponent(code)}`, body, {
      baseURL: '/',
      maxRedirects: 0,
      // 后端 JSON 分支失败时返 404/410，也要进成功路径由下面的 ok 字段统一处理
      validateStatus: (s) => s >= 200 && s < 500,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    })
    // 后端 JSON 分支
    const j = res.data
    if (j && typeof j.ok === 'boolean') {
      return j.ok
        ? { ok: true, alreadyMember: !!j.alreadyMember, ledgerName: j.ledgerName, message: j.message }
        : { ok: false, error: j.error || '加入失败' }
    }
    // 兜底：SSR 重定向分支（后端未走 JSON 时）
    return { ok: true }
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '加入失败'
    return { ok: false, error: msg }
  }
}
