<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NButton, NSpace, NText, NTag, NInput, NSelect, NSpin } from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import DatePickerWrap from '@/components/DatePickerWrap.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import { DashboardApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPE_MAP, flowOf } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(false)
const data = ref<any>({ rows: [], total: 0, sum: { income: 0, expense: 0 } })
/** 后端按日分组结果（顶层字段，非 result 内） */
const groups = ref<any[]>([])

/* ------------------------------ 日期默认区间：当月 1 号 ~ 今天 ------------------------------ */

/**
 * 'YYYY-MM-DD HH:mm:ss' 默认区间构造（页面进来自带，防止空列表）。
 * 如果 URL 里已经带了 from/to（分享/刷新进来），优先用 URL 的值。
 */
function defaultMonthRange(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return {
    from: `${y}-${m}-01 00:00:00`,
    to: `${y}-${m}-${d} 23:59:59`,
  }
}

const _def = defaultMonthRange()
/** 兼容 URL query：纯日期补时间，没有 from/to 用默认当月区间 */
function resolveDateTime(s: any, fallback: string): string {
  if (!s || Array.isArray(s)) return fallback
  const v = String(s)
  // URL 里可能是纯日期（YYYY-MM-DD），补全时分秒
  return v.length === 10 ? `${v} ${fallback.slice(11)}` : v
}

/* 筛选条件：from/to 为 'YYYY-MM-DD HH:mm:ss' 字符串（DatePickerWrap type="datetime"） */
const f = ref<any>({
  q: route.query.q || '',
  type: route.query.type || '',
  category_id: Number(route.query.category_id) || 0,
  account_id: Number(route.query.account_id) || 0,
  member_id: Number(route.query.member_id) || 0,
  tag_id: Number(route.query.tag_id) || 0,
  source: route.query.source || '',
  from: resolveDateTime(route.query.from, _def.from),
  to: resolveDateTime(route.query.to, _def.to),
  min: route.query.min || '',
  max: route.query.max || '',
  sort: route.query.sort || 'date_desc',
  page: Number(route.query.page) || 1,
})

const accounts = ref<any[]>([])
const categories = ref<any[]>([])
const members = ref<any[]>([])
const tags = ref<any[]>([])

async function loadOptions() {
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
    members.value = fd.members || []
    tags.value = fd.tags || []
  } catch { /* ignore */ }
}

async function search(page: number = 1) {
  if (!session.currentLedger) return
  loading.value = true
  f.value.page = page
  // 同步 URL（筛选条件全部进 query，刷新/分享可还原）
  const q: Record<string, any> = {}
  if (f.value.q) q.q = f.value.q
  if (f.value.type) q.type = f.value.type
  if (f.value.category_id) q.category_id = f.value.category_id
  if (f.value.account_id) q.account_id = f.value.account_id
  if (f.value.member_id) q.member_id = f.value.member_id
  if (f.value.tag_id) q.tag_id = f.value.tag_id
  if (f.value.source) q.source = f.value.source
  if (f.value.from) q.from = f.value.from
  if (f.value.to) q.to = f.value.to
  if (f.value.min) q.min = f.value.min
  if (f.value.max) q.max = f.value.max
  if (f.value.sort && f.value.sort !== 'date_desc') q.sort = f.value.sort
  if (page > 1) q.page = page
  router.replace({ query: q })

  try {
    const d = await DashboardApi.search({
      q: f.value.q,
      type: f.value.type,
      category_id: f.value.category_id || '',
      account_id: f.value.account_id || '',
      member_id: f.value.member_id || '',
      tag_id: f.value.tag_id || '',
      source: f.value.source || '',
      from: f.value.from,
      to: f.value.to,
      min: f.value.min,
      max: f.value.max,
      sort: f.value.sort,
      page: f.value.page,
    })
    data.value = d.result || { rows: [], total: 0, sum: { income: 0, expense: 0 } }
    // 后端把按日分组放在顶层（data.groups），分组源是 result.rows
    groups.value = d.groups || []
  } catch (e) {
    toastError(errorMessage(e, '搜索失败'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadOptions()
  // 每次进页面都搜（默认就有当月 1 号 ~ 今天的 from/to 区间，不会空）
  search(Number(route.query.page) || 1)
})

/* ------------------------------ 选项 ------------------------------ */

const typeOptions = [
  { label: '全部', value: '' },
  ...Object.entries(TXN_TYPE_MAP).map(([k, v]) => ({ label: `${v.icon} ${v.label}`, value: k })),
]
const accountOptions = computed<{ label: string; value: number }[]>(() => [
  { label: '全部账户', value: 0 },
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])
/**
 * 分类下拉：只列二级分类，带「收/支」前缀与「一级/二级」路径
 * （对齐老版 search.ejs 13-15 行：`if (c.parent_id)` + `c.kind` + `c.path`）
 */
const categoryOptions = computed<{ label: string; value: number }[]>(() => {
  const out: { label: string; value: number }[] = [{ label: '全部分类', value: 0 }]
  for (const kind of ['expense', 'income'] as const) {
    for (const c of categories.value.filter((x: any) => x.kind === kind && x.parent_id)) {
      out.push({ label: `${kind === 'income' ? '收' : '支'} · ${c.path || c.name}`, value: c.id })
    }
  }
  return out
})
/**
 * 成员下拉：value 必须是 user_id（后端按 t.user_id 匹配）
 * ledger_members.id 是「成员关系行」ID，用错会筛出错误的人
 */
const memberOptions = computed<{ label: string; value: number }[]>(() => [
  { label: '全部成员', value: 0 },
  ...members.value.map((m: any) => ({ label: m.display_name || m.username, value: m.user_id })),
])
const tagOptions = computed<{ label: string; value: number }[]>(() => [
  { label: '全部标签', value: 0 },
  ...tags.value.map((t: any) => ({ label: `#${t.name}`, value: t.id })),
])
/** 来源筛选（老版 search.ejs 25-32 行） */
const sourceOptions = [
  { label: '全部来源', value: '' },
  { label: '手动记账', value: 'manual' },
  { label: 'AI 截图', value: 'ai_screenshot' },
  { label: 'AI 文字', value: 'ai_text' },
  { label: '账单导入', value: 'import' },
  { label: '周期账单', value: 'recurring' },
]
const sortOptions = [
  { label: '最新在前', value: 'date_desc' },
  { label: '最早在前', value: 'date_asc' },
  { label: '金额从大到小', value: 'amount_desc' },
  { label: '金额从小到大', value: 'amount_asc' },
]

/* ------------------------------ 起止日期联动 ------------------------------ */

/** 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss' → 毫秒时间戳 */
function toTs(s: string): number | null {
  if (!s) return null
  const d = new Date(String(s).replace(' ', 'T'))
  return Number.isFinite(d.getTime()) ? d.getTime() : null
}
const fromTs = computed(() => toTs(f.value.from))
/**
 * 结束日期面板：不能早于起始日期。
 * naive 的 is-date-disabled 回调参数 ts 是面板上那个日期时间点的毫秒值。
 * 注意：我们禁用的是「严格早于起始」的时刻，起始当天 00:00 及之后都允许。
 */
const disableBeforeFrom = (ts: number) => fromTs.value !== null && ts < fromTs.value

// 起始日期被改到结束日期之后时，把结束日期顺延（YYYY-MM-DD HH:mm:ss 格式天然可字典序比较）
watch(() => f.value.from, (v: string) => {
  if (!v || !f.value.to) return
  if (v > f.value.to) {
    // 顺延到同一天的 23:59:59（保持结束端的"当天末尾"语义）
    f.value.to = `${v.slice(0, 10)} 23:59:59`
  }
})

function reset() {
  const d = defaultMonthRange()
  f.value = {
    q: '', type: '', category_id: 0, account_id: 0, member_id: 0,
    tag_id: 0, source: '', from: d.from, to: d.to, min: '', max: '', sort: 'date_desc', page: 1,
  }
  data.value = { rows: [], total: 0, sum: { income: 0, expense: 0 } }
  groups.value = []
  router.replace({ query: {} })
  search(1)  // reset 后用默认当月区间立刻出结果
}

/* ------------------------------ 结果列表 ------------------------------ */

/** 后端行 → TxnList 需要的结构（与 TransactionsView 的 toItem 同口径） */
function toItem(r: any): TxnItem {
  return {
    id: r.id,
    txn_date: r.txn_date,
    txn_time: r.txn_time,
    type: r.type,
    type_label: r.type_label,
    type_icon: r.type_icon,
    amount_cents: r.amount_cents,
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
    reimbursed_at: r.reimbursed_at,
    source: r.source,
    attachment_count: r.attachment_count,
  }
}

/** 按日分组（后端 groupByDate，统计口径与 sum 一致） */
const txnGroups = computed(() =>
  groups.value.map((g: any) => ({
    date: g.date,
    income: Number(g.income || 0),
    expense: Number(g.expense || 0),
    items: (g.items || []).map(toItem),
  }))
)

const hasQuery = computed(() =>
  !!(f.value.q || f.value.type || f.value.category_id || f.value.account_id || f.value.member_id
    || f.value.tag_id || f.value.source || f.value.from || f.value.to || f.value.min || f.value.max)
)

/** 点击分类名 → 按该分类重新筛选（老版 txn-cat 链接） */
function onFilterCategory(categoryId: number) {
  f.value.category_id = categoryId
  search(1)
}
</script>

<template>
  <AppShell>
    <PageHead title="搜索" sub="按关键字、类型、分类、账户、成员、标签、来源、日期、金额搜索">
      <template #actions>
        <NButton v-if="hasQuery" @click="reset">清空筛选</NButton>
        <NButton type="primary" :loading="loading" @click="search(1)">🔍 搜索</NButton>
      </template>
    </PageHead>

    <!-- 筛选 -->
    <NCard :bordered="true" size="small" class="filters">
      <NSpace vertical :size="12">
        <NInput
          v-model:value="f.q"
          placeholder="关键字：备注 / 商家 / 分类 / 金额"
          clearable
          size="large"
          @keyup.enter="search(1)"
        >
          <template #prefix>🔍</template>
        </NInput>
        <div class="row">
          <NSelect v-model:value="f.type" :options="typeOptions" size="small" placeholder="类型" style="width: 140px" />
          <NSelect v-model:value="f.category_id" :options="categoryOptions" size="small" filterable placeholder="分类" style="width: 220px" />
          <NSelect v-model:value="f.account_id" :options="accountOptions" size="small" filterable placeholder="账户" style="width: 160px" />
          <NSelect v-model:value="f.member_id" :options="memberOptions" size="small" filterable placeholder="成员" style="width: 130px" />
          <NSelect v-model:value="f.tag_id" :options="tagOptions" size="small" filterable placeholder="标签" style="width: 130px" />
          <NSelect v-model:value="f.source" :options="sourceOptions" size="small" placeholder="来源" style="width: 130px" />
        </div>
        <div class="row">
          <DatePickerWrap v-model="f.from" type="datetime" placeholder="起始时间" style="width: 220px" />
          <NText depth="3">至</NText>
          <DatePickerWrap v-model="f.to" type="datetime" placeholder="结束时间" :disabled-date="disableBeforeFrom" style="width: 220px" />
          <NInput v-model:value="f.min" placeholder="金额 ≥" size="small" style="width: 120px">
            <template #prefix>¥</template>
          </NInput>
          <NText depth="3">~</NText>
          <NInput v-model:value="f.max" placeholder="金额 ≤" size="small" style="width: 120px">
            <template #prefix>¥</template>
          </NInput>
          <!-- 排序不是筛选条件，放到最后一行最右侧 -->
          <NSelect v-model:value="f.sort" :options="sortOptions" size="small" placeholder="排序" style="width: 140px" class="sort-select" />
        </div>
      </NSpace>
    </NCard>

    <!-- 统计 + 结果 -->
    <NSpin :show="loading">
      <NCard v-if="hasQuery" :bordered="true" size="small" class="result-card">
        <template #header>
          <span>找到 <strong>{{ data.total }}</strong> 笔</span>
          <NTag type="success" :bordered="false" style="margin-left: 6px">
            收入 <AmountDisplay :cents="data.sum?.income || 0" :small="true" />
          </NTag>
          <NTag type="error" :bordered="false" style="margin-left: 6px">
            支出 <AmountDisplay :cents="data.sum?.expense || 0" :small="true" />
          </NTag>
        </template>
        <Empty v-if="!loading && !data.total" icon="🔍" title="没有匹配的交易" description="换个关键词或放宽筛选条件试试" />
        <TxnList
          v-else
          :groups="txnGroups"
          :show-actions="false"
          @click-item="(t: TxnItem) => router.push(`/transactions/${t.id}`)"
          @filter-category="onFilterCategory"
        />
        <!-- 翻页（老版 .pager：保留全部筛选条件） -->
        <div v-if="data.pages > 1" class="pager">
          <NButton v-if="data.page > 1" size="small" quaternary @click="search(data.page - 1)">上一页</NButton>
          <span class="cur">{{ data.page }} / {{ data.pages }}</span>
          <NButton v-if="data.page < data.pages" size="small" quaternary @click="search(data.page + 1)">下一页</NButton>
        </div>
      </NCard>
      <NCard v-else :bordered="true" class="empty-card">
        <Empty icon="🔍" title="输入条件开始搜索" description="支持关键字 / 类型 / 分类 / 账户 / 成员 / 标签 / 来源 / 日期 / 金额" />
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.filters { margin-bottom: 12px; }
.result-card { margin-bottom: 12px; }
.empty-card { margin-bottom: 12px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
/* 排序靠行尾（margin-left:auto 在 flex 行里把元素推到最右侧） */
.sort-select { margin-left: auto; }

/* 翻页条（与账单明细页 pager 同款） */
.pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 14px; }
.pager .cur { font-size: 12px; color: var(--hl-muted, #8b95a5); font-variant-numeric: tabular-nums; }
</style>
