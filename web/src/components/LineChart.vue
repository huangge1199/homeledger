<script setup lang="ts">
import { computed } from 'vue'
import VChart, { THEME_KEY } from 'vue-echarts'
import { provide } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { palette } from '@/theme/tokens'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])
provide(THEME_KEY, 'light')

interface Series { name: string; color?: string; data: number[] }
interface Props {
  labels: string[]
  series: Series[]
  height?: string | number
  yUnit?: string
  hideLegend?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  height: 220,
  yUnit: '¥',
  hideLegend: false,
})

const colorCycle = [palette.semantic.expense, palette.semantic.income, palette.brand.primary, palette.semantic.purple]

const option = computed(() => ({
  color: props.series.map((s, i) => s.color || colorCycle[i % colorCycle.length]),
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number) => `${props.yUnit}${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
  },
  legend: props.hideLegend ? undefined : { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12 } },
  grid: { top: 12, left: 36, right: 16, bottom: props.hideLegend ? 24 : 36, containLabel: true },
  xAxis: { type: 'category', data: props.labels, axisLine: { lineStyle: { color: '#dde2eb' } }, axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#eef1f6' } } },
  series: props.series.map((s) => ({
    name: s.name, type: 'line', data: s.data, smooth: true, symbolSize: 6,
    lineStyle: { width: 2 },
  })),
}))
</script>

<template>
  <VChart
    :option="option"
    :style="{ height: typeof height === 'number' ? `${height}px` : /^\d+$/.test(String(height)) ? `${height}px` : height, width: '100%' }"
    autoresize
  />
</template>
