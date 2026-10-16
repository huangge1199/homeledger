<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NButton, NSpace, NText, NTag, NSpin, NGrid, NGridItem } from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import StatCard from '@/components/StatCard.vue'
import BarChart from '@/components/BarChart.vue'
import DonutChart from '@/components/DonutChart.vue'
import LineChart from '@/components/LineChart.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import Empty from '@/components/Empty.vue'
import { DashboardApi } from '@/api/modules'
import { useSessionStore } from '@/stores/session'
import { errorMessage } from '@/api/client'
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

const stats = computed(() => {
  const d = data.value
  if (!d) return null
  return {
    income: d.cur.income,
    expense: d.cur.expense,
    net: d.cur.income - d.cur.expense,
    daily: d.days.length,
  }
})

const trendData = computed(() => {
  const d = data.value
  if (!d?.trend) return { labels: [], series: [{ name: '净流', data: [] }] }
  const labels = d.trend.map((t: any) => dayjs(t.month + '-01').format('M月'))
  const income = d.trend.map((t: any) => Number(t.income || 0))
  const expense = d.trend.map((t: any) => Number(t.expense || 0))
  return { labels, series: [
    { name: '收入', data: income },
    { name: '支出', data: expense },
  ] }
})

const catData = computed(() => {
  const cats = data.value?.cats || []
  if (!cats.length) return { labels: [], values: [] }
  const labels = cats.map((c: any) => c.icon + ' ' + c.name)
  const values = cats.map((c: any) => Number(c.total || 0))
  return { labels, values }
})

const dailyData = computed(() => {
  const d = data.value?.days || []
  const labels = d.map((x: any) => Number(x.date.slice(-2)))
  return { labels, series: [{ name: '支出', data: d.map((x: any) => Number(x.expense || 0)) }] }
})

const recentGroups = computed(() => {
  const recs = data.value?.recent || []
  if (!recs.length) return []
  // 按日期分组
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
</script>

<template>
  <AppShell>
    <PageHead :title="data?.monthLabel ? `总览 · ${data.monthLabel}` : '总览'" sub="你账本的本月概览">
      <template #actions>
        <NText depth="3" class="hint">月份</NText>
        <select :value="month" @change="(e: any) => router.replace({ query: { month: e.target.value } })" class="month-select">
          <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <NButton size="small" @click="router.push('/ai')">AI 记一笔</NButton>
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
        <!-- 数字卡 -->
        <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月收入" icon="💰" :value="stats?.income" tone="income" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月支出" icon="💸" :value="stats?.expense" tone="expense" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="本月结余" icon="🪙" :value="stats?.net" tone="neutral" />
          </NGridItem>
          <NGridItem span="1 m:1 l:1">
            <StatCard label="净资产" icon="📈" :value="data.overview.net" tone="neutral" />
          </NGridItem>
        </NGrid>

        <!-- 趋势 + 分类 -->
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="row-2">
          <NGridItem span="3 m:3 l:2">
            <NCard size="small" :bordered="true" title="近 6 个月收支趋势">
              <LineChart v-if="trendData.labels.length" :labels="trendData.labels" :series="trendData.series" height="220" />
              <Empty v-else title="趋势数据不足" />
            </NCard>
          </NGridItem>
          <NGridItem span="3 m:3 l:1">
            <NCard size="small" :bordered="true" title="本月支出分类 Top">
              <DonutChart
                v-if="catData.values.length"
                :items="catData.labels.map((l: string, i: number) => ({ name: l, value: catData.values[i] }))"
                :center-value="'¥' + (stats?.expense || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })"
                center-title="本月支出"
                height="220"
              />
              <Empty v-else title="本月暂无支出" />
            </NCard>
          </NGridItem>
        </NGrid>

        <NGrid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem span="2 m:2 l:1">
            <NCard size="small" :bordered="true" title="本月每日支出">
              <BarChart v-if="dailyData.labels.length" :labels="dailyData.labels" :series="dailyData.series" height="180" />
              <Empty v-else title="本月无支出" />
            </NCard>
          </NGridItem>
          <NGridItem span="2 m:2 l:1">
            <NCard size="small" :bordered="true" title="账户概览">
              <div v-if="data.overview.accounts?.length" class="acc-list">
                <div v-for="a in data.overview.accounts.slice(0, 6)" :key="a.id" class="acc-row">
                  <span class="ico">{{ a.icon || '💳' }}</span>
                  <span class="name ellipsis">{{ a.name }}</span>
                  <span class="amount" :class="{ neg: Number(a.balance_cents) < 0 }">
                    ¥{{ (Number(a.balance_cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
                  </span>
                </div>
              </div>
              <Empty v-else title="暂无账户" />
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- 最近交易 -->
        <NCard size="small" :bordered="true" class="row-2" title="最近交易">
          <template #header-extra>
            <NButton text type="primary" size="small" @click="router.push('/transactions')">查看全部</NButton>
          </template>
          <TxnList :groups="recentGroups" @click-item="onClickTxn" />
        </NCard>

        <!-- 待办/快捷 -->
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem span="3 m:1 l:1">
            <NCard size="small" :bordered="true" title="待报销">
              <div class="metric">¥{{ (data.pendingReimburse.sum / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</div>
              <NText depth="3" class="hint">共 {{ data.pendingReimburse.count }} 笔可报销</NText>
            </NCard>
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <NCard size="small" :bordered="true" title="订阅年支出预估">
              <div class="metric">¥{{ (data.subs.yearly / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</div>
              <NText depth="3" class="hint">月均 ¥{{ (data.subs.monthly / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }} · 活跃 {{ data.subs.activeCount || 0 }} 个</NText>
            </NCard>
          </NGridItem>
          <NGridItem span="3 m:1 l:1">
            <NCard size="small" :bordered="true" title="AI 状态">
              <div class="metric">
                <NTag :type="data.aiReady ? 'success' : 'default'">{{ data.aiReady ? '已配置' : '未配置' }}</NTag>
              </div>
              <NText depth="3" class="hint">{{ data.aiReady ? '可在「AI 截图记账」中上传账单' : '前往「设置 → AI」启用' }}</NText>
            </NCard>
          </NGridItem>
        </NGrid>
      </template>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.empty-wrap { padding: 40px 0; text-align: center; }
.row-2 { margin-top: 12px; }
.month-select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.hint { font-size: 12px; }

.acc-list { display: flex; flex-direction: column; gap: 4px; }
.acc-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}
.acc-row .ico { width: 24px; text-align: center; }
.acc-row .name { flex: 1; }
.acc-row .amount { font-variant-numeric: tabular-nums; }
.acc-row .amount.neg { color: var(--hl-expense, #e5484d); }

.metric { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; margin: 4px 0 6px; }
</style>
