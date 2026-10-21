/**
 * 交易类型常量（与后端 src/db.js 的 TXN_TYPES 同步）
 * flow: 'in' 收入, 'out' 支出, 'move' 转账/搬运, 'adjust' 调整
 */
export interface TxnType {
  key: string
  label: string
  icon: string
  color: string
  flow: 'in' | 'out' | 'move' | 'adjust'
  group: string
}

export const TXN_TYPES: TxnType[] = [
  { key: 'expense',         label: '支出',       icon: '💸', color: '#f5222d', flow: 'out',    group: '日常' },
  { key: 'income',          label: '收入',       icon: '💰', color: '#52c41a', flow: 'in',     group: '日常' },
  { key: 'transfer',        label: '转账',       icon: '🔄', color: '#1677ff', flow: 'move',   group: '日常' },
  { key: 'lend',            label: '借出',       icon: '📤', color: '#fa8c16', flow: 'out',    group: '借贷' },
  { key: 'borrow',          label: '借入',       icon: '📥', color: '#fa8c16', flow: 'in',     group: '借贷' },
  { key: 'repay_receive',   label: '收回借款',   icon: '↩️', color: '#13c2c2', flow: 'in',     group: '借贷' },
  { key: 'repay_pay',       label: '偿还借款',   icon: '↪️', color: '#13c2c2', flow: 'out',    group: '借贷' },
  { key: 'reimburse',       label: '报销入账',   icon: '🧾', color: '#722ed1', flow: 'in',     group: '报销' },
  { key: 'refund',          label: '退款',       icon: '↩️', color: '#52c41a', flow: 'in',     group: '日常' },
  { key: 'fee',             label: '手续费',     icon: '🏷️', color: '#8c8c8c', flow: 'out',    group: '金融' },
  { key: 'interest',        label: '利息收入',   icon: '🏦', color: '#52c41a', flow: 'in',     group: '金融' },
  { key: 'invest_buy',      label: '投资买入',   icon: '📉', color: '#1677ff', flow: 'move',   group: '投资' },
  { key: 'invest_sell',     label: '投资卖出',   icon: '📈', color: '#fa541c', flow: 'move',   group: '投资' },
  { key: 'adjust',          label: '余额调整',   icon: '⚖️', color: '#8c8c8c', flow: 'adjust', group: '其他' },
]

export const TXN_TYPE_MAP: Record<string, TxnType> = Object.fromEntries(TXN_TYPES.map((t) => [t.key, t]))

/** 计入「收入」统计的类型（与后端 src/lib/txn.js INCOME_TYPES 同步） */
export const INCOME_STAT_TYPES = ['income', 'interest', 'refund', 'reimburse']
/** 计入「支出」统计的类型（与后端 src/lib/txn.js EXPENSE_TYPES 同步） */
export const EXPENSE_STAT_TYPES = ['expense', 'fee']

/** 一级展示：最常用的 4 种 */
export const PRIMARY_TXN_TYPES = ['expense', 'income', 'transfer', 'lend']

export function kindOf(type: string): 'expense' | 'income' {
  return ['income', 'interest', 'refund', 'reimburse', 'repay_receive'].includes(type) ? 'income' : 'expense'
}

export function flowOf(type: string): 'in' | 'out' | 'move' | 'adjust' {
  return TXN_TYPE_MAP[type]?.flow || 'out'
}
