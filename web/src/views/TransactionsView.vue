<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NSelect, NText, NInput, NTag, NSpin, NPopconfirm,
  NCheckbox, NDivider, NIcon, NInputNumber, NRadioGroup, NRadio,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import StatCard from '@/components/StatCard.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPES, TXN_TYPE_MAP, kindOf, flowOf } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()

/* ============================== 状态 ============================== */

// 筛选条件
const month = ref<string>(String(route.query.month || ''))
const typeFilter = ref<string>(String(route.query.type || ''))
const kindFilter = ref<string>(String(route.query.kind || ''))
const accountId = ref<number>(route.query.account_id ? Number(route.query.account_id) : 0)
const categoryId = ref<number>(route.query.category_id ? Number(route.query.category_id) : 0)
const memberId = ref<number>(route.query.member_id ? Number(route.query.member_id) : 0)
const sourceFilter = ref<string>(String(route.query.source || ''))
const from = ref<string>(String(route.query.from || ''))
const to = ref<string>(String(route.query.to || ''))
const keyword = ref<string>(String(route.query.q || ''))
const showReimbursable = ref<boolean>(String(route.query.reimbursable || '') === '1')
const sort = ref<string>(String(route.query.sort || 'date_desc'))
const page = ref<number>(Number(route.query.page) || 1)

// 列表
const loading = ref(true)
interface SumBucket { income: number; expense: number }
const list = ref<{
  items: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  groups: any[]
  sum: SumBucket
}>({
  items: [], total: 0, page: 1, pageSize: 40, totalPages: 0, groups: [], sum: { income: 0, expense: 0 },
})

// 选项
const accounts = ref<{ id: number; name: string; icon: string }[]>([])
const categories = ref<{ id: number; name: string; icon: string; color: string; kind: 'expense' | 'income' }[]>([])
const members = ref<{ id: number; name: string; color?: string }[]>([])

// 批量
const selected = ref<number[]>([])
const bulkMode = ref(false)
const reimburseAccountId = ref<number | null>(null)

// 同比：上月对比
const compare = ref<{ cur: SumBucket; prev: SumBucket; month: string } | null>(null)

/* ============================== 选项 ============================== */

const typeOptions = computed(() => [
  { label: '不限类型', value: '' },
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

const memberOptions = computed(() => [
  { label: '全部成员', value: 0 },
  ...members.value.map((m) => ({ label: m.name, value: m.id })),
])

const categoryOptions = computed(() => {
  const k = typeFilter.value ? kindOf(typeFilter.value) : kindFilter.value || 'all'
  return [
    { label: '全部分类', value: 0 },
    ...categories.value
      .filter((c) => k === 'all' || c.kind === k)
      .map((c) => ({ label: `${c.icon} ${c.name}`, value: c.id })),
  ]
})

const sortOptions = [
  { label: '最新在前', value: 'date_desc' },
  { label: '最早在前', value: 'date_asc' },
  { label: '金额从大到小', value: 'amount_desc' },
  { label: '金额从小到大', value: 'amount_asc' },
]

/* ============================== 快选 chips ============================== */

const today = dayjs().format('YYYY-MM-DD')
const curMonth = dayjs().format('YYYY-MM')
const yearStart = dayjs().startOf('year').format('YYYY-MM-DD')
const yearEnd = dayjs().endOf('year').format('YYYY-MM-DD')

interface Chip {
  label: string
  active: boolean
  apply: () => void
}
const timeChips = computed<Chip[]>(() => [
  { label: '全部', active: !month.value && !from.value && !to.value, apply: () => { month.value = ''; from.value = ''; to.value = ''; page.value = 1 } },
  { label: '本月', active: month.value === curMonth, apply: () => { month.value = curMonth; from.value = ''; to.value = ''; page.value = 1 } },
  { label: '近 7 天', active: false, apply: () => { month.value = ''; from.value = dayjs().subtract(6, 'day').format('YYYY-MM-DD'); to.value = today; page.value = 1 } },
  { label: '近 30 天', active: false, apply: () => { month.value = ''; from.value = dayjs().subtract(29, 'day').format('YYYY-MM-DD'); to.value = today; page.value = 1 } },
  { label: '今年', active: from.value === yearStart && to.value === yearEnd, apply: () => { month.value = ''; from.value = yearStart; to.value = yearEnd; page.value = 1 } },
])

const kindChips = computed<Chip[]>(() => [
  { label: '不限类型', active: !typeFilter.value && !kindFilter.value && !showReimbursable.value && !sourceFilter.value, apply: () => { typeFilter.value = ''; kindFilter.value = ''; showReimbursable.value = false; sourceFilter.value = ''; page.value = 1 } },
  { label: '只看支出', active: kindFilter.value === 'expense' && !typeFilter.value, apply: () => { typeFilter.value = ''; kindFilter.value = 'expense'; page.value = 1 } },
  { label: '只看收入', active: kindFilter.value === 'income' && !typeFilter.value, apply: () => { typeFilter.value = ''; kindFilter.value = 'income'; page.value = 1 } },
  { label: '只看转账', active: typeFilter.value === 'transfer', apply: () => { typeFilter.value = 'transfer'; kindFilter.value = ''; page.value = 1 } },
  { label: '待报销', active: showReimbursable.value, apply: () => { showReimbursable.value = !showReimbursable.value; page.value = 1 } },
  { label: 'AI 记账', active: sourceFilter.value === 'ai_screenshot', apply: () => { sourceFilter.value = sourceFilter.value === 'ai_screenshot' ? '' : 'ai_screenshot'; page.value = 1 } },
  { label: '导入', active: sourceFilter.value === 'import', apply: () => { sourceFilter.value = sourceFilter.value === 'import' ? '' : 'import'; page.value = 1 } },
  { label: '订阅', active: sourceFilter.value === 'subscription', apply: () => { sourceFilter.value = sourceFilter.value === 'subscription' ? '' : 'subscription'; page.value = 1 } },
])

function applyChip(c: Chip) { c.apply() }

/* ============================== 加载 ============================== */

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      pageSize: 50,
      page: page.value,
    }
    if (typeFilter.value) params.type = typeFilter.value
    else if (kindFilter.value) params.kind = kindFilter.value
    if (accountId.value) params.account_id = accountId.value
    if (categoryId.value) params.category_id = categoryId.value
    if (memberId.value) params.member_id = memberId.value
    if (sourceFilter.value) params.source = sourceFilter.value
    if (month.value) params.month = month.value
    if (from.value) params.from = from.value
    if (to.value) params.to = to.value
    if (keyword.value) params.q = keyword.value
    if (showReimbursable.value) params.reimbursable = '1'
    if (sort.value && sort.value !== 'date_desc') params.sort = sort.value

    const data = await TransactionsApi.list(params)
    // 标注每个 item 的 type 含义
    const items: TxnItem[] = (data.items || []).map((r: any) => ({
      id: r.id,
      txn_date: r.txn_date,
      txn_time: r.txn_time,
      type: r.type,
      type_label: TXN_TYPE_MAP[r.type]?.label,
      type_icon: TXN_TYPE_MAP[r.type]?.icon,
      amount_cents: Number(r.amount_cents || 0),
      currency: r.currency,
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
      tag_names: r.tag_names,
      member_name: r.member_name,
      status: r.status,
      is_reimbursable: r.is_reimbursable,
      source: r.source,
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
    list.value = {
      ...data,
      items, groups,
      sum: data.sum || { income: 0, expense: 0 },
    }

    // 同比：仅当锁定到某月时启用（避免全选时噪音太大）
    if (month.value) {
      const prev = dayjs(month.value + '-01').subtract(1, 'month').format('YYYY-MM')
      const [curData, prevData] = await Promise.all([
        TransactionsApi.list({ month: month.value, pageSize: 1 }),
        TransactionsApi.list({ month: prev, pageSize: 1 }),
      ])
      compare.value = {
        cur: curData.sum || { income: 0, expense: 0 },
        prev: prevData.sum || { income: 0, expense: 0 },
        month: month.value,
      }
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

/* ============================== 行为 ============================== */

function onClickItem(it: TxnItem) {
  router.push(`/transactions/${it.id}`)
}
function onEdit(it: TxnItem) {
  router.push(`/transactions/${it.id}/edit`)
}
async function onDelete(it: TxnItem) {
  try {
    await TransactionsApi.remove(it.id)
    success('已删除')
    selected.value = selected.value.filter((x) => x !== it.id)
    load()
  } catch (e) {
    toastError(errorMessage(e, '删除失败'))
  }
}
function clearFilters() {
  month.value = ''
  typeFilter.value = ''
  kindFilter.value = ''
  accountId.value = 0
  categoryId.value = 0
  memberId.value = 0
  sourceFilter.value = ''
  from.value = ''
  to.value = ''
  keyword.value = ''
  showReimbursable.value = false
  page.value = 1
}

const hasFilter = computed(() =>
  !!month.value || !!typeFilter.value || !!kindFilter.value || !!accountId.value
  || !!categoryId.value || !!memberId.value || !!sourceFilter.value
  || !!from.value || !!to.value || !!keyword.value || !!showReimbursable.value
)

/* ============================== 批量 ============================== */

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
async function bulkReimburse() {
  if (!selected.value.length) return
  try {
    const r = await TransactionsApi.bulk({
      ids: selected.value,
      action: 'reimburse',
      account_id: reimburseAccountId.value || undefined,
    })
    const data = r.data || r
    success(`已报销 ${data.count ?? selected.value.length} 笔，合计 ¥${((data.total || 0) / 100).toFixed(2)}`)
    selected.value = []
    reimburseAccountId.value = null
    load()
  } catch (e) {
    toastError(errorMessage(e, '报销失败'))
  }
}
async function bulkCategory(categoryId: number | null) {
  if (!selected.value.length || !categoryId) return
  try {
    await TransactionsApi.bulk({ ids: selected.value, action: 'category', category_id: categoryId })
    success(`已修改 ${selected.value.length} 条的分类`)
    load()
  } catch (e) {
    toastError(errorMessage(e, '改分类失败'))
  }
}
async function bulkTag(tag: string) {
  if (!selected.value.length || !tag.trim()) return
  try {
    await TransactionsApi.bulk({ ids: selected.value, action: 'tag', tag: tag.trim() })
    success(`已为 ${selected.value.length} 条添加标签「${tag.trim()}」`)
    load()
  } catch (e) {
    toastError(errorMessage(e, '加标签失败'))
  }
}

/* ============================== 初始化 / 同步 ============================== */

onMounted(async () => {
  // 加载筛选选项
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
    members.value = (fd.members || []).map((m: any) => ({
      id: m.user_id,
      name: m.display_name,
    }))
  } catch (e) { /* ignore */ }
  load()
})

// URL 同步
watch(
  [month, typeFilter, kindFilter, accountId, categoryId, memberId, sourceFilter, showReimbursable, from, to, sort, page],
  () => {
    const q: Record<string, string> = {}
    if (month.value) q.month = month.value
    if (typeFilter.value) q.type = typeFilter.value
    if (kindFilter.value) q.kind = kindFilter.value
    if (accountId.value) q.account_id = String(accountId.value)
    if (categoryId.value) q.category_id = String(categoryId.value)
    if (memberId.value) q.member_id = String(memberId.value)
    if (sourceFilter.value) q.source = sourceFilter.value
    if (from.value) q.from = from.value
    if (to.value) q.to = to.value
    if (keyword.value) q.q = keyword.value
    if (showReimbursable.value) q.reimbursable = '1'
    if (sort.value && sort.value !== 'date_desc') q.sort = sort.value
    if (page.value && page.value > 1) q.page = String(page.value)
    router.replace({ query: q })
    load()
  }
)

// 关键字查询：防抖
let kwTimer: number | undefined
watch(keyword, (v) => {
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = window.setTimeout(() => {
    router.replace({ query: { ...route.query, q: v || undefined } })
    page.value = 1
    load()
  }, 400)
})

// 同步回 ledger 切换
watch(() => session.currentLedger?.id, () => load())
</script>

<template>
  <AppShell>
    <PageHead title="账单明细" sub="支持按月/类型/分类/账户/成员/关键字筛选">
      <template #actions>
        <NButton v-if="hasFilter" size="small" quaternary @click="clearFilters">清空筛选</NButton>
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
          :value="compare.cur.income - compare.cur.expense"
          :tone="(compare.cur.income - compare.cur.expense) >= 0 ? 'income' : 'expense'"
          :delta="compare.prev.expense ? ((compare.cur.expense - compare.prev.expense) / Math.max(1, compare.prev.expense)) * 100 : null"
          reverse-delta
          :hint="`上月 ¥${(compare.prev.expense/100).toFixed(2)}`"
        />
      </NGridItem>
    </NGrid>

    <!-- 筛选 chips + 表单 -->
    <NCard :bordered="true" size="small" class="filter-card">
      <!-- 时间快选 -->
      <div class="chip-row">
        <NTag
          v-for="c in timeChips"
          :key="c.label"
          round
          checkable
          :checked="c.active"
          @update:checked="applyChip(c)"
        >{{ c.label }}</NTag>
      </div>
      <!-- 类型快选 -->
      <div class="chip-row">
        <NTag
          v-for="c in kindChips"
          :key="c.label"
          round
          checkable
          :checked="c.active"
          @update:checked="applyChip(c)"
        >{{ c.label }}</NTag>
      </div>

      <NDivider style="margin: 10px 0" />

      <!-- 详细筛选 -->
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
          <NSelect
            v-model:value="memberId"
            :options="memberOptions"
            size="small"
            placeholder="成员"
            clearable
          />
        </NGridItem>
        <NGridItem span="6 m:2 l:2">
          <NSelect
            v-model:value="sort"
            :options="sortOptions"
            size="small"
          />
        </NGridItem>
      </NGrid>

      <div class="filter-extra">
        <NInput v-model:value="keyword" placeholder="搜索备注 / 商家 / 分类 / 金额" size="small" clearable class="kw" />
        <NSpace size="small" :wrap="true">
          <NCheckbox v-model:checked="showReimbursable">仅看可报销</NCheckbox>
        </NSpace>
      </div>
    </NCard>

    <!-- 汇总行 -->
    <div class="summary">
      <span class="item">共 <b>{{ list.total }}</b> 笔</span>
      <span class="item">支出 <b class="amt expense"><AmountDisplay :cents="list.sum.expense" :sign="false" tone="expense" /></b></span>
      <span class="item">收入 <b class="amt income"><AmountDisplay :cents="list.sum.income" :sign="false" tone="income" /></b></span>
      <span class="item">结余
        <b :class="['amt', (list.sum.income - list.sum.expense) >= 0 ? 'income' : 'expense']">
          <AmountDisplay :cents="list.sum.income - list.sum.expense" :sign="true" :tone="(list.sum.income - list.sum.expense) >= 0 ? 'income' : 'expense'" />
        </b>
      </span>
    </div>

    <!-- 列表 -->
    <NCard :bordered="true" class="list-card">
      <NSpin :show="loading">
        <Empty v-if="!loading && !list.total" icon="🗒️" title="还没有记录" description="点右上角「记一笔」开始，或上传账单截图让 AI 帮你记" />
        <TxnList
          v-else
          :groups="list.groups"
          :bulk="bulkMode"
          :selected="selected"
          :show-actions="!bulkMode"
          @update:selected="(v: number[]) => selected = v"
          @click-item="onClickItem"
          @edit="onEdit"
          @delete="onDelete"
        />
      </NSpin>
    </NCard>

    <!-- 分页 -->
    <div v-if="list.totalPages > 1" class="pager">
      <NButton size="small" :disabled="page <= 1" @click="page = Math.max(1, page - 1)">上一页</NButton>
      <span class="cur">{{ page }} / {{ list.totalPages }}</span>
      <NButton size="small" :disabled="page >= list.totalPages" @click="page = Math.min(list.totalPages, page + 1)">下一页</NButton>
    </div>

    <!-- 批量操作条 -->
    <Transition name="fade">
      <div v-if="bulkMode && selected.length" class="bulk-bar">
        <NText>已选 {{ selected.length }} 条：</NText>
        <NSpace size="small" :wrap="true" class="bulk-ops">
          <NPopconfirm @positive-click="bulkDelete" positive-text="删除" negative-text="取消">
            <template #trigger><NButton size="small" type="error" ghost>删除</NButton></template>
            确定要删除选中的 {{ selected.length }} 条记录吗？
          </NPopconfirm>
          <NPopconfirm @positive-click="bulkRestore" positive-text="恢复" negative-text="取消">
            <template #trigger><NButton size="small" ghost>恢复</NButton></template>
            恢复选中的 {{ selected.length }} 条记录（从已删除中恢复）？
          </NPopconfirm>
          <NButton size="small" @click="bulkReimbursable">标记为可报销</NButton>
          <NSelect
            v-model:value="reimburseAccountId"
            :options="accountOptions"
            size="small"
            placeholder="报销入账账户"
            class="reimburse-acc"
          />
          <NPopconfirm @positive-click="bulkReimburse" positive-text="报销入账" negative-text="取消">
            <template #trigger>
              <NButton size="small" type="primary" :disabled="!selected.length">报销入账</NButton>
            </template>
            将选中的 {{ selected.length }} 条已标记「可报销」的记录入账到「{{ reimburseAccountId ? (accounts.find(a => a.id === reimburseAccountId)?.name) : '默认账户' }}」？
          </NPopconfirm>
          <NButton size="small" quaternary @click="selected = []">清空选择</NButton>
        </NSpace>
      </div>
    </Transition>
  </AppShell>
</template>

<style scoped>
.stats { margin-bottom: 12px; }
.filter-card { margin-bottom: 12px; }
.list-card { padding: 0; }

/* chips 行：与老版 .chip-row 同构 */
.chip-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 8px;
}
.chip-row:last-of-type { margin-bottom: 0; }

/* 详细筛选下方的搜索 + 待报销 */
.filter-extra {
  display: flex; gap: 12px; align-items: center;
  margin-top: 10px; flex-wrap: wrap;
}
.kw { flex: 1; min-width: 240px; }

/* 汇总行：老版 .row.between + 三段统计 */
.summary {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  padding: 4px 4px 10px; font-size: 13px;
  color: var(--hl-text-2, #45516a);
}
.summary .item b { font-weight: 600; }
.summary .amt { font-variant-numeric: tabular-nums; }
.summary .amt.expense { color: var(--hl-expense, #e5484d); }
.summary .amt.income  { color: var(--hl-income,  #12a150); }

/* 分页：居中 */
.pager {
  display: flex; gap: 12px; align-items: center; justify-content: center;
  margin: 16px 0; color: var(--hl-muted, #7d8aa3); font-size: 13px;
}
.pager .cur { font-variant-numeric: tabular-nums; }

/* 批量操作条：sticky 底部 */
.bulk-bar {
  position: sticky; bottom: 8px; z-index: 40;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--hl-card, #fff);
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .08);
}
.bulk-ops { flex: 1; }
.reimburse-acc { min-width: 160px; max-width: 200px; }

.fade-enter-active, .fade-leave-active { transition: all .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
