import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const routes: RouteRecordRaw[] = [
  // ---- 公开页（不要求登录） ----
  {
    path: '/setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { layout: 'blank', title: '初始化' },
  },
  {
    path: '/login',
    component: () => import('@/views/LoginView.vue'),
    meta: { layout: 'blank', title: '登录', public: true },
  },
  {
    path: '/register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { layout: 'blank', title: '注册' },
  },
  {
    path: '/join/:token',
    component: () => import('@/views/JoinView.vue'),
    meta: { layout: 'blank', title: '加入账本' },
  },

  // ---- 兼容 SSR 旧路径（统一走 SPA） ----
  { path: '/logout', component: () => import('@/views/LogoutView.vue'), meta: { layout: 'blank', title: '退出' } },

  // ---- 受保护页 ----
  {
    path: '/',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '总览', icon: '🏠' },
  },
  {
    path: '/transactions',
    component: () => import('@/views/TransactionsView.vue'),
    meta: { title: '账单明细', icon: '📋' },
  },
  {
    path: '/transactions/new',
    component: () => import('@/views/TxnFormView.vue'),
    meta: { title: '记一笔', icon: '➕', mode: 'create' },
  },
  {
    path: '/transactions/:id(\\d+)/edit',
    component: () => import('@/views/TxnFormView.vue'),
    meta: { title: '编辑记录', icon: '✏️', mode: 'edit' },
  },
  {
    path: '/transactions/:id(\\d+)',
    component: () => import('@/views/TxnDetailView.vue'),
    meta: { title: '记录详情', icon: '📄' },
  },
  { path: '/calendar',       component: () => import('@/views/CalendarView.vue'),       meta: { title: '记账日历', icon: '📅' } },
  { path: '/search',         component: () => import('@/views/SearchView.vue'),         meta: { title: '搜索筛选', icon: '🔍' } },
  { path: '/reports',        component: () => import('@/views/ReportsView.vue'),        meta: { title: '报表分析', icon: '📊' } },
  { path: '/reports/:tab',   component: () => import('@/views/ReportsView.vue'),        meta: { title: '报表分析', icon: '📊' } },

  { path: '/accounts',       component: () => import('@/views/AccountsView.vue'),       meta: { title: '账户管理', icon: '🏦' } },
  { path: '/accounts/:id(\\d+)', component: () => import('@/views/AccountDetailView.vue'), meta: { title: '账户详情', icon: '🏦' } },
  { path: '/budgets',        component: () => import('@/views/BudgetsView.vue'),        meta: { title: '预算管理', icon: '💰' } },
  { path: '/recurring',      component: () => import('@/views/RecurringView.vue'),      meta: { title: '周期账单', icon: '🔁' } },
  { path: '/subscriptions',  component: () => import('@/views/SubscriptionsView.vue'),  meta: { title: '订阅扣费', icon: '🔔' } },
  // 通知中心「订阅未能自动记账」的跳转目标（老版是独立编辑页，新版是抽屉）
  { path: '/subscriptions/:id(\\d+)/edit', component: () => import('@/views/SubscriptionsView.vue'), meta: { title: '编辑订阅', icon: '🔔' } },
  { path: '/debts',          component: () => import('@/views/DebtsView.vue'),          meta: { title: '借贷台账', icon: '🤝' } },
  { path: '/goals',          component: () => import('@/views/GoalsView.vue'),          meta: { title: '储蓄目标', icon: '🎯' } },

  { path: '/categories',     component: () => import('@/views/CategoriesView.vue'),     meta: { title: '分类管理', icon: '🗂️' } },
  { path: '/tags',           component: () => import('@/views/TagsView.vue'),           meta: { title: '标签管理', icon: '🏷️' } },
  { path: '/import',         component: () => import('@/views/ImportView.vue'),         meta: { title: '账单导入', icon: '📥' } },
  { path: '/export',         component: () => import('@/views/ExportView.vue'),         meta: { title: '导出备份', icon: '📤' } },

  { path: '/ledgers',        component: () => import('@/views/LedgersView.vue'),        meta: { title: '账本管理', icon: '📚' } },
  { path: '/members',        component: () => import('@/views/MembersView.vue'),        meta: { title: '成员权限', icon: '👥' } },
  { path: '/notifications',  component: () => import('@/views/NotificationsView.vue'),  meta: { title: '通知中心', icon: '🔔' } },
  { path: '/settings',       component: () => import('@/views/SettingsView.vue'),       meta: { title: '设置', icon: '⚙️' } },
  { path: '/settings/:tab',  component: () => import('@/views/SettingsView.vue'),       meta: { title: '设置', icon: '⚙️' } },
  { path: '/about',          component: () => import('@/views/AboutView.vue'),          meta: { title: '关于', icon: 'ℹ️' } },
  { path: '/ai',             component: () => import('@/views/AiView.vue'),             meta: { title: 'AI 截图记账', icon: '🤖' } },
  { path: '/attachments',    component: () => import('@/views/AttachmentsView.vue'),    meta: { title: '账单截图', icon: '🖼️' } },

  { path: '/:catch(.*)*',    component: () => import('@/views/NotFoundView.vue'),       meta: { title: '页面未找到' } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 } },
})

// 路由守卫：未登录跳 /login（公开页 / setup / 登录 / 注册 / 加入 / 404 不需要）
router.beforeEach(async (to, _from, next) => {
  const session = useSessionStore()
  // 第一次刷新页面 session 为空
  if (!session.loaded && !session.loading) {
    try { await session.refresh() } catch { /* ignore */ }
  }

  if (to.meta?.public) return next()
  if (to.path === '/setup') return next()
  if (!session.isAuthed) {
    return next({ path: '/login', query: { next: to.fullPath } })
  }
  next()
})

// 标题
router.afterEach((to) => {
  const t = to.meta?.title as string | undefined
  if (t) document.title = `${t} · 家账簿`
  else document.title = '家账簿'
})
