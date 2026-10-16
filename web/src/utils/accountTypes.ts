/**
 * 账户类型常量（与后端 src/db.js 的 ACCOUNT_TYPES 同步）
 */
export interface AccountTypeDef {
  key: string
  label: string
  icon: string
  nature: 'asset' | 'liability'
}

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  { key: 'cash',       label: '现金',         icon: '💵', nature: 'asset' },
  { key: 'debit',      label: '储蓄卡',       icon: '🏦', nature: 'asset' },
  { key: 'credit',     label: '信用卡',       icon: '💳', nature: 'liability' },
  { key: 'virtual',    label: '虚拟账户',     icon: '📱', nature: 'asset' },
  { key: 'prepaid',    label: '储值卡/预付',   icon: '🎫', nature: 'asset' },
  { key: 'investment', label: '投资账户',     icon: '📈', nature: 'asset' },
  { key: 'receivable', label: '应收款',       icon: '📥', nature: 'asset' },
  { key: 'payable',    label: '应付款',       icon: '📤', nature: 'liability' },
  { key: 'loan',       label: '贷款/负债',    icon: '🏚️', nature: 'liability' },
  { key: 'other',      label: '其他',         icon: '📦', nature: 'asset' },
]

export const ACCOUNT_TYPE_MAP: Record<string, AccountTypeDef> = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.key, t]))
