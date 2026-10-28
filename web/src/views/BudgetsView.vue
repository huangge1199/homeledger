<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NInputNumber, NForm, NFormItem, NSelect,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin, NGrid, NGridItem,
  NSwitch, NProgress, useMessage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { BudgetsApi, TransactionsApi } from '@/api/modules'
import { fmtAmount } from '@/utils/money'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const data = ref<{ budgets: any[]; overall: any; totalBudget: number; month: string }>({ budgets: [], overall: {}, totalBudget: 0, month: '' })

// 抽屉
const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref(emptyForm())

const accounts = ref<any[]>([])
const categories = ref<any[]>([])

function emptyForm() {
  return {
    name: '',
    scope: 'overall',                  // overall | category | account
    category_id: 0,
    account_id: 0,
    amount: '',
    period: 'monthly',                 // monthly | yearly | weekly | custom
    is_active: true,
    alert_threshold: 80,
    trigger_type: 'expense',           // expense | income
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    data.value = await BudgetsApi.list()
  } catch (e) {
    toastError(errorMessage(e, '加载预算失败'))
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadOptions()
  load()
})
watch(() => session.currentLedger?.id, load)

const scopeOptions = [
  { label: '总预算', value: 'overall' },
  { label: '分类预算', value: 'category' },
  { label: '账户预算', value: 'account' },
]
const periodOptions = [
  { label: '每月', value: 'monthly' },
  { label: '每年', value: 'yearly' },
  { label: '每周', value: 'weekly' },
  { label: '自定义', value: 'custom' },
]
const triggerTypeOptions = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
]
function scopeEmoji(scope: string, catIcon?: string) {
  if (scope === 'overall') return '🎯'
  if (scope === 'category') return catIcon || '🏷️'
  return '💳'
}
const categoryOptions = computed(() => {
  const wantIncome = form.value.trigger_type === 'income'
  return categories.value
    .filter((c: any) => wantIncome ? c.kind === 'income' : c.kind === 'expense')
    .map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))
})
const accountOptions = computed(() => [
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])

// scope/trigger_type 改了 → 清 category_id / account_id
watch(
  () => form.value.scope,
  (v, old) => {
    if (v !== old) {
      form.value.category_id = 0
      form.value.account_id = 0
    }
  }
)
watch(
  () => form.value.trigger_type,
  (v, old) => {
    if (v !== old) form.value.category_id = 0
  }
)

const drawerTitle = computed(() => {
  if (editing.value) {
    return `${scopeEmoji(editing.value.scope, editing.value.category_icon)} ${editing.value.name || editing.value.scopeLabel || '编辑预算'}`
  }
  const label = scopeOptions.find((o) => o.value === form.value.scope)?.label || '预算'
  return `新建 · ${scopeEmoji(form.value.scope)}${label}`
})

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  drawerOpen.value = true
}

function openEdit(b: any) {
  editing.value = b
  form.value = {
    name: b.name || '',
    scope: b.scope,
    category_id: b.category_id || 0,
    account_id: b.account_id || 0,
    amount: (Number(b.amount_cents) / 100).toFixed(2),
    period: b.period || 'monthly',
    is_active: !!b.is_active,
    alert_threshold: b.alert_threshold || b.alert_pct || 80,
    trigger_type: b.trigger_type === 'income' ? 'income' : 'expense',
  }
  drawerOpen.value = true
}

async function onSubmit() {
  const amt = Number(String(form.value.amount).replace(/[,\s]/g, ''))
  if (!amt || amt <= 0) { message.warning('请填写金额'); return }
  if (form.value.scope === 'category' && !form.value.category_id) { message.warning('请选择分类'); return }
  if (form.value.scope === 'account' && !form.value.account_id) { message.warning('请选择账户'); return }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      scope: form.value.scope,
      amount: form.value.amount,
      period: form.value.period,
      is_active: form.value.is_active ? 1 : 0,
      alert_threshold: form.value.alert_threshold,
      trigger_type: form.value.trigger_type,
    }
    if (form.value.scope === 'category') payload.category_id = form.value.category_id
    if (form.value.scope === 'account') payload.account_id = form.value.account_id

    if (editing.value) {
      await BudgetsApi.update(Number(editing.value.id), payload)
      success('已更新')
    } else {
      await BudgetsApi.create(payload)
      success('已创建')
    }
    drawerOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onToggle(b: any) {
  try {
    await BudgetsApi.toggle(Number(b.id))
    success(b.is_active ? '已停用' : '已启用')
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}

async function onDelete(b: any) {
  try {
    await BudgetsApi.remove(Number(b.id))
    success('已删除')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const stats = computed(() => {
  const cur = data.value.overall || {}
  const list = data.value.budgets || []
  const activeCount = list.filter((b: any) => b.is_active).length
  const totalCount = list.length
  const net = Number(cur.income || 0) - Number(cur.expense || 0)
  return {
    income: cur.income || 0,
    expense: cur.expense || 0,
    totalBudget: data.value.totalBudget || 0,
    activeCount,
    totalCount,
    count: cur.count || 0,
    net,
    expenseHint: `共 ${cur.count || 0} 笔`,
    incomeHint: net >= 0 ? `结余 ${fmtAmount(net)}` : `缺口 ${fmtAmount(net)}`,
    activeHint: `共 ${totalCount} 条规则`,
    totalBudgetHint: '超支或接近额度时自动提醒',
  }
})

function statusTone(b: any): 'success' | 'warning' | 'error' | 'default' {
  if (b.ratio >= 100) return 'error'
  if (b.ratio >= (b.alert_threshold || 80)) return 'warning'
  return 'success'
}
</script>

<template>
  <AppShell>
    <PageHead :title="`预算管理 · ${data.month || '本月'}`" sub="总预算 / 分类预算 / 账户预算，含自动预警">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建预算</NButton>
      </template>
    </PageHead>

    <!-- 总览 -->
    <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" class="stats">
      <NGridItem span="1">
        <StatCard label="本月总支出" icon="💸" :value="stats.expense" tone="expense" :hint="stats.expenseHint" />
      </NGridItem>
      <NGridItem span="1">
        <StatCard label="本月总收入" icon="💰" :value="stats.income" tone="income" :hint="stats.incomeHint" />
      </NGridItem>
      <NGridItem span="1">
        <StatCard label="生效中预算" icon="🎯" :value="stats.activeCount" :hint="stats.activeHint" />
      </NGridItem>
      <NGridItem span="1">
        <StatCard label="总预算额度" icon="📋" :value="stats.totalBudget" tone="neutral" :hint="stats.totalBudgetHint" />
      </NGridItem>
    </NGrid>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !data.budgets.length"
        icon="🎯"
        title="还没有预算"
        description="设置总预算 / 分类预算，超支时会自动通知"
      >
        <NButton type="primary" @click="openCreate">＋ 新建预算</NButton>
      </Empty>

      <div v-else class="budget-grid">
        <NCard
          v-for="b in data.budgets"
          :key="b.id"
          :bordered="true"
          size="small"
          class="budget-card"
        >
          <template #header>
            <div class="card-head">
              <div>
                <span class="title" :class="{ inactive: !b.is_active }">
                  {{ scopeEmoji(b.scope, b.category_icon) }} {{ b.name || b.scopeLabel }}
                  <NTag v-if="!b.is_active" type="warning" size="small" :bordered="false" style="margin-left:6px">已停用</NTag>
                </span>
                <div class="tiny-muted">
                  {{ b.scopeLabel }} · {{ b.periodLabel }} · {{ b.rangeLabel }}
                  <template v-if="b.trigger_type === 'income'"> · 统计收入</template>
                </div>
              </div>
              <div class="card-right">
                <AmountDisplay :cents="b.used" :sign="true" tone="expense" class="used-big" />
                <span class="muted">/ <AmountDisplay :cents="b.amount_cents" tone="neutral" /></span>
              </div>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton size="tiny" quaternary @click="openEdit(b)">编辑</NButton>
              <NButton size="tiny" quaternary @click="onToggle(b)">
                {{ b.is_active ? '停用' : '启用' }}
              </NButton>
              <NPopconfirm
                @positive-click="onDelete(b)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">删除</NButton>
                </template>
                确定删除「{{ b.name || b.scopeLabel }}」？
              </NPopconfirm>
            </NSpace>
          </template>

          <NProgress
            :percentage="Math.min(100, b.ratio)"
            :status="statusTone(b) === 'error' ? 'error' : statusTone(b) === 'warning' ? 'warning' : 'success'"
            :show-indicator="false"
            :height="8"
            :border-radius="4"
            class="progress"
          />

          <div class="foot-row">
            <span :class="{ 'amount expense-neg': b.ratio >= 100, muted: b.ratio < 100 }">
              <template v-if="b.ratio >= 100">
                已超支 <AmountDisplay :cents="b.used - b.amount_cents" :sign="true" tone="expense" />（{{ b.ratio.toFixed(0) }}%）
              </template>
              <template v-else>
                还剩 <AmountDisplay :cents="b.remain" />（已用 {{ b.ratio.toFixed(0) }}%）
              </template>
            </span>
            <span class="muted" v-if="b.dailyAllowance">每天可用 <AmountDisplay :cents="b.dailyAllowance" /></span>
          </div>
        </NCard>
      </div>
    </NSpin>

    <!-- 抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="420" placement="right">
      <NDrawerContent :title="drawerTitle" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem v-if="editing" label="预算名称">
            <NInput v-model:value="form.name" placeholder="预算名称" />
          </NFormItem>
          <NFormItem label="统计对象">
            <NSelect v-model:value="form.trigger_type" :options="triggerTypeOptions" />
          </NFormItem>
          <NFormItem label="类型">
            <NSelect v-model:value="form.scope" :options="scopeOptions" :disabled="!!editing" />
          </NFormItem>
          <NFormItem v-if="form.scope === 'category'" label="分类">
            <NSelect
              v-model:value="form.category_id"
              :options="categoryOptions"
              filterable
              placeholder="选择分类"
            />
          </NFormItem>
          <NFormItem v-if="form.scope === 'account'" label="账户">
            <NSelect
              v-model:value="form.account_id"
              :options="accountOptions"
              filterable
              placeholder="选择账户"
            />
          </NFormItem>
          <NFormItem label="金额" required>
            <NInput v-model:value="form.amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="周期">
            <NSelect v-model:value="form.period" :options="periodOptions" />
          </NFormItem>
          <NFormItem label="预警阈值">
            <NInputNumber v-model:value="form.alert_threshold" :min="10" :max="100" :step="5" style="width: 100%" />
            <NText depth="3" class="hint">&nbsp;达到该百分比时通知（默认 80%）</NText>
          </NFormItem>
          <NFormItem label="启用">
            <NSwitch v-model:value="form.is_active" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="drawerOpen = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="onSubmit">
              {{ editing ? '保 存' : '创 建' }}
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.stats { margin-bottom: 12px; }
.budget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.budget-card { transition: box-shadow .15s; }
.budget-card:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; width: 100%; }
.card-head .title { font-size: 15px; font-weight: 500; }
.card-head .title.inactive { color: var(--hl-muted); text-decoration: line-through; }
.card-head .tiny-muted { font-size: 12px; color: var(--hl-muted); margin-top: 4px; }
.card-head .card-right { text-align: right; flex-shrink: 0; }
.card-head .used-big { font-size: 19px; font-weight: 600; }
.progress { margin: 10px 0 6px; }
.foot-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; margin-top: 4px; gap: 12px;
}
.foot-row .amount.expense-neg { color: var(--hl-expense); font-weight: 500; }
.muted { color: var(--hl-muted); font-size: 12px; }
.hint { font-size: 12px; }
</style>
