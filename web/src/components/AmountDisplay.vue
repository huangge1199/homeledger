<script setup lang="ts">
import { computed } from 'vue'
import { fmtAmount } from '@/utils/money'

interface Props {
  cents: number | null | undefined
  /** 是否带 +/- 符号 */
  sign?: boolean
  /** 强制色彩（不根据正负） */
  tone?: 'income' | 'expense' | 'neutral' | 'auto'
  /** 小一号字号 */
  small?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  sign: false,
  tone: 'auto',
  small: false,
})

const text = computed(() => fmtAmount(props.cents ?? 0, props.sign))
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
