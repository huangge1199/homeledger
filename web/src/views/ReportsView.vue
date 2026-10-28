<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NSpin,
  NGrid, NGridItem, NDatePicker, NRadioGroup, NRadioButton, NDataTable, type DataTableColumns,
} from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import BarChart from '@/components/BarChart.vue'
import DonutChart from '@/components/DonutChart.vue'
import DonutLegend from '@/components/DonutLegend.vue'
import LineChart from '@/components/LineChart.vue'
import RankBars from '@/components/RankBars.vue'
import { ReportsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtAmount, fmtCompact } from '@/utils/money'
import { monthShort, initials } from '@/utils/format'
import { ACCOUNT_TYPE_MAP } from '@/utils/accountTypes'
import { palette } from '@/theme/tokens'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const tab = ref<string>((route.query.tab as string) || 'overview')

/* ------------------------------------------------------------------ *
 * 区间 / 视角 / 下钻：全部以 URL query 为唯一数据源（对齐老版 GET 表单）
 * 老版筛选靠 <form method=get> + 链接，刷新与分享都能还原状态
 * ------------------------------------------------------------------ */

/**
 * 写回 URL query（老版筛选靠 GET 表单，刷新/分享都能还原状态）。
 * 值为 undefined / 空串表示删除该参数。
 */
function setQuery(patch: Record<string, string | undefined>) {
  const merged: Record<string, unknown> = { ...route.query, ...patch }
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === '') continue
    next[k] = Array.isArray(v) ? String(v[0]) : String(v)
  }
  router.replace({ query: next })
}

const preset = computed(() => String(route.query.preset || 'month'))
const kind = computed<'expense' | 'income'>(() => (route.query.kind === 'income' ? 'income' : 'expense'))
/** 分类下钻的一级分类名（老版 ?top=） */
const drillTop = computed(() => String(route.query.top || ''))

const monthStr = computed(() => String(route.query.month || dayjs().format('YYYY-MM')))
const yearStr = computed(() => String(route.query.year || dayjs().format('YYYY')))
const fromStr = computed(() => String(route.query.from || dayjs().subtract(1, 'month').format('YYYY-MM-DD')))
const toStr = computed(() => String(route.query.to || dayjs().format('YYYY-MM-DD')))

/** 切换区间预设：带上该预设需要的参数，清掉无关的 */
function setPreset(v: string) {
  if (v === 'month') setQuery({ preset: v, month: monthStr.value, year: undefined, from: undefined, to: undefined })
  else if (v === 'year') setQuery({ preset: v, year: yearStr.value, month: undefined, from: undefined, to: undefined })
  else if (v === 'custom') setQuery({ preset: v, from: fromStr.value, to: toStr.value, month: undefined, year: undefined })
  else setQuery({ preset: v, month: undefined, year: undefined, from: undefined, to: undefined })
}

watch(tab, (v) => { setQuery({ tab: v }) })

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const params: Record<string, string> = {
      preset: preset.value,
      kind: kind.value,
    }
    if (preset.value === 'month') params.month = monthStr.value
    if (preset.value === 'year') params.year = yearStr.value
    if (preset.value === 'custom') {
      params.from = fromStr.value
      params.to = toStr.value
    }
    if (drillTop.value) params.top = drillTop.value
    const d = await ReportsApi.overview(params)
    data.value = d
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
// 仅当影响数据的参数变化时重新拉取；切 tab 不触发
watch(
  () => [preset.value, monthStr.value, yearStr.value, fromStr.value, toStr.value, kind.value, drillTop.value].join('|'),
  load
)

const presetOptions = [
  { label: '本月', value: 'month' },
  { label: '本季度', value: 'quarter' },
  { label: '本年', value: 'year' },
  { label: '自定义', value: 'custom' },
  { label: '全部', value: 'all' },
]
const kindOptions = [
  { label: '💸 支出', value: 'expense' },
  { label: '💰 收入', value: 'income' },
]
const tabOptions = [
  { label: '📊 总览', value: 'overview' },
  { label: '🗂️ 分类', value: 'category' },
  { label: '📅 日历', value: 'daily' },
  { label: '📈 趋势', value: 'trend' },
  { label: '👥 成员', value: 'member' },
  { label: '🏦 账户', value: 'account' },
]

/* ------------------------------ 原始数据 ------------------------------ */

const range = computed(() => data.value?.range || {})
const cats = computed<any[]>(() => data.value?.cats || [])
const subcats = computed<any[]>(() => data.value?.subcats || [])
const days = computed<any[]>(() => data.value?.days || [])
const trend = computed<any[]>(() => data.value?.trend || [])
const members = computed<any[]>(() => data.value?.members || [])
const overview = computed<any>(() => data.value?.overview || {})
const netWorth = computed<any[]>(() => data.value?.netWorth || [])
const weekday = computed<number[]>(() => data.value?.weekday || [])
const expCount = computed(() => data.value?.expenseCount || { count: 0, avg: 0 })
const sum = computed(() => data.value?.sum || { income: 0, expense: 0, net: 0, count: 0 })
const compare = computed(() => data.value?.compare)

/* ------------------------------ 派生指标 ------------------------------ */

/** 当前视角的收支总额（分） */
const kindTotal = computed(() => (kind.value === 'income' ? sum.value.income : sum.value.expense))
/** 储蓄率（老版：净结余 / 收入） */
const savingRate = computed(() => (sum.value.income > 0 ? ((sum.value.net / sum.value.income) * 100).toFixed(1) : '—'))
/** 记账天数：有交易的天数 */
const activeDays = computed(() => days.value.filter((d) => d.count > 0).length)
/** 支出最高的一天 */
const maxDay = computed(() => days.value.reduce((a, b) => (Number(b.expense) > Number(a?.expense || 0) ? b : a), null))

/** 分类占比（老版 donutLegend 用总额算百分比） */
function catPercent(c: any): number {
  const t = Math.abs(Number(kindTotal.value || 0))
  return t ? (Math.abs(Number(c.total || 0)) / t) * 100 : 0
}

/* ------------------------------ 图表数据 ------------------------------ *
 * 图表组件的 value/tooltip 单位是「元」，后端给的是「分」，需除 100
 */

/** 分类构成环图 */
const donutData = computed(() =>
  cats.value.map((c: any) => ({
    name: `${c.icon || ''} ${c.name}`.trim(),
    value: Number(c.total || 0),
    color: c.color,
  }))
)
/** 分类构成图例（单位：分） */
const legendData = computed(() =>
  cats.value.map((c: any) => ({
    name: `${c.icon || ''} ${c.name}`.trim(),
    value: Number(c.total || 0),
    color: c.color,
  }))
)

/** 分类排行（老版取前 30 条，名称为「一级/二级」） */
const rankItems = computed(() =>
  subcats.value.slice(0, 30).map((c: any) => ({
    name: c.parent ? `${c.parent}/${c.name}` : c.name,
    value: Number(c.total || 0),
    color: c.color,
  }))
)
/** 下钻入口：一级分类 chips（老版取前 8 个） */
const drillChips = computed(() => cats.value.slice(0, 8))

/** 每日支出（老版 X 轴取 MM-DD） */
const dayLabels = computed(() => days.value.map((d: any) => String(d.date).slice(5)))
const dayExpData = computed(() => days.value.map((d: any) => Number(d.expense || 0) / 100))
/** 12 月趋势 */
const monthLabels = computed(() => trend.value.map((t: any) => monthShort(t.month)))
const monthExpData = computed(() => trend.value.map((t: any) => Number(t.expense || 0) / 100))
const monthIncData = computed(() => trend.value.map((t: any) => Number(t.income || 0) / 100))
/** 净资产走势 */
const netWorthLabels = computed(() => netWorth.value.map((p: any) => monthShort(p.month)))
const netWorthData = computed(() => netWorth.value.map((p: any) => Number(p.value || 0) / 100))
/** 星期分布 */
const weekNames = ['日', '一', '二', '三', '四', '五', '六']
const weekdayLabels = computed(() => weekNames.map((w) => `周${w}`))
const weekdayExpData = computed(() => weekday.value.map((v) => Number(v || 0) / 100))

/** 成员进度条最大值（老版：所有成员支出的最大值） */
const memberMax = computed(() => Math.max(...members.value.map((m: any) => Number(m.expense || 0)), 1))

/* ------------------------------ 表格 ------------------------------ */

const catColumns = computed<DataTableColumns>(() => [
  {
    title: '分类',
    key: 'name',
    render: (c: any) => h(NSpace, { size: 'small', align: 'center' }, {
      default: () => [
        c.color ? h('div', { style: `width: 8px; height: 8px; border-radius: 50%; background: ${c.color}` }) : null,
        h('span', null, `${c.icon || ''} ${c.name}`.trim()),
      ],
    }),
  },
  { title: '笔数', key: 'cnt', width: 80, align: 'right' },
  {
    title: '金额',
    key: 'total',
    width: 120,
    align: 'right',
    render: (c: any) => h(AmountDisplay, { cents: c.total, tone: kind.value === 'income' ? 'income' : 'expense' }),
  },
  {
    title: '占比',
    key: 'percent',
    width: 80,
    align: 'right',
    render: (c: any) => h(NText, { depth: 3 }, { default: () => `${catPercent(c).toFixed(1)}%` }),
  },
])

const memberColumns = computed<DataTableColumns>(() => [
  { title: '成员', key: 'name' },
  { title: '笔数', key: 'cnt', width: 80, align: 'right' },
  { title: '支出', key: 'expense', width: 120, align: 'right', render: (m: any) => h(AmountDisplay, { cents: m.expense }) },
  { title: '收入', key: 'income', width: 120, align: 'right', render: (m: any) => h(AmountDisplay, { cents: m.income }) },
])

/** 账户「占净资产」分母：所有账户余额绝对值之和（对齐老版） */
const netAbs = computed(() => {
  const list = overview.value.accounts || []
  return list.reduce((s: number, a: any) => s + Math.abs(Number(a.balance_cents || 0)), 0) || 1
})

const accountColumns = computed<DataTableColumns>(() => [
  { title: '账户', key: 'name', render: (a: any) => `${a.icon || ''} ${a.name}`.trim() },
  {
    title: '类型',
    key: 'type',
    render: (a: any) => ACCOUNT_TYPE_MAP[a.type]?.label || a.type,
  },
  {
    title: '当前余额',
    key: 'balance_cents',
    width: 140,
    align: 'right',
    render: (a: any) => h(AmountDisplay, { cents: a.balance_cents, currency: a.currency }),
  },
  {
    title: '初始余额',
    key: 'initial_cents',
    width: 120,
    align: 'right',
    render: (a: any) => h(AmountDisplay, { cents: a.initial_cents, currency: a.currency, tone: 'neutral' }),
  },
  {
    title: '占净资产',
    key: 'pct',
    width: 100,
    align: 'right',
    render: (a: any) =>
      h(NText, { depth: 3 }, {
        default: () => `${((Math.abs(Number(a.balance_cents || 0)) / netAbs.value) * 100).toFixed(1)}%`,
      }),
  },
])

/* ------------------------------ 同期对比 ------------------------------ */

/** 环比百分比（老版：(本期-上期)/上期*100） */
function momPct(base: number, prev: number): number {
  return prev > 0 ? ((base - prev) / prev) * 100 : 0
}
const compareRows = computed(() => {
  const c = compare.value
  if (!c) return []
  const cur = sum.value.expense
  return [
    { key: 'cur', label: `本期（${range.value.label || ''}）`, expense: cur, income: sum.value.income, net: sum.value.net, delta: null as number | null },
    {
      key: 'prev',
      label: `上月（${c.prevMonth.label}）`,
      expense: c.prevMonth.expense || 0,
      income: c.prevMonth.income || 0,
      net: c.prevMonth.net || 0,
      delta: momPct(cur, c.prevMonth.expense || 0),
    },
    {
      key: 'ly',
      label: `去年同期（${c.lastYear.label}）`,
      expense: c.lastYear.expense || 0,
      income: c.lastYear.income || 0,
      net: c.lastYear.net || 0,
      delta: momPct(cur, c.lastYear.expense || 0),
    },
  ]
})

/** 环比文案（老版口径：支出涨为红 ↑，跌为绿 ↓） */
function deltaText(delta: number | null): string {
  if (delta === null) return '—'
  return `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}%`
}
function deltaType(delta: number | null): 'success' | 'error' | undefined {
  if (delta === null) return undefined
  return delta >= 0 ? 'error' : 'success'
}
</script>

<template>
  <AppShell>
    <PageHead :title="`报表 · ${range.label || '...'} · ${kind === 'income' ? '收入' : '支出'}`" sub="时间区间、类型筛选 + 6 个视角">
      <template #actions>
        <NRadioGroup :value="kind" size="small" @update:value="(v: any) => setQuery({ kind: String(v) })">
          <NRadioButton v-for="o in kindOptions" :key="o.value" :value="o.value">{{ o.label }}</NRadioButton>
        </NRadioGroup>
      </template>
    </PageHead>

    <!-- 筛选 -->
    <NCard :bordered="true" size="small" class="filter-card">
      <NSpace size="small" wrap align="center">
        <NRadioGroup :value="preset" size="small" @update:value="(v: any) => setPreset(String(v))">
          <NRadioButton v-for="o in presetOptions" :key="o.value" :value="o.value">{{ o.label }}</NRadioButton>
        </NRadioGroup>
        <NDatePicker
          v-if="preset === 'month'"
          :formatted-value="monthStr"
          value-format="yyyy-MM"
          type="month"
          size="small"
          style="width: 140px"
          @update:formatted-value="(v: string | null) => setQuery({ month: v || undefined })"
        />
        <NDatePicker
          v-if="preset === 'year'"
          :formatted-value="yearStr"
          value-format="yyyy"
          type="year"
          size="small"
          style="width: 120px"
          @update:formatted-value="(v: string | null) => setQuery({ year: v || undefined })"
        />
        <NDatePicker
          v-if="preset === 'custom'"
          :formatted-value="fromStr"
          value-format="yyyy-MM-dd"
          type="date"
          size="small"
          style="width: 140px"
          @update:formatted-value="(v: string | null) => setQuery({ from: v || undefined })"
        />
        <span v-if="preset === 'custom'" class="range-sep">~</span>
        <NDatePicker
          v-if="preset === 'custom'"
          :formatted-value="toStr"
          value-format="yyyy-MM-dd"
          type="date"
          size="small"
          style="width: 140px"
          @update:formatted-value="(v: string | null) => setQuery({ to: v || undefined })"
        />
        <NText depth="3" class="range-hint">{{ range.start }} ~ {{ range.end }}</NText>
      </NSpace>
    </NCard>

    <NCard :bordered="true" size="small" class="tabs">
      <NSpace size="small">
        <NButton
          v-for="o in tabOptions"
          :key="o.value"
          :type="tab === o.value ? 'primary' : 'default'"
          size="small"
          @click="tab = o.value"
        >
          {{ o.label }}
        </NButton>
      </NSpace>
    </NCard>

    <NSpin :show="loading">
      <Empty v-if="!loading && !sum.count" icon="📈" title="区间内没有数据" description="切换时间区间或添加交易" />

      <!-- ===== 总览 ===== -->
      <template v-else-if="tab === 'overview'">
        <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
          <NGridItem span="4 m:1 l:1">
            <StatCard label="支出合计" icon="💸" :value="sum.expense" tone="expense" :hint="range.label" />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard label="收入合计" icon="💰" :value="sum.income" tone="income" :hint="range.label" />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard
              label="结余"
              icon="📊"
              :value="sum.net"
              :tone="sum.net >= 0 ? 'income' : 'expense'"
              :hint="`储蓄率 ${savingRate}%`"
            />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard label="笔均支出" icon="🧮" :value="expCount.avg" tone="expense" :hint="`${expCount.count} 笔 · 记账 ${activeDays} 天`" />
          </NGridItem>
        </NGrid>

        <NCard v-if="compare" :bordered="true" size="small" class="compare-card">
          <h3 class="section-title">同期对比</h3>
          <div class="scroll-x">
            <table class="cmp-table">
              <thead>
                <tr>
                  <th>区间</th>
                  <th class="num">支出</th>
                  <th class="num">收入</th>
                  <th class="num">结余</th>
                  <th class="num">环比</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in compareRows" :key="row.key" :class="{ current: row.key === 'cur' }">
                  <td class="bold">{{ row.label }}</td>
                  <td class="num amount expense">{{ fmtAmount(row.expense) }}</td>
                  <td class="num amount income">{{ fmtAmount(row.income) }}</td>
                  <td class="num amount">{{ fmtAmount(row.net) }}</td>
                  <td class="num">
                    <NText :type="deltaType(row.delta)" depth="3">{{ deltaText(row.delta) }}</NText>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </NCard>

        <NCard :bordered="true" class="chart-card">
          <h3 class="section-title">近 12 个月收支趋势</h3>
          <BarChart
            v-if="trend.length"
            :labels="monthLabels"
            :series="[
              { name: '支出', color: palette.semantic.expense, data: monthExpData },
              { name: '收入', color: palette.semantic.income, data: monthIncData },
            ]"
            :height="280"
          />
        </NCard>
      </template>

      <!-- ===== 分类 ===== -->
      <template v-else-if="tab === 'category'">
        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">{{ kind === 'expense' ? '支出' : '收入' }}构成</h3>
              <NText depth="3" class="muted">{{ range.label }}</NText>
            </div>
          </template>
          <Empty v-if="!donutData.length" icon="📊" title="该区间没有数据" />
          <div v-else class="donut-wrap">
            <div class="donut-fig">
              <DonutChart
                :items="donutData"
                :center-value="fmtCompact(kindTotal)"
                :center-title="kind === 'expense' ? '总支出' : '总收入'"
                :size="190"
                :thickness="24"
                height="190"
              />
            </div>
            <DonutLegend :items="legendData" :total="kindTotal" />
          </div>
        </NCard>

        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">分类排行榜</h3>
              <NText depth="3" class="muted">{{ drillTop ? `下钻：${drillTop}` : '一级分类' }}</NText>
              <NButton v-if="drillTop" size="tiny" quaternary @click="setQuery({ top: undefined })">返回一级</NButton>
            </div>
          </template>
          <Empty v-if="!rankItems.length" icon="🏆" title="没有数据" />
          <template v-else>
            <div class="rank-scroll">
              <RankBars :items="rankItems" />
            </div>
            <NText depth="3" class="tiny muted block">点分类名可下钻查看该分类下的二级明细</NText>
            <NSpace size="small" wrap class="drill-chips">
              <NTag
                v-for="c in drillChips"
                :key="c.name"
                size="small"
                round
                :type="drillTop === c.name ? 'primary' : 'default'"
                :bordered="false"
                style="cursor: pointer"
                @click="setQuery({ top: drillTop === c.name ? undefined : c.name })"
              >
                {{ c.icon }} {{ c.name }}
              </NTag>
            </NSpace>
          </template>
        </NCard>

        <NCard :bordered="true" size="small" class="chart-card">
          <h3 class="section-title">分类明细</h3>
          <NDataTable :columns="catColumns" :data="cats" :pagination="false" size="small" />
        </NCard>
      </template>

      <!-- ===== 日历 ===== -->
      <template v-else-if="tab === 'daily'">
        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">每日支出走势</h3>
              <NText v-if="maxDay" depth="3" class="muted">
                支出最高的一天：{{ maxDay.date }}（{{ fmtAmount(maxDay.expense) }}）
              </NText>
            </div>
          </template>
          <LineChart
            v-if="dayLabels.length"
            :labels="dayLabels"
            :series="[{ name: '每日支出', color: palette.semantic.expense, data: dayExpData }]"
            :height="240"
          />
          <Empty v-else icon="📅" title="没有数据" />
        </NCard>
        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">星期消费分布</h3>
              <NText depth="3" class="muted">看你的钱花在哪几天</NText>
            </div>
          </template>
          <BarChart
            v-if="weekdayExpData.some((v) => v > 0)"
            :labels="weekdayLabels"
            :series="[{ name: '支出', color: palette.semantic.purple, data: weekdayExpData }]"
            :height="220"
            hide-legend
          />
          <Empty v-else icon="📅" title="没有数据" />
        </NCard>
      </template>

      <!-- ===== 趋势 ===== -->
      <template v-else-if="tab === 'trend'">
        <NCard :bordered="true" class="chart-card">
          <h3 class="section-title">12 月收入支出趋势</h3>
          <BarChart
            v-if="trend.length"
            :labels="monthLabels"
            :series="[
              { name: '支出', color: palette.semantic.expense, data: monthExpData },
              { name: '收入', color: palette.semantic.income, data: monthIncData },
            ]"
            :height="300"
          />
        </NCard>
        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">净资产走势（近 12 个月）</h3>
              <NText depth="3" class="muted">含所有账户余额累计</NText>
            </div>
          </template>
          <LineChart
            v-if="netWorthLabels.length"
            :labels="netWorthLabels"
            :series="[{ name: '净资产', color: palette.brand.primary, data: netWorthData }]"
            :height="240"
          />
          <Empty v-else icon="📈" title="还没有净资产数据" />
          <NSpace size="large" class="net-summary">
            <NText depth="3">当前净资产 <b>{{ fmtAmount(overview.net || 0) }}</b></NText>
            <NText depth="3">总资产 <b>{{ fmtAmount(overview.assets || 0) }}</b></NText>
            <NText depth="3">总负债 <b>{{ fmtAmount(overview.liabilities || 0) }}</b></NText>
          </NSpace>
        </NCard>
      </template>

      <!-- ===== 成员 ===== -->
      <template v-else-if="tab === 'member'">
        <NCard :bordered="true" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">成员消费对比</h3>
              <NText depth="3" class="muted">家庭账本很有用</NText>
            </div>
          </template>
          <Empty v-if="!members.length" icon="👨‍👩‍👧" title="没有数据" />
          <div v-for="m in members" :key="m.id" class="member-item">
            <div class="member-head">
              <span class="avatar" :style="{ background: m.color }">{{ initials(m.name) }}</span>
              <span class="member-name">{{ m.name }}</span>
              <NText depth="3" class="member-meta">
                {{ m.cnt }} 笔 · 支出 <b>{{ fmtAmount(m.expense) }}</b>
              </NText>
            </div>
            <div class="member-bar">
              <i
                :style="{
                  width: Math.min((Number(m.expense || 0) / memberMax) * 100, 100) + '%',
                  background: m.color,
                }"
              />
            </div>
          </div>
        </NCard>
        <NCard :bordered="true" size="small" class="chart-card">
          <h3 class="section-title">成员明细</h3>
          <NDataTable :columns="memberColumns" :data="members" :pagination="false" size="small" />
        </NCard>
      </template>

      <!-- ===== 账户 ===== -->
      <template v-else-if="tab === 'account'">
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
          <NGridItem span="3 m:1 l:1">
            <StatCard label="净资产" icon="💼" :value="overview.net || 0" :tone="(overview.net || 0) >= 0 ? 'income' : 'expense'" />
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <StatCard label="总资产" icon="💰" :value="overview.assets || 0" tone="income" />
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <StatCard label="总负债" icon="💳" :value="overview.liabilities || 0" tone="expense" />
          </NGridItem>
        </NGrid>
        <NCard :bordered="true" size="small" class="chart-card">
          <template #header>
            <div class="card-head">
              <h3 class="section-title">账户余额一览</h3>
              <NButton size="tiny" quaternary @click="router.push('/accounts')">管理 →</NButton>
            </div>
          </template>
          <NDataTable :columns="accountColumns" :data="overview.accounts || []" :pagination="false" size="small" />
        </NCard>
      </template>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.filter-card { margin-bottom: 12px; }
.tabs { margin-bottom: 12px; }
.stats { margin-bottom: 12px; }
.compare-card { margin-bottom: 12px; }
.chart-card { margin-bottom: 12px; }
.section-title { font-size: 14px; margin: 0 0 12px; }
.muted { color: var(--hl-muted, #7d8aa3); font-size: 12px; }
.tiny { font-size: 11.5px; }
.block { display: block; }
.range-sep { color: var(--hl-muted, #7d8aa3); }
.range-hint { font-size: 12px; font-variant-numeric: tabular-nums; }

.card-head { display: flex; align-items: center; gap: 10px; }
.card-head .section-title { margin: 0; }

/* 同期对比表 */
.scroll-x { overflow-x: auto; }
.cmp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cmp-table th,
.cmp-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--hl-border, #e6eaf1); }
.cmp-table th { color: var(--hl-muted, #7d8aa3); font-weight: 500; font-size: 12px; }
.cmp-table td.num,
.cmp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.cmp-table tr.current td { font-weight: 600; background: var(--hl-card-2, #f7f8fb); }
.cmp-table tr:last-child td { border-bottom: none; }
.amount.income { color: var(--hl-income, #12a150); }
.amount.expense { color: var(--hl-expense, #e5484d); }

/* 分类构成 */
.donut-wrap { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.donut-fig { flex: 0 0 190px; width: 190px; }

/* 排行榜 */
.rank-scroll { max-height: 340px; overflow-y: auto; }
.drill-chips { margin-top: 10px; }

/* 成员 */
.member-item { margin-bottom: 14px; }
.member-item:last-child { margin-bottom: 0; }
.member-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.avatar {
  width: 22px; height: 22px; border-radius: 50%;
  display: inline-grid; place-items: center;
  color: #fff; font-size: 10px; flex: 0 0 auto;
}
.member-name { font-weight: 500; }
.member-meta { margin-left: auto; font-variant-numeric: tabular-nums; }
.member-bar {
  margin-top: 8px; height: 8px; border-radius: 4px;
  background: var(--hl-track, #eef0f4); overflow: hidden;
}
.member-bar i { display: block; height: 100%; border-radius: 4px; }

/* 净资产摘要 */
.net-summary { margin-top: 12px; }
</style>
