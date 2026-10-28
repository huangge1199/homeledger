<script setup lang="ts">
import { computed } from 'vue'
import { NDatePicker } from 'naive-ui'

/** 显示格式（面板里展示给用户看的中文格式） */
const DISPLAY_FMT: Record<string, string> = {
  date: 'yyyy年M月d日',
  datetime: 'yyyy年M月d日 HH:mm:ss',
  month: 'yyyy年M月',
}
/** 输出格式（v-model emit 的字符串格式，决定传给后端的精度） */
const OUTPUT_FMT: Record<string, string> = {
  date: 'YYYY-MM-DD',
  datetime: 'YYYY-MM-DD HH:mm:ss',
  month: 'YYYY-MM',
}

/** 占位文案（naive-ui 默认的英文 "Select Date" 不符合本项目语言） */
const PLACEHOLDER_MAP: Record<string, string> = {
  date: '选择日期',
  datetime: '选择日期时间',
  month: '选择月份',
}

interface Props {
  modelValue: string | null | undefined  // 'YYYY-MM-DD'
  type?: 'date' | 'datetime' | 'month'
  clearable?: boolean
  /** 占位文案，默认按 type 取中文 */
  placeholder?: string
  /** 禁用某些日期（用于起止日期联动约束） */
  disabledDate?: (ts: number) => boolean
}
const props = withDefaults(defineProps<Props>(), {
  type: 'date',
  clearable: true,
})
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const fmt = computed(() => DISPLAY_FMT[props.type] || DISPLAY_FMT.date)
const outFmt = computed(() => OUTPUT_FMT[props.type] || OUTPUT_FMT.date)
const ph = computed(() => props.placeholder || PLACEHOLDER_MAP[props.type] || PLACEHOLDER_MAP.date)

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
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (outFmt.value === OUTPUT_FMT.datetime) {
      emit('update:modelValue', `${ymd} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    } else if (outFmt.value === OUTPUT_FMT.month) {
      emit('update:modelValue', `${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
    } else {
      emit('update:modelValue', ymd)
    }
  },
})
</script>

<template>
  <!--
    注意：不要给 NDatePicker 传 locale。
    naive-ui 的 NDatePicker 没有 locale prop（传了只会作为普通 attribute 落到 DOM 上，
    面板文案仍走 NConfigProvider 的 locale/dateLocale）。中文已在 App.vue 全局配置。
  -->
  <NDatePicker
    v-model:value="ts"
    :type="type"
    :format="fmt"
    :placeholder="ph"
    :is-date-disabled="disabledDate"
    :clearable="clearable"
    class="hl-date"
  />
</template>

<style scoped>
.hl-date { width: 100%; }
</style>
