<script setup lang="ts">
import { computed } from 'vue'
import VChart, { THEME_KEY } from 'vue-echarts'
import { provide } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components'
import { palette } from '@/theme/tokens'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])
provide(THEME_KEY, 'light')

interface Series {
  name: string
  color?: string
  data: number[]
}
interface Props {
  labels: string[]
  series: Series[]
  height?: string | number
  /** 是否堆叠 */
  stack?: boolean
  /** 隐藏图例 */
  hideLegend?: boolean
  /** Y 轴单位（显示在 tooltip） */
  yUnit?: string
  /** 是否横向 */
  horizontal?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  height: 220,
  stack: false,
  hideLegend: false,
  yUnit: '¥',
  horizontal: false,
})

const colorCycle = [palette.semantic.expense, palette.semantic.income, palette.brand.primary, palette.semantic.purple, palette.semantic.warn]

const option = computed(() => {
  const colors = props.series.map((s, i) => s.color || colorCycle[i % colorCycle.length])
  return {
    color: colors,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => `${props.yUnit}${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    },
    legend: props.hideLegend ? undefined : { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12 } },
    grid: { top: 12, left: 36, right: 16, bottom: props.hideLegend ? 24 : 36, containLabel: true },
    xAxis: props.horizontal
      ? { type: 'value' }
      : { type: 'category', data: props.labels, axisLine: { lineStyle: { color: '#dde2eb' } }, axisTick: { show: false } },
    yAxis: props.horizontal
      ? { type: 'category', data: props.labels }
      : { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#eef1f6' } } },
    series: props.series.map((s) => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      barMaxWidth: 22,
      stack: props.stack ? 'stack' : undefined,
      itemStyle: { borderRadius: props.stack ? 0 : [4, 4, 0, 0] },
    })),
  }
})
</script>

<template>
  <VChart :option="option" :style="{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }" autoresize />
</template>
