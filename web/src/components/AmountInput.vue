<script setup lang="ts">
import { computed } from 'vue'
import { NInput } from 'naive-ui'

interface Props {
  modelValue: string | number
  currency?: string
  placeholder?: string
  /** 是否禁用 */
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  currency: '¥',
  placeholder: '0.00',
  disabled: false,
})
const emit = defineEmits<{
  'update:modelValue': [v: string]
}>()

const display = computed({
  get: () => (props.modelValue ?? '') as string,
  set: (v: string) => emit('update:modelValue', v),
})

/** 解析"1234.56" / "1,234.56" / "12.5" → number (保留两位) */
function toCents(v: string | number): number {
  if (typeof v === 'number') return Math.round(v * 100)
  const s = String(v).replace(/[,\s¥￥$]/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

defineExpose({ toCents })
</script>

<template>
  <NInput
    v-model:value="display"
    :placeholder="placeholder"
    :disabled="disabled"
    inputmode="decimal"
    class="hl-amount-input"
  >
    <template #prefix>
      <span class="cur">{{ currency }}</span>
    </template>
  </NInput>
</template>

<style scoped>
.hl-amount-input :deep(input) {
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 500;
}
.cur { color: var(--hl-muted); font-weight: 500; }
</style>
