<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NSelect, NPopconfirm,
  NSpin, NEmpty, NDivider, NDataTable, NDatePicker, NInputNumber, useMessage, type DataTableColumns,
} from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { DashboardApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPE_MAP } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()
const message = useMessage()

const loading = ref(false)
const data = ref<any>({ items: [], total: 0, sum: { income: 0, expense: 0 } })
const f = ref<any>({
  q: route.query.q || '',
  type: route.query.type || '',
  category_id: route.query.category_id || null,
  account_id: route.query.account_id || null,
  member_id: route.query.member_id || null,
  tag_id: route.query.tag_id || null,
  from: route.query.from || '',
  to: route.query.to || '',
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
  // 同步 URL
  const q: Record<string, any> = {}
  if (f.value.q) q.q = f.value.q
  if (f.value.type) q.type = f.value.type
  if (f.value.category_id) q.category_id = f.value.category_id
  if (f.value.account_id) q.account_id = f.value.account_id
  if (f.value.member_id) q.member_id = f.value.member_id
  if (f.value.tag_id) q.tag_id = f.value.tag_id
  if (f.value.from) q.from = f.value.from
  if (f.value.to) q.to = f.value.to
  if (f.value.min) q.min = f.value.min
  if (f.value.max) q.max = f.value.max
  if (f.value.sort && f.value.sort !== 'date_desc') q.sort = f.value.sort
  router.replace({ query: q })

  try {
    const d = await DashboardApi.search({
      q: f.value.q,
      type: f.value.type,
      category_id: f.value.category_id || '',
      account_id: f.value.account_id || '',
      member_id: f.value.member_id || '',
      tag_id: f.value.tag_id || '',
      from: f.value.from,
      to: f.value.to,
      min: f.value.min,
      max: f.value.max,
      sort: f.value.sort,
      page: f.value.page,
    })
    data.value = d.result || { items: [], total: 0, sum: { income: 0, expense: 0 } }
  } catch (e) {
    toastError(errorMessage(e, '搜索失败'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadOptions()
  if (route.query.q || route.query.type || route.query.from || route.query.to) search(1)
})

const typeOptions = [
  { label: '全部', value: '' },
  ...Object.entries(TXN_TYPE_MAP).map(([k, v]) => ({ label: `${v.icon} ${v.label}`, value: k })),
]
const accountOptions = computed(() => [{ label: '全部账户', value: null }, ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id }))])
const categoryOptions = computed(() => [{ label: '全部分类', value: null }, ...categories.value.map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))])
const memberOptions = computed(() => [{ label: '全部成员', value: null }, ...members.value.map((m: any) => ({ label: m.display_name || m.username, value: m.id }))])
const tagOptions = computed(() => [{ label: '全部标签', value: null }, ...tags.value.map((t: any) => ({ label: `#${t.name}`, value: t.id }))])
const sortOptions = [
  { label: '日期 ↓', value: 'date_desc' },
  { label: '日期 ↑', value: 'date_asc' },
  { label: '金额 ↓', value: 'amount_desc' },
  { label: '金额 ↑', value: 'amount_asc' },
]

function reset() {
  f.value = { q: '', type: '', category_id: null, account_id: null, member_id: null, tag_id: null, from: '', to: '', min: '', max: '', sort: 'date_desc', page: 1 }
  data.value = { items: [], total: 0, sum: { income: 0, expense: 0 } }
  router.replace({ query: {} })
}

const txnColumns = computed<DataTableColumns>(() => [
  { title: '日期', key: 'txn_date', width: 100 },
  {
    title: '类型', key: 'type', width: 80,
    render: (t: any) => {
      const meta = TXN_TYPE_MAP[t.type]
      return h(NTag, { size: 'small', bordered: false, type: meta?.flow === 'in' ? 'success' : meta?.flow === 'out' ? 'error' : 'default' }, {
        default: () => `${meta?.icon || ''} ${meta?.label || t.type}`,
      })
    },
  },
  { title: '商户/对方', key: 'merchant', ellipsis: true, render: (t: any) => t.merchant || '-' },
  { title: '分类', key: 'category_name', render: (t: any) => `${t.category_icon || ''} ${t.category_name || '-'}`.trim() },
  { title: '账户', key: 'account_name', render: (t: any) => t.account_name || '-' },
  {
    title: '金额', key: 'amount_cents', width: 110, align: 'right',
    render: (t: any) => h(AmountDisplay, {
      cents: t.amount_cents,
      sign: true,
      tone: t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'neutral',
    }),
  },
])

const hasQuery = computed(() => {
  return !!(f.value.q || f.value.type || f.value.category_id || f.value.account_id || f.value.member_id || f.value.tag_id || f.value.from || f.value.to || f.value.min || f.value.max)
})
</script>

<template>
  <AppShell>
    <PageHead title="搜索" sub="按关键字、类型、分类、账户、成员、标签、日期、金额搜索">
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
          placeholder="关键字：备注 / 商户 / 标签"
          clearable
          size="large"
          @keyup.enter="search(1)"
        >
          <template #prefix>🔍</template>
        </NInput>
        <div class="row">
          <NSelect v-model:value="f.type" :options="typeOptions" size="small" placeholder="类型" style="width: 140px" />
          <NSelect v-model:value="f.category_id" :options="categoryOptions" size="small" filterable placeholder="分类" style="width: 180px" />
          <NSelect v-model:value="f.account_id" :options="accountOptions" size="small" filterable placeholder="账户" style="width: 180px" />
          <NSelect v-model:value="f.member_id" :options="memberOptions" size="small" filterable placeholder="成员" style="width: 120px" />
          <NSelect v-model:value="f.tag_id" :options="tagOptions" size="small" filterable placeholder="标签" style="width: 120px" />
          <NSelect v-model:value="f.sort" :options="sortOptions" size="small" style="width: 110px" />
        </div>
        <div class="row">
          <NDatePicker v-model:value="f.from" type="date" clearable size="small" placeholder="开始日期" style="width: 140px" />
          <NText depth="3">至</NText>
          <NDatePicker v-model:value="f.to" type="date" clearable size="small" placeholder="结束日期" style="width: 140px" />
          <NInput v-model:value="f.min" placeholder="最低金额" size="small" style="width: 120px" />
          <NText depth="3">~</NText>
          <NInput v-model:value="f.max" placeholder="最高金额" size="small" style="width: 120px" />
        </div>
      </NSpace>
    </NCard>

    <!-- 统计 + 结果 -->
    <NSpin :show="loading">
      <NCard v-if="hasQuery" :bordered="true" size="small" class="result-card">
        <template #header>
          <span>共 <strong>{{ data.total }}</strong> 条结果，合计</span>
          <NTag type="success" :bordered="false" style="margin-left: 6px">
            收入 <AmountDisplay :cents="data.sum?.income || 0" :small="true" />
          </NTag>
          <NTag type="error" :bordered="false" style="margin-left: 6px">
            支出 <AmountDisplay :cents="data.sum?.expense || 0" :small="true" />
          </NTag>
        </template>
        <NEmpty v-if="!loading && !data.rows?.length" description="没有匹配的交易" />
        <NDataTable
          v-else
          :columns="txnColumns"
          :data="data.rows || []"
          :pagination="{ page: data.page, pageCount: data.pages, pageSize: 30, onUpdatePage: search }"
          size="small"
          :row-key="(r: any) => r.id"
          :row-props="(r: any) => ({ onClick: () => router.push(`/transactions/${r.id}`), style: 'cursor: pointer' })"
        />
      </NCard>
      <NCard v-else :bordered="true" class="empty-card">
        <Empty icon="🔍" title="输入条件开始搜索" description="支持关键字 / 类型 / 分类 / 账户 / 成员 / 标签 / 日期 / 金额" />
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.filters { margin-bottom: 12px; }
.result-card { margin-bottom: 12px; }
.empty-card { margin-bottom: 12px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
