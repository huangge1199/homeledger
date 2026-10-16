<script setup lang="ts">
import { computed } from 'vue'
import { NText } from 'naive-ui'

interface Props {
  delta: number | null | undefined
  /** 是否反转语义（支出涨=坏） */
  reverse?: boolean
  suffix?: string
}
const props = withDefaults(defineProps<Props>(), {
  reverse: false,
  suffix: '',
})

const visible = computed(() => props.delta != null)
const text = computed(() => {
  if (props.delta == null) return ''
  const arrow = props.delta >= 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(props.delta).toFixed(1)}%${props.suffix}`
})
const tone = computed<'success' | 'error' | undefined>(() => {
  if (props.delta == null) return undefined
  const up = props.delta >= 0
  const good = props.reverse ? !up : up
  return good ? 'success' : 'error'
})
</script>

<template>
  <NText v-if="visible" :type="tone" depth="3" class="hl-delta">{{ text }}</NText>
</template>

<style scoped>
.hl-delta { font-variant-numeric: tabular-nums; }
</style>
