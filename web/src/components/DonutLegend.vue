<script setup lang="ts">
/**
 * 环形图配套图例列表（对齐老版 src/lib/charts.js 的 donutLegend）
 * 每行：色点 + 名称 + 占比条 + 百分比 + 金额
 */
import { computed } from 'vue'
import { fmtAmount } from '@/utils/money'

interface Item {
  name: string
  /** 金额（分） */
  value: number
  color?: string
}
interface Props {
  items: Item[]
  /** 总金额（分）；不传则按 items 求和 */
  total?: number | null
  /** 是否显示金额列 */
  showAmount?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  total: null,
  showAmount: true,
})

const sum = computed(() => {
  if (props.total != null) return Math.abs(props.total)
  return props.items.reduce((s, i) => s + Math.abs(Number(i.value) || 0), 0)
})

const rows = computed(() =>
  props.items.map((it) => {
    const v = Math.abs(Number(it.value) || 0)
    const pct = sum.value ? (v / sum.value) * 100 : 0
    return { ...it, v, pct, pctText: pct.toFixed(1) }
  })
)
</script>

<template>
  <div class="donut-legend">
    <div v-for="r in rows" :key="r.name" class="legend-row">
      <span class="dot" :style="{ background: r.color }" />
      <span class="lname ellipsis" :title="r.name">{{ r.name }}</span>
      <span class="lbar"><i :style="{ width: r.pct + '%', background: r.color }" /></span>
      <span class="lpct">{{ r.pctText }}%</span>
      <span v-if="showAmount" class="lval">{{ fmtAmount(r.v) }}</span>
    </div>
  </div>
</template>

<style scoped>
.donut-legend { display: flex; flex-direction: column; gap: 6px; }
.legend-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.legend-row .dot { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }
.legend-row .lname {
  flex: 0 1 84px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.legend-row .lbar {
  flex: 1; height: 6px; border-radius: 3px;
  background: var(--hl-track, #eef0f4); overflow: hidden; min-width: 30px;
}
.legend-row .lbar i { display: block; height: 100%; border-radius: 3px; }
.legend-row .lpct {
  width: 44px; text-align: right;
  color: var(--hl-muted, #8b95a5); font-variant-numeric: tabular-nums;
}
.legend-row .lval { width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
