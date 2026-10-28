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
