/**
 * 会话状态：用户、主题、账本上下文、AI 状态
 * 启动时调 /api/v1/session 拉取，401 自动由 axios 拦截器跳登录
 */
import { defineStore } from 'pinia'

export interface SessionUser {
  id: number
  username: string
  displayName: string
  email?: string | null
  avatarColor?: string
  avatarUrl?: string
  avatarVer?: number | null
  isAdmin: boolean
  theme: 'light' | 'dark'
}

export interface Ledger {
  id: number
  name: string
  icon: string
  kind: 'personal' | 'family' | 'business' | 'travel' | 'project'
  role: 'owner' | 'admin' | 'member' | 'viewer'
  isArchived: boolean
}

interface SessionState {
  loaded: boolean
  loading: boolean
  user: SessionUser | null
  ledgers: Ledger[]
  currentLedger: Ledger | null
  csrf: string
  aiUsable: boolean
  needsSetup: boolean
  siteName: string
  baseCurrency: string
  // 通知中心未读数（侧栏徽标，老版 layout.ejs 行为）
  unreadCount: number
  // 当前主题（独立于 user.theme；切换立刻生效 + 写回 server）
  theme: 'light' | 'dark'
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    loaded: false,
    loading: false,
    user: null,
    ledgers: [],
    currentLedger: null,
    csrf: '',
    aiUsable: false,
    needsSetup: false,
    siteName: '家账簿',
    baseCurrency: 'CNY',
    unreadCount: 0,
    theme: (localStorage.getItem('hl.theme') as 'light' | 'dark') || 'light',
  }),
  getters: {
    isAuthed: (s) => !!s.user,
    canWrite: (s) =>
      !!s.currentLedger && !s.currentLedger.isArchived &&
      ['owner', 'admin', 'member'].includes(s.currentLedger.role),
    canManage: (s) =>
      !!s.currentLedger && !s.currentLedger.isArchived &&
      ['owner', 'admin'].includes(s.currentLedger.role),
  },
  actions: {
    setTheme(theme: 'light' | 'dark') {
      this.theme = theme
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('hl.theme', theme)
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark')
    },
    /** 通知已读后同步侧栏徽标 */
    setUnread(n: number) {
      this.unreadCount = Math.max(0, Number(n) || 0)
    },
    /** 从 /api/v1/session 拉一次；401 由拦截器处理 */
    async refresh() {
      this.loading = true
      try {
        const { api } = await import('@/api/client')
        const { data } = await api.get<{
          ok: boolean
          data: {
            user: SessionUser | null
            ledger: Ledger | null
            ledgers: Ledger[]
            csrf: string
            aiUsable: boolean
            needsSetup: boolean
            siteName: string
            baseCurrency: string
            unreadCount?: number
          }
        }>('/session')
        const d = data.data
        this.user = d.user
        this.ledgers = d.ledgers || []
        this.currentLedger = d.ledger
        this.csrf = d.csrf
        this.aiUsable = d.aiUsable
        this.needsSetup = d.needsSetup
        this.siteName = d.siteName || '家账簿'
        this.baseCurrency = d.baseCurrency || 'CNY'
        this.unreadCount = Number(d.unreadCount || 0)
        if (d.user?.theme) this.setTheme(d.user.theme)
        else this.setTheme(this.theme)
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    async switchLedger(ledgerId: number) {
      // 同 logout：必须 urlencoded，FormData 走 multipart 后端解析不到 ledger_id
      const fd = new URLSearchParams()
      fd.append('ledger_id', String(ledgerId))
      fd.append('back', window.location.pathname + window.location.search)
      const csrf = this.csrf
      // 复用原 SSR 端点（POST 一次，session 切账本）
      const res = await fetch('/ledgers/switch', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
      })
      if (res.ok || res.redirected) {
        await this.refresh()
      }
    },
    async logout() {
      try {
        // 必须用 application/x-www-form-urlencoded：FormData 走 multipart，
        // 后端 express.urlencoded 不会解析 multipart，CSRF 校验就拿不到 _csrf
        const fd = new URLSearchParams()
        fd.append('_csrf', this.csrf)
        await fetch('/logout', {
          method: 'POST',
          body: fd,
          credentials: 'include',
          redirect: 'follow',
        })
      } catch { /* ignore */ }
      this.user = null
      this.currentLedger = null
      this.ledgers = []
      this.csrf = ''
    },
  },
})
