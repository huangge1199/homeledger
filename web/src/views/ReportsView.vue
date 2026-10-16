<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NSelect, NSpin, NEmpty,
  NGrid, NGridItem, NDatePicker, NRadioGroup, NRadio, NRadioButton, NDataTable, type DataTableColumns,
} from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import BarChart from '@/components/BarChart.vue'
import DonutChart from '@/components/DonutChart.vue'
import LineChart from '@/components/LineChart.vue'
import { ReportsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const tab = ref<string>((route.query.tab as string) || 'overview')
const preset = ref<string>('month')
const month = ref<string | null>(dayjs().format('YYYY-MM'))
const year = ref<string | null>(dayjs().format('YYYY'))
const customFrom = ref<number | null>(dayjs().subtract(1, 'month').valueOf())
const customTo = ref<number | null>(dayjs().valueOf())
const kind = ref<'expense' | 'income'>('expense')

watch(tab, (v) => { router.replace({ query: { ...route.query, tab: v } }) })

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const params: Record<string, string> = {
      preset: preset.value,
      kind: kind.value,
    }
    if (preset.value === 'month' && month.value) params.month = month.value
    if (preset.value === 'year' && year.value) params.year = year.value
    if (preset.value === 'custom') {
      params.from = dayjs(customFrom.value!).format('YYYY-MM-DD')
      params.to = dayjs(customTo.value!).format('YYYY-MM-DD')
    }
    const d = await ReportsApi.overview(params)
    data.value = d
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([preset, month, year, customFrom, customTo, kind], () => load())

const presetOptions = [
  { label: '本月', value: 'month' },
  { label: '本季', value: 'quarter' },
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

// --- 图表数据 ---
const cats = computed(() => data.value?.cats || [])
const days = computed(() => data.value?.days || [])
const trend = computed(() => data.value?.trend || [])
const members = computed(() => data.value?.members || [])
const overview = computed(() => data.value?.overview || {})
const netWorth = computed(() => data.value?.netWorth || [])
const weekday = computed(() => data.value?.weekday || [])
const expCount = computed(() => data.value?.expenseCount || { count: 0, avg: 0 })
const sum = computed(() => data.value?.sum || { income: 0, expense: 0, count: 0 })
const compare = computed(() => data.value?.compare)

// 分类饼图
const donutData = computed(() => cats.value.map((c: any) => ({ name: c.name, value: c.amount_cents })))
// 每日柱状
const dayLabels = computed(() => days.value.map((d: any) => d.date))
const dayExpData = computed(() => days.value.map((d: any) => d.expense))
const dayIncData = computed(() => days.value.map((d: any) => d.income))
// 12 月趋势
const monthLabels = computed(() => trend.value.map((t: any) => t.month))
const monthExpData = computed(() => trend.value.map((t: any) => t.expense))
const monthIncData = computed(() => trend.value.map((t: any) => t.income))
// 净资产
const netWorthLabels = computed(() => netWorth.value.map((p: any) => p.date))
const netWorthData = computed(() => netWorth.value.map((p: any) => p.netWorth))
// 星期
const weekdayLabels = computed(() => weekday.value.map((_v: number, i: number) => `周${weekNames[i]}`))
const weekdayExpData = computed(() => weekday.value)

// 表格
const catColumns = computed<DataTableColumns>(() => [
  { title: '分类', key: 'name', render: (c: any) => h(NSpace, { size: 'small', align: 'center' }, {
    default: () => [
      c.color ? h('div', { style: `width: 8px; height: 8px; border-radius: 50%; background: ${c.color}` }) : null,
      h('span', null, `${c.icon || ''} ${c.name}`.trim()),
    ],
  }) },
  { title: '笔数', key: 'count', width: 80, align: 'right' },
  { title: '金额', key: 'amount_cents', width: 120, align: 'right', render: (c: any) => h(AmountDisplay, { cents: c.amount_cents, tone: kind.value === 'income' ? 'income' : 'expense' }) },
  { title: '占比', key: 'percent', width: 80, align: 'right', render: (c: any) => h(NText, { depth: 3 }, { default: () => `${(c.percent * 100).toFixed(1)}%` }) },
])

const memberColumns = computed<DataTableColumns>(() => [
  { title: '成员', key: 'display_name' },
  { title: '笔数', key: 'cnt', width: 80, align: 'right' },
  { title: '支出', key: 'expense', width: 120, align: 'right', render: (m: any) => h(AmountDisplay, { cents: m.expense }) },
  { title: '收入', key: 'income', width: 120, align: 'right', render: (m: any) => h(AmountDisplay, { cents: m.income }) },
])

const accountColumns = computed<DataTableColumns>(() => [
  { title: '账户', key: 'name', render: (a: any) => `${a.icon || ''} ${a.name}`.trim() },
  { title: '类型', key: 'type' },
  { title: '当前余额', key: 'current_cents', width: 140, align: 'right', render: (a: any) => h(AmountDisplay, { cents: a.current_cents, tone: a.current_cents >= 0 ? 'income' : 'expense' }) },
  { title: '初始', key: 'init_cents', width: 100, align: 'right' },
])

const weekNames = ['日', '一', '二', '三', '四', '五', '六']
const weekdayData = computed(() => weekday.value.map((v: number, i: number) => ({ name: `周${weekNames[i]}`, value: v })))
</script>

<template>
  <AppShell>
    <PageHead :title="`报表 · ${data?.range?.label || '...'} · ${kind === 'income' ? '收入' : '支出'}`" sub="时间区间、类型筛选 + 6 个视角">
      <template #actions>
        <NRadioGroup v-model:value="kind" size="small">
          <NRadioButton v-for="o in kindOptions" :key="o.value" :value="o.value">{{ o.label }}</NRadioButton>
        </NRadioGroup>
      </template>
    </PageHead>

    <!-- 筛选 -->
    <NCard :bordered="true" size="small" class="filter-card">
      <NSpace size="small" wrap>
        <NSelect v-model:value="preset" :options="presetOptions" size="small" style="width: 120px" />
        <NDatePicker
          v-if="preset === 'month'"
          v-model:formatted-value="month"
          value-format="yyyy-MM"
          type="month"
          size="small"
          style="width: 140px"
        />
        <NDatePicker
          v-if="preset === 'year'"
          v-model:formatted-value="year"
          value-format="yyyy"
          type="year"
          size="small"
          style="width: 120px"
        />
        <NDatePicker
          v-if="preset === 'custom'"
          v-model:value="customFrom"
          type="date"
          size="small"
          style="width: 140px"
        />
        <NDatePicker
          v-if="preset === 'custom'"
          v-model:value="customTo"
          type="date"
          size="small"
          style="width: 140px"
        />
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
            <StatCard label="收入" icon="💰" :value="sum.income" tone="income" />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard label="支出" icon="💸" :value="sum.expense" tone="expense" />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard label="笔数" icon="📝" :value="sum.count" tone="neutral" />
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <StatCard label="笔均支出" icon="📊" :value="expCount.avg" tone="expense" hint="单笔均值" />
          </NGridItem>
        </NGrid>

        <NCard v-if="compare" :bordered="true" size="small" class="compare-card">
          <h3 class="section-title">同期对比</h3>
          <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
            <NGridItem>
              <div class="cmp">
                <div class="label">本月</div>
                <div class="val"><AmountDisplay :cents="sum.expense" :sign="true" /></div>
              </div>
            </NGridItem>
            <NGridItem>
              <div class="cmp">
                <div class="label">上月（{{ compare.prevMonth.label }}）</div>
                <div class="val"><AmountDisplay :cents="compare.prevMonth.expense || 0" :sign="true" /></div>
              </div>
            </NGridItem>
            <NGridItem>
              <div class="cmp">
                <div class="label">去年（{{ compare.lastYear.label }}）</div>
                <div class="val"><AmountDisplay :cents="compare.lastYear.expense || 0" :sign="true" /></div>
              </div>
            </NGridItem>
          </NGrid>
        </NCard>

        <NCard :bordered="true" class="chart-card">
          <h3 class="section-title">近 12 月趋势</h3>
          <LineChart
            v-if="trend.length"
            :labels="monthLabels"
            :series="[
              { name: '支出', color: '#e5484d', data: monthExpData },
              { name: '收入', color: '#2a8d3f', data: monthIncData },
            ]"
            :height="280"
          />
        </NCard>
      </template>

      <!-- ===== 分类 ===== -->
      <template v-else-if="tab === 'category'">
        <NGrid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem>
            <NCard :bordered="true" class="chart-card" title="分类饼图">
              <DonutChart v-if="donutData.length" :items="donutData" :height="320" />
              <Empty v-else icon="🥧" title="没有分类数据" />
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard :bordered="true" class="chart-card" title="分类排行">
              <NDataTable :columns="catColumns" :data="cats" :pagination="false" size="small" />
            </NCard>
          </NGridItem>
        </NGrid>
      </template>

      <!-- ===== 日历 ===== -->
      <template v-else-if="tab === 'daily'">
        <NCard :bordered="true" class="chart-card" title="每日支出">
          <BarChart
            v-if="dayLabels.length"
            :labels="dayLabels"
            :series="[{ name: '支出', color: '#e5484d', data: dayExpData }]"
            :height="280"
          />
          <Empty v-else icon="📅" title="没有数据" />
        </NCard>
        <NCard :bordered="true" class="chart-card" title="按星期分布" style="margin-top: 12px">
          <BarChart
            v-if="weekdayExpData.some((v: number) => v > 0)"
            :labels="weekdayLabels"
            :series="[{ name: '支出', color: '#fa8c16', data: weekdayExpData }]"
            :height="240"
          />
          <Empty v-else icon="📅" title="没有数据" />
        </NCard>
      </template>

      <!-- ===== 趋势 ===== -->
      <template v-else-if="tab === 'trend'">
        <NCard :bordered="true" class="chart-card" title="12 月收入支出趋势">
          <LineChart
            v-if="trend.length"
            :labels="monthLabels"
            :series="[
              { name: '支出', color: '#e5484d', data: monthExpData },
              { name: '收入', color: '#2a8d3f', data: monthIncData },
            ]"
            :height="320"
          />
        </NCard>
        <NCard :bordered="true" class="chart-card" title="净资产走势" style="margin-top: 12px">
          <LineChart
            v-if="netWorthLabels.length"
            :labels="netWorthLabels"
            :series="[{ name: '净资产', color: '#3d6df5', data: netWorthData }]"
            :height="280"
          />
          <Empty v-else icon="📈" title="还没有净资产数据" />
        </NCard>
      </template>

      <!-- ===== 成员 ===== -->
      <template v-else-if="tab === 'member'">
        <NCard :bordered="true" class="chart-card" title="成员贡献">
          <NDataTable :columns="memberColumns" :data="members" :pagination="false" size="small" />
        </NCard>
      </template>

      <!-- ===== 账户 ===== -->
      <template v-else-if="tab === 'account'">
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
          <NGridItem span="3 m:1 l:1">
            <StatCard label="净资产" icon="💼" :value="overview.netWorth || 0" :tone="(overview.netWorth || 0) >= 0 ? 'income' : 'expense'" />
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <StatCard label="总资产" icon="💰" :value="overview.totalAssets || 0" tone="income" />
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <StatCard label="总负债" icon="💳" :value="overview.totalLiabilities || 0" tone="expense" />
          </NGridItem>
        </NGrid>
        <NCard :bordered="true" class="chart-card" title="账户概览" style="margin-top: 12px">
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
.cmp { padding: 12px; background: var(--hl-card-2, #f7f8fb); border-radius: 8px; text-align: center; }
.cmp .label { font-size: 12px; color: var(--hl-muted); }
.cmp .val { font-size: 18px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
</style>
