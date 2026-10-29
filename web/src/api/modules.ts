/**
 * 业务模块 API 封装 —— 组件不直接拼 URL
 * 每个方法返回解包后的 data 字段（已通过 { ok, data } 解包）
 */
import { api } from './client'

// --- 通用 ---
export const SessionApi = {
  session: () => api.get('/session').then((r) => r.data.data),
  ping: () => api.get('/ping').then((r) => r.data.data),
}

// --- Dashboard ---
export const DashboardApi = {
  overview: (month?: string) =>
    api.get('/dashboard', { params: month ? { month } : {} }).then((r) => r.data.data),
  calendar: (month?: string, date?: string) =>
    api.get('/dashboard/calendar', { params: { ...(month ? { month } : {}), ...(date ? { date } : {}) } }).then((r) => r.data.data),
  search: (q: Record<string, unknown>) =>
    api.get('/dashboard/search', { params: q }).then((r) => r.data.data),
  notifications: () => api.get('/dashboard/notifications').then((r) => r.data.data),
  readAllNotifications: () => api.post('/dashboard/notifications/read-all').then((r) => r.data.data),
  readNotification: (id: number) =>
    api.post(`/dashboard/notifications/${id}/read`).then((r) => r.data.data),
}

// --- Transactions ---
export const TransactionsApi = {
  list: (q: Record<string, unknown> = {}) =>
    api.get('/transactions', { params: q }).then((r) => r.data.data),
  get: (id: number) => api.get(`/transactions/${id}`).then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/transactions', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/transactions/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  patch: (id: number, payload: Record<string, unknown>) =>
    api.patch(`/transactions/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`).then((r) => r.data),
  bulk: (payload: Record<string, unknown>) =>
    api.post('/transactions/bulk', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  formData: () => api.get('/transactions/-form-data').then((r) => r.data.data),
}

// --- Accounts ---
export const AccountsApi = {
  list: () => api.get('/accounts').then((r) => r.data.data),
  get: (id: number) => api.get(`/accounts/${id}`).then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/accounts', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/accounts/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`).then((r) => r.data),
  archive: (id: number) =>
    api.post(`/accounts/${id}/archive`, {}, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  adjust: (id: number, actual_balance: number, adjust_date?: string, note?: string) =>
    api.post(`/accounts/${id}/adjust`,
      { actual_balance, adjust_date, note },
      { headers: { 'Content-Type': 'application/json' } }
    ).then((r) => r.data),
}

// --- Categories ---
export const CategoriesApi = {
  list: () => api.get('/categories').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/categories', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/categories/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`).then((r) => r.data),
}

// --- Tags ---
export const TagsApi = {
  list: () => api.get('/tags').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/tags', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/tags/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/tags/${id}`).then((r) => r.data),
}

// --- Budgets ---
export const BudgetsApi = {
  list: () => api.get('/budgets').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/budgets', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/budgets/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  toggle: (id: number) => api.post(`/budgets/${id}/toggle`).then((r) => r.data),
  remove: (id: number) => api.delete(`/budgets/${id}`).then((r) => r.data),
}

// --- Recurring ---
export const RecurringApi = {
  list: () => api.get('/recurring').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/recurring', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/recurring/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  toggle: (id: number) => api.post(`/recurring/${id}/toggle`).then((r) => r.data),
  run: (id: number, post_date?: string) =>
    api.post(`/recurring/${id}/run`, { post_date }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/recurring/${id}`).then((r) => r.data),
}

// --- Debts ---
export const DebtsApi = {
  list: () => api.get('/debts').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/debts', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/debts/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  settle: (id: number, payload: Record<string, unknown> = {}) =>
    api.post(`/debts/${id}/settle`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/debts/${id}`).then((r) => r.data),
}

// --- Goals ---
export const GoalsApi = {
  list: () => api.get('/goals').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/goals', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/goals/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  deposit: (id: number, payload: Record<string, unknown>) =>
    api.post(`/goals/${id}/deposit`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  remove: (id: number) => api.delete(`/goals/${id}`).then((r) => r.data),
}

// --- Subscriptions ---
export const SubscriptionsApi = {
  list: () => api.get('/subscriptions').then((r) => r.data.data),
  get: (id: number) => api.get(`/subscriptions/${id}`).then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    api.post('/subscriptions', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.put(`/subscriptions/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  charge: (id: number, date?: string) =>
    api.post(`/subscriptions/${id}/charge`, { date }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  skip: (id: number) => api.post(`/subscriptions/${id}/skip`).then((r) => r.data),
  toggle: (id: number) => api.post(`/subscriptions/${id}/toggle`).then((r) => r.data),
  cancel: (id: number) => api.post(`/subscriptions/${id}/cancel`).then((r) => r.data),
  remove: (id: number) => api.delete(`/subscriptions/${id}`).then((r) => r.data),
}

// --- Reports ---
export const ReportsApi = {
  overview: (q: Record<string, unknown> = {}) =>
    api.get('/reports', { params: q }).then((r) => r.data.data),
}

// --- AI ---
// 注：后端统一响应体为 { ok, data }，业务数据在 data 里 —— 读接口一律取 r.data.data
export const AiApi = {
  config: () => api.get('/ai/config').then((r) => r.data.data),
  scan: (payload: { text?: string; images?: Array<{ name?: string; dataUrl: string }> }) =>
    api.post('/ai/scan', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data.data),
  text: (text: string) =>
    api.post('/ai/text', { text }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data.data),
  chat: (payload: { text?: string; images?: Array<{ name?: string; dataUrl: string }> }) =>
    api.post('/ai/chat', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data.data),
  confirm: (items: unknown[], image_ids: number[] = [], source = 'ai_screenshot') =>
    api.post('/ai/confirm', { items, image_ids, source }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data.data),
  attachments: (page = 1) =>
    api.get('/ai/attachments', { params: { page } }).then((r) => r.data.data),
  removeAttachment: (id: number) => api.delete(`/ai/attachments/${id}`).then((r) => r.data.data),
}

// --- Admin: settings, ledgers, members, import, backup ---
export const AdminApi = {
  settings: () => api.get('/admin/settings').then((r) => r.data.data),
  updateProfile: (payload: Record<string, unknown>) =>
    api.patch('/admin/settings/profile', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  changePassword: (old_password: string, new_password: string, new_password2: string) =>
    api.post('/admin/settings/password', { old_password, new_password, new_password2 },
      { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  setTheme: (mode: 'light' | 'dark') =>
    api.put('/admin/settings/theme', { mode }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  updateAi: (payload: Record<string, unknown>) =>
    api.put('/admin/settings/ai', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  testAi: (payload: Record<string, unknown> = {}) =>
    api.post('/admin/settings/ai/test', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  listAiModels: (payload: Record<string, unknown> = {}) =>
    api.post('/admin/settings/ai/models', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  updateSite: (payload: Record<string, unknown>) =>
    api.put('/admin/settings/site', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  uploadAvatar: (dataUrl: string) =>
    api.post('/admin/settings/avatar', { dataUrl }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  clearAvatar: () => api.post('/admin/settings/avatar/clear').then((r) => r.data),
  // ledgers
  ledgers: () => api.get('/admin/ledgers').then((r) => r.data.data),
  createLedger: (payload: Record<string, unknown>) =>
    api.post('/admin/ledgers', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  updateLedger: (id: number, payload: Record<string, unknown>) =>
    api.put(`/admin/ledgers/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  archiveLedger: (id: number) =>
    api.post(`/admin/ledgers/${id}/archive`).then((r) => r.data),
  deleteLedger: (id: number, confirm: string) =>
    api.delete(`/admin/ledgers/${id}`, { data: { confirm }, headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  // members
  members: () => api.get('/admin/members').then((r) => r.data.data),
  inviteMember: (payload: { role: string; days: number }) =>
    api.post('/admin/members/invite', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  updateMember: (id: number, payload: Record<string, unknown>) =>
    api.patch(`/admin/members/${id}`, payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  removeMember: (id: number) => api.delete(`/admin/members/${id}`).then((r) => r.data),
  revokeInvite: (id: number) => api.delete(`/admin/members/invites/${id}`).then((r) => r.data),
  // import
  importJobs: () => api.get('/admin/import/jobs').then((r) => r.data.data),
  importPreview: (dataUrl: string, fileName: string) =>
    api.post('/admin/import/preview', { dataUrl, fileName }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  importCommit: (payload: Record<string, unknown>) =>
    api.post('/admin/import/commit', payload, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  exportYears: () => api.get('/admin/export/years').then((r) => r.data.data),
  // backup
  backup: () => api.post('/admin/backup/db').then((r) => r.data),
  backupDownloadUrl: () => '/api/v1/admin/backup/db?download=1',
  restore: (dataUrl: string) =>
    api.post('/admin/backup/restore', { dataUrl }, { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  // admin user mgmt
  userAction: (id: number, action: string, payload: Record<string, unknown> = {}) =>
    api.post(`/admin/admin/users/${id}/action`, { action, ...payload },
      { headers: { 'Content-Type': 'application/json' } }).then((r) => r.data),
  runScheduler: () => api.post('/admin/admin/run-scheduler').then((r) => r.data),
}
