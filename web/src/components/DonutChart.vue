<script setup lang="ts">
import { computed } from 'vue'
import VChart, { THEME_KEY } from 'vue-echarts'
import { provide } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { palette } from '@/theme/tokens'

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent])
provide(THEME_KEY, 'light')

interface Item { name: string; value: number; color?: string }
interface Props {
  items: Item[]
  /** 圆环厚度（像素） */
  thickness?: number
  /** 中心数字 */
  centerValue?: string
  /** 中心副标题 */
  centerTitle?: string
  height?: string | number
}
const props = withDefaults(defineProps<Props>(), {
  thickness: 22,
  height: 200,
})

const colorCycle = [palette.brand.primary, palette.semantic.income, palette.semantic.purple, palette.semantic.warn, palette.semantic.info]

const option = computed(() => ({
  color: props.items.map((it, i) => it.color || colorCycle[i % colorCycle.length]),
  tooltip: { trigger: 'item', valueFormatter: (v: number) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
  series: [
    {
      type: 'pie',
      radius: [`${props.thickness}px`, '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      data: props.items.map((it) => ({ name: it.name, value: it.value })),
    },
  ],
}))
</script>

<template>
  <div class="hl-donut" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <VChart :option="option" class="chart" autoresize />
    <div v-if="centerValue" class="center">
      <div class="value">{{ centerValue }}</div>
      <div v-if="centerTitle" class="title">{{ centerTitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.hl-donut { position: relative; width: 100%; }
.chart { width: 100%; height: 100%; }
.center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none;
  text-align: center;
}
.center .value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.center .title { font-size: 12px; color: var(--hl-muted); margin-top: 2px; }
</style>
