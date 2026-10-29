<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect,
  NPopconfirm, NDrawer, NDrawerContent, NAlert, NSpin, NGrid, NGridItem,
  NRadioGroup, NRadio, useMessage, NDatePicker, NSwitch,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { DebtsApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { fmtAmount } from '@/utils/money'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const items = ref<any[]>([])
const filter = ref<'all' | 'lend' | 'borrow' | 'settled'>('all')

const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref(emptyForm())

const settleOpen = ref(false)
const settleDebt = ref<any>(null)
const settleForm = ref({ account_id: 0, settle_date: dayjs().valueOf(), amount: '', note: '' })

const accounts = ref<any[]>([])

function emptyForm() {
  return {
    direction: 'lend',
    counterparty: '',
    principal: '',
    due_date: null as number | null,
    account_id: 0,
    note: '',
    create_txn: true,
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await DebtsApi.list()
    items.value = d.items || []
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadOptions()
  load()
})
watch(() => session.currentLedger?.id, load)

const accountOptions = computed(() => [
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])

const filtered = computed(() => {
  if (filter.value === 'all') return items.value
  if (filter.value === 'settled') return items.value.filter((d) => d.is_settled)
  return items.value.filter((d) => d.direction === filter.value && !d.is_settled)
})

const overview = computed(() => {
  let lend = 0, borrow = 0, settled = 0
  for (const d of items.value) {
    if (d.is_settled) { settled += Number(d.principal_cents) || 0; continue }
    // 未结清按「剩余余额」累计（部分还款后余额小于本金）
    const bal = d.balance_cents != null ? Number(d.balance_cents) : (Number(d.principal_cents) || 0)
    if (d.direction === 'lend') lend += bal
    else borrow += bal
  }
  // 净头寸 = 应收 − 应付（老版 receivable - payable）
  return { lend, borrow, settled, net: lend - borrow }
})

function openCreate(direction: 'lend' | 'borrow' = 'lend') {
  editing.value = null
  form.value = emptyForm()
  form.value.direction = direction
  drawerOpen.value = true
}

function openEdit(d: any) {
  editing.value = d
  form.value = {
    direction: d.direction,
    counterparty: d.counterparty,
    principal: (Number(d.principal_cents) / 100).toFixed(2),
    due_date: d.due_date ? dayjs(d.due_date).valueOf() : null,
    account_id: d.account_id || 0,
    note: d.is_auto ? '' : (d.note || ''),
    create_txn: false,
  }
  drawerOpen.value = true
}

async function onSubmit() {
  const principal = Number(String(form.value.principal).replace(/[,\s¥￥$]/g, ''))
  if (!form.value.counterparty?.trim()) { message.warning('请填写对方'); return }
  if (!principal) { message.warning('请填写本金'); return }
  if (!editing.value && form.value.create_txn && !form.value.account_id) {
    message.warning('生成账户流水需要指定资金账户'); return
  }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      direction: form.value.direction,
      counterparty: form.value.counterparty.trim(),
      principal: form.value.principal,
      due_date: form.value.due_date ? dayjs(form.value.due_date).format('YYYY-MM-DD') : null,
      account_id: form.value.account_id || null,
      note: form.value.note,
    }
    if (editing.value) {
      await DebtsApi.update(Number(editing.value.id), payload)
      success('已更新')
    } else {
      payload.create_txn = form.value.create_txn ? 1 : 0
      const r: any = await DebtsApi.create(payload)
      success(r?.data?.synced_to_debts ? '已记一笔并同步到借贷台账' : '已新增台账记录（未生成流水）')
    }
    drawerOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function openSettle(d: any) {
  settleDebt.value = d
  const bal = d.balance_cents != null ? Number(d.balance_cents) : (Number(d.principal_cents) || 0)
  settleForm.value = {
    account_id: d.account_id || (accounts.value[0]?.id ?? 0),
    settle_date: dayjs().valueOf(),
    amount: (bal / 100).toFixed(2),
    note: '',
  }
  settleOpen.value = true
}

const settleBalance = computed(() => {
  const d = settleDebt.value
  if (!d) return 0
  return d.balance_cents != null ? Number(d.balance_cents) : (Number(d.principal_cents) || 0)
})

const settleCents = computed(() => {
  const amt = Math.round(Number(String(settleForm.value.amount).replace(/[,\s¥￥$]/g, '')) * 100) || 0
  return Math.min(Math.max(0, amt), settleBalance.value)
})

const settleRemain = computed(() => Math.max(0, settleBalance.value - settleCents.value))

async function onSettle() {
  if (!settleDebt.value) return
  const amt = settleCents.value / 100
  if (!amt || amt <= 0) { message.warning('请填写本次核销金额'); return }
  try {
    const r: any = await DebtsApi.settle(Number(settleDebt.value.id), {
      account_id: settleForm.value.account_id || null,
      settle_date: dayjs(settleForm.value.settle_date).format('YYYY-MM-DD'),
      amount: amt,
      note: settleForm.value.note,
    })
    const remain = Number(r?.data?.balance ?? 0)
    success(remain > 0 ? `已核销，剩余 ¥${(remain / 100).toFixed(2)}` : '已结清，账本已记一笔交易')
    settleOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '结算失败')
  }
}

async function onDelete(d: any) {
  try {
    await DebtsApi.remove(Number(d.id))
    success('已删除')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const filterOptions = [
  { label: '全部', value: 'all' },
  { label: '借出', value: 'lend' },
  { label: '借入', value: 'borrow' },
  { label: '已结清', value: 'settled' },
]

function isOverdue(d: any) {
  return !d.is_settled && d.due_date && dayjs(d.due_date).isBefore(dayjs(), 'day')
}
function daysToDue(d: any) {
  if (!d.due_date) return null
  return dayjs(d.due_date).diff(dayjs(), 'day')
}
</script>

<template>
  <AppShell>
    <PageHead title="借贷台账" sub="借出 / 借入 / 结算，自动同步为交易">
      <template #actions>
        <NButton type="primary" ghost @click="openCreate('lend')">＋ 借出</NButton>
        <NButton type="warning" ghost @click="openCreate('borrow')">＋ 借入</NButton>
      </template>
    </PageHead>

    <!-- 总览 -->
    <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
      <NGridItem span="1">
        <StatCard label="未结借出（应收）" icon="📤" :value="overview.lend" tone="income" hint="别人欠我" />
      </NGridItem>
      <NGridItem span="1">
        <StatCard label="未结借入（应付）" icon="📥" :value="overview.borrow" tone="expense" hint="我欠别人" />
      </NGridItem>
      <NGridItem span="1">
        <StatCard
          label="净头寸"
          icon="🪙"
          :value="overview.net"
          :tone="overview.net >= 0 ? 'income' : 'expense'"
          hint="应收 − 应付"
        />
      </NGridItem>
      <NGridItem span="1">
        <StatCard label="已结清" icon="✅" :value="overview.settled" tone="neutral" hint="已核销本金" />
      </NGridItem>
    </NGrid>

    <!-- 筛选 -->
    <NCard :bordered="true" size="small" class="filter-card">
      <div class="filter-row">
        <NRadioGroup v-model:value="filter" size="small">
          <NRadio v-for="o in filterOptions" :key="o.value" :value="o.value">{{ o.label }}</NRadio>
        </NRadioGroup>
        <NText depth="3" class="count">共 {{ filtered.length }} 条</NText>
        <NText depth="3" class="hint-tip">近 3 天到期的会自动提醒</NText>
      </div>
    </NCard>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !filtered.length"
        icon="🤝"
        title="还没有借贷记录"
        description="借出 / 借入 / 结算，账本自动生成对应交易"
      >
        <NSpace>
          <NButton type="primary" ghost @click="openCreate('lend')">＋ 借出</NButton>
          <NButton type="warning" ghost @click="openCreate('borrow')">＋ 借入</NButton>
        </NSpace>
      </Empty>

      <div v-else class="grid">
        <NCard
          v-for="d in filtered"
          :key="d.id"
          :bordered="true"
          size="small"
          class="debt"
          :class="[{ settled: d.is_settled, overdue: isOverdue(d) }]"
        >
          <template #header>
            <div class="head">
              <NTag :type="d.direction === 'lend' ? 'success' : 'warning'" :bordered="false" size="small">
                {{ d.direction === 'lend' ? '📤 应收' : '📥 应付' }}
              </NTag>
              <NText class="counter">{{ d.counterparty }}</NText>
              <NTag v-if="d.is_auto" type="info" :bordered="false" size="small">自动</NTag>
              <NTag v-if="d.is_settled" type="default" :bordered="false" size="small">已结清</NTag>
              <NTag v-else-if="isOverdue(d)" type="error" :bordered="false" size="small">已逾期</NTag>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton
                v-if="!d.is_settled"
                size="tiny"
                type="primary"
                @click="openSettle(d)"
              >
                {{ d.direction === 'lend' ? '收款核销' : '还款核销' }}
              </NButton>
              <NButton v-if="!d.is_auto" size="tiny" quaternary @click="openEdit(d)">编辑</NButton>
              <NPopconfirm
                v-if="!d.is_auto"
                @positive-click="onDelete(d)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">删除</NButton>
                </template>
                确定删除「{{ d.counterparty }}」？关联的结算交易不会自动回滚。
              </NPopconfirm>
            </NSpace>
          </template>
          <div class="amount">
            <AmountDisplay
              :cents="d.balance_cents != null ? Number(d.balance_cents) : Number(d.principal_cents)"
              :tone="d.direction === 'lend' ? 'income' : 'expense'"
              :sign="true"
            />
            <span class="principal">本金 {{ fmtAmount(Number(d.principal_cents)) }}</span>
          </div>
          <div class="meta">
            <span v-if="d.due_date">📅 到期 {{ d.due_date }}</span>
            <span v-if="d.due_date && !d.is_settled && daysToDue(d) != null" class="days">
              <span v-if="(daysToDue(d) || 0) > 0" class="income">还有 {{ daysToDue(d) }} 天</span>
              <span v-else class="expense">逾期 {{ -(daysToDue(d) || 0) }} 天</span>
            </span>
          </div>
          <div v-if="d.account_name" class="acc">资金账户：{{ d.account_name }}</div>
          <div v-if="d.note && !d.is_auto" class="note">备注：{{ d.note }}</div>
          <div v-if="d.is_settled" class="settled">
            ✅ 已结清
          </div>
        </NCard>
      </div>
    </NSpin>

    <!-- 借出/借入抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="420" placement="right">
      <NDrawerContent :title="editing ? '编辑借贷' : (form.direction === 'lend' ? '新建借出' : '新建借入')" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="类型">
            <NRadioGroup v-model:value="form.direction" :disabled="!!editing">
              <NRadio value="lend">📤 借出（对方欠我）</NRadio>
              <NRadio value="borrow">📥 借入（我欠对方）</NRadio>
            </NRadioGroup>
          </NFormItem>
          <NFormItem label="对方" required>
            <NInput v-model:value="form.counterparty" maxlength="30" placeholder="姓名 / 机构" />
          </NFormItem>
          <NFormItem label="本金" required>
            <NInput v-model:value="form.principal" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="到期日">
            <NDatePicker
              v-model:value="form.due_date"
              type="date"
              clearable
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="资金账户">
            <NSelect
              v-model:value="form.account_id"
              :options="accountOptions"
              filterable
              clearable
              :placeholder="form.direction === 'lend' ? '从哪个账户借出' : '借到哪个账户'"
            />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
          </NFormItem>
          <NFormItem v-if="!editing" label="生成账户流水">
            <div class="switch-row">
              <NSwitch v-model:value="form.create_txn" />
              <NText depth="3" class="switch-label">同时生成账户流水（推荐）</NText>
            </div>
          </NFormItem>
          <NAlert v-if="!editing" type="info" :show-icon="true" class="tip">
            勾选时系统会记一笔「{{ form.direction === 'lend' ? '借出' : '借入' }}」，账户余额随之变动；关闭则只登记台账，不影响余额。
          </NAlert>
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

    <!-- 结算抽屉 -->
    <NDrawer v-model:show="settleOpen" :width="380" placement="right">
      <NDrawerContent :title="`结算：${settleDebt?.counterparty || ''}`" :native-scrollbar="false">
        <NForm label-placement="top" :model="settleForm">
          <NFormItem label="结算日期">
            <NDatePicker
              v-model:value="settleForm.settle_date"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="本次核销金额">
            <NInput v-model:value="settleForm.amount" placeholder="0.00">
              <template #prefix>¥</template>
            </NInput>
          </NFormItem>
          <NText depth="3" class="settle-remain">
            本次可核销 ¥{{ (settleBalance / 100).toFixed(2) }}，核销后剩余 ¥{{ (settleRemain / 100).toFixed(2) }}
          </NText>
          <NFormItem label="结算账户">
            <NSelect
              v-model:value="settleForm.account_id"
              :options="accountOptions"
              filterable
            />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="settleForm.note" />
          </NFormItem>
          <NAlert type="info" :show-icon="true" class="tip">
            <p v-if="settleDebt?.direction === 'lend'">收回借款将生成一笔「收回借款」收入交易，金额 <AmountDisplay :cents="settleCents" :sign="true" tone="income" /></p>
            <p v-else>偿还借款将生成一笔「偿还借款」支出交易，金额 <AmountDisplay :cents="settleCents" :sign="true" tone="expense" /></p>
          </NAlert>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="settleOpen = false">取消</NButton>
            <NButton type="primary" @click="onSettle">确认结算</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.stats { margin-bottom: 12px; }
.filter-card { margin-bottom: 12px; }
.filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hint-tip { margin-left: auto; font-size: 12px; }
.count { font-size: 12px; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.debt { transition: box-shadow .15s; }
.debt:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.debt.settled { opacity: .7; }
.debt.overdue { border-color: var(--hl-expense, #e5484d) !important; }

.head { display: flex; align-items: center; gap: 8px; }
.counter { font-size: 14px; font-weight: 500; }
.amount { display: flex; align-items: baseline; gap: 8px; margin: 4px 0; }
.amount :deep(.hl-amount) { font-size: 18px; font-weight: 600; }
.principal { font-size: 12px; color: var(--hl-muted); }
.meta { display: flex; gap: 8px; font-size: 12px; color: var(--hl-muted); flex-wrap: wrap; }
.meta .days .income { color: var(--hl-income); }
.meta .days .expense { color: var(--hl-expense); }
.acc, .note { font-size: 12px; color: var(--hl-muted); margin-top: 4px; }
.settled { font-size: 12px; color: var(--hl-income); margin-top: 6px; }
.switch-row { display: flex; align-items: center; gap: 8px; }
.switch-label { font-size: 12px; }
.settle-remain { display: block; font-size: 12px; margin: -4px 0 12px; }
.tip { margin-top: 8px; }
</style>
