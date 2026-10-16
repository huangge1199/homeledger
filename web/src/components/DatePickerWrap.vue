<script setup lang="ts">
import { computed } from 'vue'
import { NDatePicker } from 'naive-ui'

interface Props {
  modelValue: string | null | undefined  // 'YYYY-MM-DD'
  type?: 'date' | 'datetime' | 'month'
  clearable?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  type: 'date',
  clearable: true,
})
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

// naive 的 NDatePicker 接受毫秒时间戳
const ts = computed<number | null>({
  get: () => {
    if (!props.modelValue) return null
    // 兼容 'YYYY-MM-DD' 与 'YYYY-MM-DD HH:mm:ss'
    const s = String(props.modelValue).replace(' ', 'T')
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
    return Number.isFinite(d.getTime()) ? d.getTime() : null
  },
  set: (v: number | null) => {
    if (v == null) return emit('update:modelValue', '')
    const d = new Date(v)
    const pad = (n: number) => String(n).padStart(2, '0')
    const out = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    emit('update:modelValue', out)
  },
})
</script>

<template>
  <NDatePicker
    v-model:value="ts"
    :type="type"
    :clearable="clearable"
    class="hl-date"
  />
</template>

<style scoped>
.hl-date { width: 100%; }
</style>
