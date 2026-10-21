/**
 * 金额格式化：cents -> 字符串
 * 12345 -> "¥123.45"
 * -12345 -> "-¥123.45"
 */
export function fmtAmount(cents: number | null | undefined, sign = false): string {
  const n = Math.round(Number(cents || 0)) / 100
  const num = n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const isNeg = n < 0
  const absNum = isNeg ? num.replace('-', '') : num
  if (sign) {
    return `${isNeg ? '-' : n > 0 ? '+' : ''}¥${absNum}`
  }
  return `${isNeg ? '-' : ''}¥${absNum}`
}

export function fmtAmountShort(cents: number | null | undefined): string {
  const n = Math.round(Number(cents || 0)) / 100
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`
  return fmtAmount(cents)
}

/**
 * 纯数字金额（无 ¥ 符号，小数位可指定）
 * 对应老版 src/lib/util.js 的 fmtAmount(cents, decimals)，
 * 用于日历格等需要紧凑排布、且自行加 +/- 前缀的场景
 */
export function fmtPlain(cents: number | null | undefined, decimals = 2): string {
  const n = Number(cents || 0) / 100
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (neg ? '-' : '') + s
}
