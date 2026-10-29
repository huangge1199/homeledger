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
