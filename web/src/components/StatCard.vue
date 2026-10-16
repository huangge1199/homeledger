<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NText } from 'naive-ui'
import { fmtAmount } from '@/utils/money'

interface Props {
  label: string
  value: number | null | undefined
  icon?: string
  tone?: 'income' | 'expense' | 'neutral'
  hint?: string
  /** 环比百分比；正数=涨，负数=跌 */
  delta?: number | null
  /** 是否反转 delta 颜色（支出涨=坏） */
  reverseDelta?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  reverseDelta: false,
})

const valueText = computed(() => fmtAmount(props.value ?? 0))

const valueColor = computed(() => {
  if (props.tone === 'income') return 'var(--hl-income, #12a150)'
  if (props.tone === 'expense') return 'var(--hl-expense, #e5484d)'
  return 'var(--hl-text, #17202e)'
})

const deltaText = computed(() => {
  if (props.delta == null) return null
  const arrow = props.delta >= 0 ? '↑' : '↓'
  return `环比上月 ${arrow} ${Math.abs(props.delta).toFixed(1)}%`
})
const deltaTone = computed(() => {
  if (props.delta == null) return 'muted'
  // 默认：涨=好（绿/红？按原 design：支出越低越好）
  const up = props.delta >= 0
  if (props.tone === 'expense') return up ? 'bad' : 'good'  // 支出涨=坏
  if (props.tone === 'income')  return up ? 'good' : 'bad'  // 收入涨=好
  return up ? 'good' : 'bad'
})
</script>

<template>
  <NCard size="small" :bordered="true" hoverable class="hl-stat">
    <div class="head">
      <span class="label">{{ label }}</span>
      <span v-if="icon" class="icon">{{ icon }}</span>
    </div>
    <div class="value" :style="{ color: valueColor }">{{ valueText }}</div>
    <div v-if="deltaText || hint" class="foot">
      <NText v-if="deltaText" :type="deltaTone === 'good' ? 'success' : deltaTone === 'bad' ? 'error' : undefined" depth="3" class="delta">
        {{ deltaText }}
      </NText>
      <NText v-if="hint" depth="3" class="hint">{{ hint }}</NText>
    </div>
  </NCard>
</template>

<style scoped>
.hl-stat { padding: 14px 16px; }
.head { display:flex; justify-content:space-between; align-items:center; color: var(--hl-muted); font-size:12px; }
.icon  { font-size: 16px; }
.value { font-size: 22px; font-weight: 600; margin-top: 6px; font-variant-numeric: tabular-nums; }
.foot  { display:flex; justify-content:space-between; align-items:center; margin-top: 6px; font-size: 12px; }
.delta { font-variant-numeric: tabular-nums; }
</style>
