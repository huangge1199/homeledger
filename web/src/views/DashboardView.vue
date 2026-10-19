<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NButton, NText, NSpin, NGrid, NGridItem, NAlert, NProgress } from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import StatCard from '@/components/StatCard.vue'
import BarChart from '@/components/BarChart.vue'
import DonutChart from '@/components/DonutChart.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import Empty from '@/components/Empty.vue'
import { DashboardApi } from '@/api/modules'
import { useSessionStore } from '@/stores/session'
import { errorMessage } from '@/api/client'
import { fmtAmount } from '@/utils/money'
import { useFlash } from '@/composables/useFlash'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const { error: toastError } = useFlash()

const loading = ref(false)
const data = ref<any>(null)

const month = computed(() => (route.query.month as string) || dayjs().format('YYYY-MM'))

function load() {
  if (!session.isAuthed) return
  loading.value = true
  DashboardApi.overview(month.value)
    .then((d) => { data.value = d })
    .catch((e) => toastError(errorMessage(e, '加载总览失败')))
    .finally(() => { loading.value = false })
}

onMounted(load)
watch(() => route.query.month, load)
watch(() => session.currentLedger?.id, load)

const monthOptions = computed(() => {
  const out: { label: string; value: string }[] = []
  const cur = dayjs()
  for (let i = 0; i < 12; i++) {
    const d = cur.subtract(i, 'month')
    out.push({ label: d.format('YYYY 年 M 月'), value: d.format('YYYY-MM') })
  }
  return out
})

/** 环比百分比：上月为 0 时返回 null（老版此时展示 0.0%） */
function deltaPct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return 0
  return ((cur - prev) / prev) * 100
}

const expDelta = computed(() => deltaPct(data.value?.cur.expense || 0, data.value?.prev.expense || 0))
const incDelta = computed(() => deltaPct(data.value?.cur.income || 0, data.value?.prev.income || 0))

/** 本月结余卡片的「共 N 笔 · 日均 ¥X」 */
const netHint = computed(() => {
  const d = data.value
  if (!d) return ''
  const daily = d.daysInMonth > 0 ? Math.round(d.cur.expense / d.daysInMonth) : 0
  return `共 ${d.cur.count} 笔 · 日均 ${fmtAmount(daily)}`
})

/** 净资产卡片的「资产 X · 负债 Y」 */
const netAssetHint = computed(() => {
  const o = data.value?.overview
  if (!o) return ''
  return `资产 ${fmtAmount(o.assets)} · 负债 ${fmtAmount(o.liabilities)}`
})

/** 今日支出（老版从 todayList 里筛 expense 求和） */
const todayExpense = computed(() => {
  const list = data.value?.todayList || []
  return list
    .filter((t: any) => t.is_expense)
    .reduce((s: number, t: any) => s + Number(t.amount_base_cents || 0), 0)
})

const trendData = computed(() => {
  const d = data.value
  if (!d?.trend) return { labels: [], series: [] as any[] }
  // echarts 轴单位为「元」，后端给的是 cents
  return {
    labels: d.trend.map((t: any) => dayjs(t.month + '-01').format('M月')),
    series: [
      { name: '支出', color: '#f5222d', data: d.trend.map((t: any) => Number(t.expense || 0) / 100) },
      { name: '收入', color: '#52c41a', data: d.trend.map((t: any) => Number(t.income || 0) / 100) },
    ],
  }
})

const donutItems = computed(() => {
  const cats = data.value?.cats || []
  return cats.map((c: any) => ({
    name: `${c.icon || ''} ${c.name}`.trim(),
    value: Number(c.total || 0),
    color: c.color,
  }))
})

const donutTotal = computed(() => data.value?.cur.expense || 0)

const recentGroups = computed(() => {
  const recs = data.value?.recent || []
  if (!recs.length) return []
  const byDate: Record<string, TxnItem[]> = {}
  for (const r of recs) {
    if (!byDate[r.txn_date]) byDate[r.txn_date] = []
    byDate[r.txn_date].push({ ...r, is_expense: r.type === 'expense' || r.type === 'fee' || r.type === 'repay_pay', is_income: r.type === 'income' || r.type === 'refund' || r.type === 'repay_receive' || r.type === 'interest', is_transfer: r.type === 'transfer' })
  }
  return Object.entries(byDate).map(([date, items]) => ({
    date, items, income: 0, expense: 0,
  })).sort((a, b) => b.date.localeCompare(a.date))
})

function onClickTxn(item: TxnItem) {
  router.push(`/transactions/${item.id}`)
}

function onMonthChange(e: Event) {
  router.replace({ query: { month: (e.target as HTMLSelectElement).value } })
}
</script>

<template>
  <AppShell>
    <PageHead :title="data?.monthLabel ? `总览 · ${data.monthLabel}` : '总览'" sub="你账本的本月概览">
      <template #actions>
        <NText depth="3" class="hint">月份</NText>
        <select :value="month" @change="onMonthChange" class="month-select">
          <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <div v-if="!data" class="empty-wrap">
        <Empty title="正在加载…" />
      </div>
      <div v-else-if="!data.hasLedger" class="empty-wrap">
        <Empty title="还没有账本" description="先创建一个账本开始记账" />
        <NButton type="primary" @click="router.push('/ledgers')">前往账本管理</NButton>
      </div>
      <template v-else>
        <!-- AI 未配置提示（老版 notice info） -->
        <NAlert v-if="!data.aiReady" type="info" class="mb12">
          还没有配置 AI 模型，截图记账目前只能使用内置规则解析。<a class="lnk" @click.prevent="router.push('/settings')">去配置 →</a>
        </NAlert>

        <!-- 四个统计卡：手机端 2 列（对齐旧版 .grid-4 @media），由 CSS 覆盖列数 -->
        <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stat-grid">
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月支出" :value="data.cur.expense" tone="expense" :delta="expDelta" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月收入" :value="data.cur.income" tone="income" :delta="incDelta" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月结余" :value="data.cur.net" :tone="data.cur.net >= 0 ? 'income' : 'expense'" :hint="netHint" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="净资产" :value="data.overview.net" :tone="data.overview.net >= 0 ? 'neutral' : 'expense'" :hint="netAssetHint" />
          </NGridItem>
        </NGrid>

        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="mt12">
          <!-- 左栏 -->
          <NGridItem span="3 m:3 l:2">
            <NCard size="small" :bordered="true" title="收支趋势">
              <template #header-extra>
                <NText depth="3" class="hint">近 6 个月</NText>
                <NButton text type="primary" size="small" @click="router.push('/reports')">详细报表 →</NButton>
              </template>
              <BarChart v-if="trendData.labels.length" :labels="trendData.labels" :series="trendData.series" height="220" />
              <Empty v-else title="趋势数据不足" />
            </NCard>

            <NCard size="small" :bordered="true" title="最近记录" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/transactions')">全部 →</NButton>
              </template>
              <TxnList :groups="recentGroups" @click-item="onClickTxn" />
            </NCard>

            <NCard size="small" :bordered="true" title="支出构成" class="mt12">
              <template #header-extra>
                <NText depth="3" class="hint">{{ data.monthLabel }}</NText>
              </template>
              <Empty v-if="!donutItems.length" title="本月还没有支出记录" />
              <div v-else class="donut-wrap">
                <div class="donut-fig">
                  <DonutChart
                    :items="donutItems"
                    :center-value="fmtAmount(donutTotal)"
                    center-title="本月支出"
                    :size="190"
                    :thickness="26"
                    height="190"
                  />
                </div>
                <div class="donut-legend">
                  <div v-for="it in donutItems" :key="it.name" class="legend-row">
                    <span class="dot" :style="{ background: it.color }" />
                    <span class="lname ellipsis">{{ it.name }}</span>
                    <span class="lbar"><i :style="{ width: donutTotal ? ((it.value / donutTotal) * 100).toFixed(1) + '%' : '0%', background: it.color }" /></span>
                    <span class="lpct">{{ donutTotal ? ((it.value / donutTotal) * 100).toFixed(1) : '0.0' }}%</span>
                    <span class="lval">{{ fmtAmount(it.value) }}</span>
                  </div>
                </div>
              </div>
            </NCard>
          </NGridItem>

          <!-- 右栏 -->
          <NGridItem span="3 m:3 l:1">
            <!-- 今日速览 -->
            <NCard size="small" :bordered="true" title="今日速览">
              <template #header-extra>
                <NText depth="3" class="hint">{{ dayjs().format('M月D日') }}</NText>
              </template>
              <div class="today-row">
                <div>
                  <div class="tiny muted">今日支出</div>
                  <div class="today-amt expense">{{ fmtAmount(todayExpense) }}</div>
                </div>
                <div class="right">
                  <div class="tiny muted">今日笔数</div>
                  <div class="today-amt">{{ (data.todayList || []).length }}</div>
                </div>
              </div>
              <div class="today-actions">
                <NButton type="primary" block @click="router.push('/transactions/new')">＋ 记一笔</NButton>
                <NButton block @click="router.push('/ai')">🤖 截图记账</NButton>
              </div>
            </NCard>

            <!-- 待报销 -->
            <NCard v-if="data.pendingReimburse?.count" size="small" :bordered="true" title="待报销" class="mt12">
              <div class="row-between">
                <NText>{{ data.pendingReimburse.count }} 笔待报销</NText>
                <span class="amount">{{ fmtAmount(data.pendingReimburse.sum) }}</span>
              </div>
              <NButton size="small" block class="mt8" @click="router.push('/transactions?reimbursable=yes')">去处理</NButton>
            </NCard>

            <!-- 预算进度 -->
            <NCard size="small" :bordered="true" title="预算进度" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/budgets')">管理 →</NButton>
              </template>
              <Empty v-if="!(data.budgets || []).length" title="还没有设置预算" description="创建一个预算，超支时会自动提醒你" />
              <div v-for="b in data.budgets" :key="b.id" class="budget-item">
                <div class="row-between small">
                  <span class="bold">{{ b.icon || '🎯' }} {{ b.name }}</span>
                  <span :class="b.ratio >= 100 ? 'amount expense' : 'muted'">
                    {{ fmtAmount(b.used) }} / {{ fmtAmount(b.amount_cents) }}
                  </span>
                </div>
                <NProgress
                  type="line"
                  :percentage="Math.min(b.ratio, 100)"
                  :show-indicator="false"
                  :height="8"
                  :status="b.ratio >= 100 ? 'error' : b.ratio > 80 ? 'warning' : 'success'"
                  class="mt8"
                />
                <div class="tiny muted mt8">
                  <template v-if="b.ratio >= 100">
                    已超支 {{ fmtAmount(b.used - b.amount_cents) }}
                  </template>
                  <template v-else>
                    还剩 {{ fmtAmount(b.amount_cents - b.used) }}（{{ b.rangeLabel }}）
                  </template>
                </div>
              </div>
            </NCard>

            <!-- 订阅扣费 -->
            <NCard size="small" :bordered="true" title="订阅扣费" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/subscriptions')">管理 →</NButton>
              </template>
              <Empty
                v-if="!(data.subs?.live || []).length"
                title="还没有订阅"
                description="把 Netflix、云盘、服务器这类自动续费登记进来，现在添加"
              />
              <template v-else>
                <div class="row-between small">
                  <NText depth="3">每月固定支出</NText>
                  <span class="amount expense bold">{{ fmtAmount(data.subs.monthlyTotal) }}</span>
                </div>
                <div class="row-between tiny muted mt8">
                  <span>全年 {{ fmtAmount(data.subs.annualTotal) }}</span>
                  <span>生效 {{ data.subs.live.length }} 项 · 本月待扣 {{ data.subs.dueThisMonth }}</span>
                </div>
                <div class="mt12">
                  <div v-for="s in data.subs.live.slice(0, 3)" :key="s.id" class="sub-row">
                    <span class="ellipsis">{{ s.icon }} {{ s.name }} <span class="muted">· {{ s.cycleLabel }}</span></span>
                    <span :class="s.daysLeft <= 3 ? 'amount expense' : 'muted'">
                      {{ String(s.next_charge_at || '').slice(5) }} {{ s.dueLabel }}
                    </span>
                  </div>
                </div>
              </template>
            </NCard>

            <!-- 账户余额 -->
            <NCard size="small" :bordered="true" title="账户余额" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/accounts')">管理 →</NButton>
              </template>
              <Empty v-if="!(data.overview.accounts || []).length" title="暂无账户" description="添加账户" />
              <template v-else>
                <div v-for="a in data.overview.accounts.slice(0, 6)" :key="a.id" class="acc-row">
                  <span>{{ a.icon }} {{ a.name }}</span>
                  <span class="amount" :class="{ neg: Number(a.balance_cents) < 0 }">{{ fmtAmount(a.balance_cents) }}</span>
                </div>
                <div v-if="data.overview.accounts.length > 6" class="tiny muted mt8">
                  还有 {{ data.overview.accounts.length - 6 }} 个账户…
                </div>
              </template>
            </NCard>

            <!-- 借贷 -->
            <NCard v-if="(data.debts || []).length" size="small" :bordered="true" title="借贷" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/debts')">查看 →</NButton>
              </template>
              <div v-for="d in data.debts" :key="d.direction" class="row-between debt-row">
                <span>{{ d.direction === 'receivable' ? '📥 别人欠我' : '📤 我欠别人' }}（{{ d.cnt }}）</span>
                <span class="amount" :class="d.direction === 'receivable' ? 'income' : 'expense'">{{ fmtAmount(d.total) }}</span>
              </div>
            </NCard>

            <!-- 储蓄目标 -->
            <NCard v-if="(data.goals || []).length" size="small" :bordered="true" title="储蓄目标" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/goals')">查看 →</NButton>
              </template>
              <div v-for="g in data.goals" :key="g.id" class="goal-item">
                <div class="row-between small">
                  <span>{{ g.icon }} {{ g.name }}</span>
                  <NText depth="3">{{ Math.min(100, (g.saved_cents / g.target_cents) * 100).toFixed(0) }}%</NText>
                </div>
                <NProgress type="line" :percentage="Math.min(100, (g.saved_cents / g.target_cents) * 100)" :show-indicator="false" :height="8" status="success" class="mt8" />
              </div>
            </NCard>

            <!-- 即将自动记账 -->
            <NCard v-if="(data.upcoming || []).length" size="small" :bordered="true" title="即将自动记账" class="mt12">
              <template #header-extra>
                <NButton text type="primary" size="small" @click="router.push('/recurring')">管理 →</NButton>
              </template>
              <div v-for="r in data.upcoming" :key="r.id" class="row-between small upcoming-row">
                <span>{{ r.name }}</span>
                <NText depth="3">{{ r.next_run_at }} · {{ r.auto_post ? '自动' : '提醒' }}</NText>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>
      </template>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.empty-wrap { padding: 40px 0; text-align: center; }
.mb12 { margin-bottom: 12px; }
.mt8 { margin-top: 8px; }
.mt12 { margin-top: 12px; }
.hint { font-size: 12px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tiny { font-size: 11px; }
.muted { color: var(--hl-muted, #8b95a5); }
.small { font-size: 12.5px; }
.bold { font-weight: 600; }
.row-between { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

/* 手机端统计卡改单列，避免大额金额换行 */
@media (max-width: 820px) {
  .stat-grid { grid-template-columns: minmax(0, 1fr) !important; }
  .stat-grid > * { grid-column: span 1 !important; }
}

.amount { font-variant-numeric: tabular-nums; }
.amount.income { color: var(--hl-income, #12a150); }
.amount.expense { color: var(--hl-expense, #e5484d); }
.lnk { color: var(--hl-primary, #18a058); text-decoration: underline; cursor: pointer; }

.month-select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  /* 与 naive 按钮同为 32px 高，使「月份」标签与下拉框文字基线一致 */
  font-family: inherit;
  line-height: 30px;
  color: var(--hl-text-2, #333639);
  cursor: pointer;
  max-width: 100%;
}

/* 今日速览 */
.today-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
.today-row .right { text-align: right; }
.today-amt { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.today-amt.expense { color: var(--hl-expense, #e5484d); }
.today-actions { display: flex; gap: 8px; }
/* 均分宽度并允许收缩，避免 block 按钮超出卡片 */
.today-actions > * { flex: 1 1 0; min-width: 0; }

/* 支出构成：环图 + 图例 */
.donut-wrap { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.donut-fig { flex: 0 0 190px; width: 190px; }
.donut-legend { flex: 1; min-width: 230px; display: flex; flex-direction: column; gap: 6px; }
.legend-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.legend-row .dot { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }
.legend-row .lname { flex: 0 1 84px; min-width: 0; }
.legend-row .lbar { flex: 1; height: 6px; border-radius: 3px; background: var(--hl-track, #eef0f4); overflow: hidden; min-width: 30px; }
.legend-row .lbar i { display: block; height: 100%; border-radius: 3px; }
.legend-row .lpct { width: 44px; text-align: right; color: var(--hl-muted, #8b95a5); font-variant-numeric: tabular-nums; }
.legend-row .lval { width: 72px; text-align: right; font-variant-numeric: tabular-nums; }

/* 各列表项 */
.budget-item { margin-bottom: 12px; }
.budget-item:last-child { margin-bottom: 0; }
.sub-row {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 4px 0; font-size: 11px;
  border-bottom: 1px dashed var(--hl-border, #e6eaf1);
}
.sub-row:last-child { border-bottom: none; }
.acc-row {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 6px 0; font-size: 13px;
  border-bottom: 1px dashed var(--hl-border, #e6eaf1);
}
.acc-row:last-child { border-bottom: none; }
.acc-row .amount.neg { color: var(--hl-expense, #e5484d); }
.debt-row, .upcoming-row { padding: 5px 0; }
.goal-item { margin-bottom: 12px; }
.goal-item:last-child { margin-bottom: 0; }
</style>
