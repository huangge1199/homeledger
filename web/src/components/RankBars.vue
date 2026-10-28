<script setup lang="ts">
/**
 * 横向排行条形图（对齐老版 src/lib/charts.js 的 rankBars）
 * 老版是服务端 SVG，新版用 DOM 实现，视觉与交互保持一致
 */
import { computed } from 'vue'
import { fmtAmount } from '@/utils/money'
import { palette } from '@/theme/tokens'

interface Item {
  name: string
  /** 金额（分） */
  value: number
  color?: string
}
interface Props {
  items: Item[]
  /** 覆盖最大值（默认取 items 最大值） */
  max?: number | null
  /** 是否显示序号 */
  showIndex?: boolean
  /** 金额是否带币种符号 */
  showAmount?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  max: null,
  showIndex: true,
  showAmount: true,
})

const maxVal = computed(() => {
  if (props.max != null) return Math.abs(props.max)
  return Math.max(...props.items.map((i) => Math.abs(Number(i.value) || 0)), 1)
})
const rows = computed(() =>
  props.items.map((it, idx) => ({
    ...it,
    idx: idx + 1,
    width: Math.max((Math.abs(Number(it.value) || 0) / maxVal.value) * 100, 1.5).toFixed(1),
    color: it.color || palette.brand.primary,
  }))
)
</script>

<template>
  <div class="rank-bars">
    <div v-for="r in rows" :key="r.name" class="rank-row">
      <span v-if="showIndex" class="rank-idx">{{ r.idx }}</span>
      <span class="rank-name" :title="r.name">{{ r.name }}</span>
      <span class="rank-track"><i :style="{ width: r.width + '%', background: r.color }" /></span>
      <span v-if="showAmount" class="rank-val">{{ fmtAmount(r.value) }}</span>
    </div>
  </div>
</template>

<style scoped>
.rank-bars { display: flex; flex-direction: column; gap: 8px; }
.rank-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.rank-idx {
  flex: 0 0 20px; text-align: center; font-size: 11px;
  color: var(--hl-muted, #8b95a5); font-variant-numeric: tabular-nums;
}
.rank-name {
  flex: 0 0 96px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rank-track {
  flex: 1; height: 8px; border-radius: 4px;
  background: var(--hl-track, #eef0f4); overflow: hidden; min-width: 30px;
}
.rank-track i { display: block; height: 100%; border-radius: 4px; }
.rank-val {
  flex: 0 0 76px; text-align: right;
  font-variant-numeric: tabular-nums; font-weight: 500;
}
</style>
