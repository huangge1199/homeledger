<script setup lang="ts">
import { computed } from 'vue'
import { fmtAmount, fmtAmountWith } from '@/utils/money'

interface Props {
  cents: number | null | undefined
  /** 是否带 +/- 符号 */
  sign?: boolean
  /** 强制色彩（不根据正负） */
  tone?: 'income' | 'expense' | 'neutral' | 'auto'
  /** 小一号字号 */
  small?: boolean
  /** 币种代码（CNY/USD/...）；不传则固定用 ¥ */
  currency?: string | null
}
const props = withDefaults(defineProps<Props>(), {
  sign: false,
  tone: 'auto',
  small: false,
  currency: null,
})

const text = computed(() =>
  props.currency ? fmtAmountWith(props.cents ?? 0, props.currency, props.sign) : fmtAmount(props.cents ?? 0, props.sign)
)
const color = computed(() => {
  const t = props.tone === 'auto' ? (Number(props.cents) >= 0 ? 'income' : 'expense') : props.tone
  if (t === 'income') return 'var(--hl-income, #12a150)'
  if (t === 'expense') return 'var(--hl-expense, #e5484d)'
  return 'inherit'
})
</script>

<template>
  <span class="hl-amount" :class="{ small }" :style="{ color }">{{ text }}</span>
</template>

<style scoped>
.hl-amount { font-variant-numeric: tabular-nums; font-weight: 500; }
.hl-amount.small { font-size: 12px; }
</style>
