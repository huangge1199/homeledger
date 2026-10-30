/**
 * 通用格式化工具（对齐老版 src/lib/util.js）
 */

/** 2025-11 → "11月"（老版 util.monthShort） */
export function monthShort(monthStr: string | null | undefined): string {
  const m = String(monthStr || '').split('-')[1]
  return m ? `${Number(m)}月` : ''
}

/** 首字母（老版 util.initials）：中文取末两字，英文取前两位大写 */
export function initials(name?: string | null): string {
  if (!name) return '?'
  const s = String(name).trim()
  if (/[\u4e00-\u9fa5]/.test(s)) return s.slice(-2)
  return s.slice(0, 2).toUpperCase()
}

/**
 * 日期时间格式化（对齐老版 src/lib/util.js 的 fmtDateTime）
 * "2026-10-30 14:23:05" → "2026-10-30 14:23"
 */
export function fmtDateTime(d?: string | null): string {
  return d ? String(d).slice(0, 16) : ''
}

/**
 * 清洗通知正文里的去重键后缀
 * 调度器写入的 body 末尾会拼接 `|<dedupeKey>`（如 |budget:12:2026-10:over），
 * 那是内部幂等键，不能展示给用户。老版只清了 budget/debt/goal 三种，
 * 这里按通用规则清掉全部 `|<key>:<value>` 形式的后缀。
 */
export function stripDedupeSuffix(body?: string | null): string {
  if (!body) return ''
  return String(body).replace(/\s*\|[a-z][a-z-]*:.*$/i, '').trim()
}

/**
 * 由字符串稳定生成颜色（对齐后端 src/lib/util.js 的 colorFor）
 * 老版新建账本不提供颜色输入，后端按账本名自动配色，这里保持一致
 */
const PALETTE = ['#4f7cff', '#13c2c2', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#fa541c', '#1677ff', '#a0d911', '#f5222d']
export function colorFor(str?: string | null): string {
  if (!str) return PALETTE[0]
  let h = 0
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 99991
  return PALETTE[h % PALETTE.length]
}
