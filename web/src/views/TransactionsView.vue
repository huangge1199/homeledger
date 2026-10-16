<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NSelect, NText, NInput, NTag, NSpin, NGrid, NGridItem,
  NPopconfirm, NCheckbox, NDivider, NAlert, NIcon,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import StatCard from '@/components/StatCard.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import Empty from '@/components/Empty.vue'
import { TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPES, TXN_TYPE_MAP, kindOf, flowOf } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()

// 筛选
const month = ref<string>(String(route.query.month || ''))
const typeFilter = ref<string>(String(route.query.type || ''))
const accountId = ref<number>(route.query.account_id ? Number(route.query.account_id) : 0)
const categoryId = ref<number>(route.query.category_id ? Number(route.query.category_id) : 0)
const keyword = ref<string>(String(route.query.q || ''))
const showReimbursable = ref<boolean>(String(route.query.reimbursable || '') === '1')

// 列表
const loading = ref(true)
const list = ref<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number; groups: any[] }>({
  items: [], total: 0, page: 1, pageSize: 40, totalPages: 0, groups: [],
})

// 选项
const accounts = ref<{ id: number; name: string; icon: string }[]>([])
const categories = ref<{ id: number; name: string; icon: string; color: string; kind: 'expense' | 'income' }[]>([])

// 批量
const selected = ref<number[]>([])
const bulkMode = ref(false)

// 同比：上月对比
const compare = ref<{ cur: any; prev: any; month: string } | null>(null)

const typeOptions = computed(() => [
  { label: '全部', value: '' },
  ...TXN_TYPES.map((t) => ({ label: `${t.icon} ${t.label}`, value: t.key })),
])

const monthOptions = computed(() => {
  const out: { label: string; value: string }[] = [{ label: '全部月份', value: '' }]
  const cur = dayjs()
  for (let i = 0; i < 12; i++) {
    const d = cur.subtract(i, 'month')
    out.push({ label: d.format('YYYY 年 M 月'), value: d.format('YYYY-MM') })
  }
  return out
})

const accountOptions = computed(() => [
  { label: '全部账户', value: 0 },
  ...accounts.value.map((a) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])

const categoryOptions = computed(() => {
  const k = typeFilter.value ? kindOf(typeFilter.value) : 'all'
  return [
    { label: '全部分类', value: 0 },
    ...categories.value
      .filter((c) => k === 'all' || c.kind === k)
      .map((c) => ({ label: `${c.icon} ${c.name}`, value: c.id })),
  ]
})

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      pageSize: 50,
      page: 1,
    }
    if (typeFilter.value) params.type = typeFilter.value
    if (accountId.value) params.account_id = accountId.value
    if (categoryId.value) params.category_id = categoryId.value
    if (keyword.value) params.q = keyword.value
    if (month.value) params.month = month.value
    if (showReimbursable.value) params.reimbursable = '1'

    const data = await TransactionsApi.list(params)
    // 标注每个 item 的 type 含义
    const items: TxnItem[] = (data.items || []).map((r: any) => ({
      id: r.id,
      txn_date: r.txn_date,
      type: r.type,
      type_label: TXN_TYPE_MAP[r.type]?.label,
      type_icon: TXN_TYPE_MAP[r.type]?.icon,
      amount_cents: Number(r.amount_cents || 0),
      is_expense: flowOf(r.type) === 'out',
      is_income: flowOf(r.type) === 'in',
      is_transfer: r.type === 'transfer',
      category_id: r.category_id,
      category_name: r.category_name,
      category_icon: r.category_icon,
      category_color: r.category_color,
      category_parent: r.category_parent,
      account_id: r.account_id,
      account_name: r.account_name,
      to_account_name: r.to_account_name,
      merchant: r.merchant,
      note: r.note,
      tags: r.tags,
      status: r.status,
      is_reimbursable: r.is_reimbursable,
      attachment_count: r.attachment_count,
    }))
    // 按日期分组（TxnList 需要的格式）
    const byDate: Record<string, { items: TxnItem[]; income: number; expense: number }> = {}
    for (const it of items) {
      if (!byDate[it.txn_date]) byDate[it.txn_date] = { items: [], income: 0, expense: 0 }
      byDate[it.txn_date].items.push(it)
      if (it.is_income) byDate[it.txn_date].income += it.amount_cents
      if (it.is_expense) byDate[it.txn_date].expense += it.amount_cents
    }
    const groups = Object.entries(byDate)
      .map(([date, g]) => ({ date, ...g }))
      .sort((a, b) => b.date.localeCompare(a.date))
    list.value = { ...data, items, groups }

    // 同比：加载上月数据
    if (month.value) {
      const prev = dayjs(month.value + '-01').subtract(1, 'month').format('YYYY-MM')
      const prevData = await TransactionsApi.list({ month: prev, pageSize: 1 })
      const curData = await TransactionsApi.list({ month: month.value, pageSize: 1 })
      const curSum = sumOf(curData.items)
      const prevSum = sumOf(prevData.items)
      compare.value = { cur: curSum, prev: prevSum, month: month.value }
    } else {
      compare.value = null
    }
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

function sumOf(items: any[]) {
  let income = 0, expense = 0
  for (const it of items || []) {
    if (flowOf(it.type) === 'in') income += Number(it.amount_cents || 0)
    else if (flowOf(it.type) === 'out') expense += Number(it.amount_cents || 0)
  }
  return { income, expense, net: income - expense }
}

// 跳详情
function onClickItem(it: TxnItem) {
  router.push(`/transactions/${it.id}`)
}

// 批量
async function bulkDelete() {
  if (!selected.value.length) return
  try {
    const r = await TransactionsApi.bulk({ ids: selected.value, action: 'delete' })
    success(`已删除 ${r.data?.affected ?? selected.value.length} 条`)
    selected.value = []
    load()
  } catch (e) {
    toastError(errorMessage(e, '批量删除失败'))
  }
}
async function bulkReimbursable() {
  if (!selected.value.length) return
  try {
    await TransactionsApi.bulk({ ids: selected.value, action: 'reimbursable' })
    success(`已标记 ${selected.value.length} 条为可报销`)
    selected.value = []
    load()
  } catch (e) {
    toastError(errorMessage(e, '操作失败'))
  }
}
async function bulkRestore() {
  if (!selected.value.length) return
  try {
    await TransactionsApi.bulk({ ids: selected.value, action: 'restore' })
    success(`已恢复 ${selected.value.length} 条`)
    selected.value = []
    load()
  } catch (e) {
    toastError(errorMessage(e, '恢复失败'))
  }
}

onMounted(async () => {
  // 加载筛选选项
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
  } catch (e) { /* ignore */ }
  load()
})

// URL 同步
watch([month, typeFilter, accountId, categoryId, showReimbursable], () => {
  const q: Record<string, string> = {}
  if (month.value) q.month = month.value
  if (typeFilter.value) q.type = typeFilter.value
  if (accountId.value) q.account_id = String(accountId.value)
  if (categoryId.value) q.category_id = String(categoryId.value)
  if (showReimbursable.value) q.reimbursable = '1'
  if (keyword.value) q.q = keyword.value
  router.replace({ query: q })
  load()
})

// 关键字查询：防抖
let kwTimer: number | undefined
watch(keyword, (v) => {
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = window.setTimeout(() => {
    router.replace({ query: { ...route.query, q: v || undefined } })
    load()
  }, 400)
})

// 同步回 ledger 切换
watch(() => session.currentLedger?.id, () => load())
</script>

<template>
  <AppShell>
    <PageHead title="账单明细" sub="支持按月/分类/账户/标签/关键字筛选">
      <template #actions>
        <NButton :type="bulkMode ? 'primary' : 'default'" @click="bulkMode = !bulkMode">
          {{ bulkMode ? '退出批量' : '批量操作' }}
        </NButton>
        <NButton type="primary" @click="router.push('/transactions/new')">
          ＋ 记一笔
        </NButton>
      </template>
    </PageHead>

    <!-- 同比 -->
    <NGrid v-if="compare" :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
      <NGridItem span="3 m:1 l:1">
        <StatCard label="本月收入" icon="💰" :value="compare.cur.income" tone="income" />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard label="本月支出" icon="💸" :value="compare.cur.expense" tone="expense" />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard
          label="收支差"
          icon="🪙"
          :value="compare.cur.net"
          :tone="compare.cur.net >= 0 ? 'income' : 'expense'"
          :delta="compare.prev.expense ? ((compare.cur.expense - compare.prev.expense) / Math.max(1, compare.prev.expense)) * 100 : null"
          reverse-delta
          :hint="`上月 ¥${(compare.prev.expense/100).toFixed(2)}`"
        />
      </NGridItem>
    </NGrid>

    <!-- 筛选器 -->
    <NCard :bordered="true" size="small" class="filter-card">
      <NGrid :cols="6" :x-gap="12" :y-gap="8" responsive="screen" :item-responsive="true">
        <NGridItem span="6 m:2 l:2">
          <NSelect v-model:value="month" :options="monthOptions" size="small" />
        </NGridItem>
        <NGridItem span="6 m:2 l:2">
          <NSelect v-model:value="typeFilter" :options="typeOptions" size="small" placeholder="类型" />
        </NGridItem>
        <NGridItem span="6 m:2 l:2">
          <NSelect
            v-model:value="accountId"
            :options="accountOptions"
            size="small"
            placeholder="账户"
            clearable
          />
        </NGridItem>
        <NGridItem span="6 m:2 l:2">
          <NSelect
            v-model:value="categoryId"
            :options="categoryOptions"
            size="small"
            placeholder="分类"
            clearable
            filterable
          />
        </NGridItem>
        <NGridItem span="6 m:2 l:2">
          <NInput v-model:value="keyword" placeholder="关键字搜索" size="small" clearable />
        </NGridItem>
        <NGridItem span="6 m:2 l:2" class="reimbursable-cell">
          <NCheckbox v-model:checked="showReimbursable">仅看可报销</NCheckbox>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 批量操作条 -->
    <Transition name="fade">
      <div v-if="bulkMode && selected.length" class="bulk-bar">
        <NText>已选 {{ selected.length }} 条</NText>
        <NSpace size="small">
          <NButton size="small" @click="bulkReimbursable">标记为可报销</NButton>
          <NPopconfirm @positive-click="bulkRestore" positive-text="恢复" negative-text="取消">
            <template #trigger><NButton size="small" ghost>恢复</NButton></template>
            恢复选中的 {{ selected.length }} 条记录（从已删除中恢复）？
          </NPopconfirm>
          <NPopconfirm @positive-click="bulkDelete" positive-text="删除" negative-text="取消">
            <template #trigger><NButton size="small" type="error" ghost>删除</NButton></template>
            确定要删除选中的 {{ selected.length }} 条记录吗？
          </NPopconfirm>
          <NButton size="small" quaternary @click="selected = []">清空选择</NButton>
        </NSpace>
      </div>
    </Transition>

    <!-- 列表 -->
    <NCard :bordered="true" class="list-card">
      <NSpin :show="loading">
        <Empty v-if="!loading && !list.total" icon="🗒️" title="还没有记录" description="点右上角「记一笔」开始，或上传账单截图让 AI 帮你记" />
        <TxnList
          v-else
          :groups="list.groups"
          :bulk="bulkMode"
          :selected="selected"
          @update:selected="(v: number[]) => selected = v"
          @click-item="onClickItem"
        />
      </NSpin>
    </NCard>
  </AppShell>
</template>

<style scoped>
.stats { margin-bottom: 12px; }
.filter-card { margin-bottom: 12px; }
.list-card { padding: 0; }
.bulk-bar {
  background: #fff;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 8px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  background: linear-gradient(180deg, var(--hl-card) 0%, var(--hl-primary-2) 200%);
}
.reimbursable-cell { display: flex; align-items: center; }
.fade-enter-active, .fade-leave-active { transition: all .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
