<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect, NInputNumber,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin, NGrid, NGridItem,
  NSwitch, useMessage, NDatePicker,
} from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { SubscriptionsApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const data = ref<{ items: any[]; overview: any; presets: any[] }>({ items: [], overview: {}, presets: [] })

const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref(emptyForm())

const accounts = ref<any[]>([])
const categories = ref<any[]>([])

function emptyForm() {
  return {
    name: '',
    icon: '🧾',
    plan: '',
    vendor_url: '',
    amount: '',
    currency: 'CNY',
    cycle: 'monthly',
    cycle_n: 1,
    anchor_month: null as number | null,
    anchor_day: 1,
    account_id: 0,
    category_id: 0,
    auto_renew: true,
    trial_ends_on: null as number | null,
    next_charge_at: dayjs().valueOf(),
    reminder_days: 3,
    status: 'active',
    note: '',
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    data.value = await SubscriptionsApi.list()
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
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
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
const categoryOptions = computed(() =>
  categories.value.filter((c: any) => c.kind === 'expense').map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))
)

const cycleOptions = [
  { label: '每月', value: 'monthly' },
  { label: '每年', value: 'yearly' },
  { label: '每周', value: 'weekly' },
  { label: '一次性', value: 'none' },
  { label: '固定日期', value: 'fixed' },
]
const statusOptions = [
  { label: '已订阅', value: 'active' },
  { label: '试用中', value: 'trial' },
  { label: '已暂停', value: 'paused' },
  { label: '已取消', value: 'canceled' },
]

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  drawerOpen.value = true
}

function openCreateFromPreset(preset: any) {
  editing.value = null
  form.value = emptyForm()
  form.value.name = preset.name
  form.value.icon = preset.icon
  form.value.cycle = preset.cycle || 'monthly'
  drawerOpen.value = true
}

function openEdit(s: any) {
  editing.value = s
  form.value = {
    name: s.name,
    icon: s.icon || '🧾',
    plan: s.plan || '',
    vendor_url: s.vendor_url || '',
    amount: (Number(s.amount_cents) / 100).toFixed(2),
    currency: s.currency || 'CNY',
    cycle: s.cycle || 'monthly',
    cycle_n: s.cycle_n || 1,
    anchor_month: s.anchor_month || null,
    anchor_day: s.anchor_day || 1,
    account_id: s.account_id || 0,
    category_id: s.category_id || 0,
    auto_renew: !!s.auto_renew,
    trial_ends_on: s.trial_ends_on ? dayjs(s.trial_ends_on).valueOf() : null,
    next_charge_at: s.next_charge_at ? dayjs(s.next_charge_at).valueOf() : dayjs().valueOf(),
    reminder_days: s.reminder_days ?? 3,
    status: s.status || 'active',
    note: s.note || '',
  }
  drawerOpen.value = true
}

async function onSubmit() {
  const amt = Number(String(form.value.amount).replace(/[,\s¥￥$]/g, ''))
  if (!form.value.name) { message.warning('请填写名称'); return }
  if (!amt) { message.warning('请填写金额'); return }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      icon: form.value.icon,
      plan: form.value.plan || null,
      vendor_url: form.value.vendor_url || null,
      amount: form.value.amount,
      currency: form.value.currency,
      cycle: form.value.cycle,
      cycle_n: form.value.cycle_n,
      anchor_month: form.value.anchor_month,
      anchor_day: form.value.anchor_day,
      account_id: form.value.account_id || null,
      category_id: form.value.category_id || null,
      auto_renew: form.value.auto_renew ? 1 : 0,
      trial_ends_on: form.value.trial_ends_on ? dayjs(form.value.trial_ends_on).format('YYYY-MM-DD') : null,
      next_charge_at: form.value.cycle === 'none' ? '9999-12-31' : dayjs(form.value.next_charge_at).format('YYYY-MM-DD'),
      reminder_days: form.value.reminder_days,
      status: form.value.status,
      note: form.value.note,
    }
    if (editing.value) {
      await SubscriptionsApi.update(Number(editing.value.id), payload)
      success('已更新')
    } else {
      await SubscriptionsApi.create(payload)
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

async function onCharge(s: any) {
  try {
    await SubscriptionsApi.charge(Number(s.id))
    success('已记账')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '记账失败')
  }
}
async function onSkip(s: any) {
  try {
    const r = await SubscriptionsApi.skip(Number(s.id))
    success(`下次扣费日已推至 ${r.next_charge_at}`)
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onToggle(s: any) {
  try {
    await SubscriptionsApi.toggle(Number(s.id))
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onCancel(s: any) {
  try {
    await SubscriptionsApi.cancel(Number(s.id))
    success('已取消')
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onDelete(s: any) {
  try {
    await SubscriptionsApi.remove(Number(s.id))
    success('已删除')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const overview = computed(() => data.value.overview || {})
const items = computed(() => data.value.items || [])

const statusType: Record<string, any> = {
  active: 'success', trial: 'info', paused: 'warning', canceled: 'default',
}
const statusLabel: Record<string, string> = {
  active: '已订阅', trial: '试用中', paused: '已暂停', canceled: '已取消',
}
const cycleLabel: Record<string, string> = {
  monthly: '每月', yearly: '每年', weekly: '每周', none: '一次性', fixed: '固定日',
}
</script>

<template>
  <AppShell>
    <PageHead title="订阅扣费" sub="追踪每月订阅服务，提前收到续费提醒">
      <template #actions>
        <NButton @click="openCreate" type="primary">＋ 新建订阅</NButton>
      </template>
    </PageHead>

    <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
      <NGridItem span="3 m:1 l:1">
        <StatCard label="月均支出" icon="📅" :value="overview.monthly" tone="expense" hint="所有活跃订阅换算为月均" />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard label="年总支出" icon="📆" :value="overview.yearly" tone="expense" />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard label="活跃数" icon="🔔" :value="overview.activeCount || 0" tone="neutral" hint="已订阅 / 试用中" />
      </NGridItem>
    </NGrid>

    <!-- 预设 -->
    <NCard v-if="data.presets?.length" :bordered="true" size="small" class="preset-card">
      <template #header>
        <span>🚀 快速添加</span>
      </template>
      <div class="preset-grid">
        <NButton
          v-for="p in data.presets"
          :key="p.name"
          quaternary
          size="small"
          @click="openCreateFromPreset(p)"
          class="preset"
        >
          {{ p.icon }} {{ p.name }}
        </NButton>
      </div>
    </NCard>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="🔔"
        title="还没有订阅"
        description="把常用的订阅服务都加进来，提前知道续费日"
      >
        <NButton type="primary" @click="openCreate">＋ 新建订阅</NButton>
      </Empty>

      <div v-else class="grid">
        <NCard
          v-for="s in items"
          :key="s.id"
          :bordered="true"
          size="small"
          class="item"
          :class="{ canceled: s.status === 'canceled' }"
        >
          <template #header>
            <div class="head">
              <span class="ico">{{ s.icon || '🧾' }}</span>
              <div class="meta">
                <div class="title">
                  {{ s.name }}
                  <NTag v-if="s.plan" size="tiny" :bordered="false">{{ s.plan }}</NTag>
                  <NTag :type="statusType[s.status] || 'default'" size="small" :bordered="false">
                    {{ statusLabel[s.status] || s.status }}
                  </NTag>
                </div>
                <div class="sub">
                  <span>{{ cycleLabel[s.cycle] || s.cycle }}<span v-if="s.cycle_n > 1 && s.cycle !== 'none'"> · {{ s.cycle_n }} 期</span></span>
                  <span class="dot">·</span>
                  <span>下次扣费：<strong>{{ s.next_charge_at }}</strong></span>
                </div>
              </div>
              <div class="amount">
                <AmountDisplay :cents="s.amount_cents" tone="expense" />
                <div class="hint">/ {{ cycleLabel[s.cycle] || s.cycle }}</div>
              </div>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onCharge(s)">立即记账</NButton>
              <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onSkip(s)">跳一次</NButton>
              <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onToggle(s)">
                {{ s.status === 'paused' ? '启用' : '暂停' }}
              </NButton>
              <NButton size="tiny" quaternary @click="openEdit(s)">编辑</NButton>
              <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary type="warning" @click="onCancel(s)">取消</NButton>
              <NPopconfirm
                @positive-click="onDelete(s)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">删除</NButton>
                </template>
                确定删除？
              </NPopconfirm>
            </NSpace>
          </template>
          <div class="footer">
            <NTag v-if="s.auto_renew" size="small" :bordered="false" type="info">自动续费</NTag>
            <NTag v-if="s.trial_ends_on" size="small" :bordered="false" type="warning">
              试用至 {{ s.trial_ends_on }}
            </NTag>
            <NText depth="3" v-if="s.account_name">支付账户：{{ s.account_name }}</NText>
          </div>
        </NCard>
      </div>
    </NSpin>

    <NDrawer v-model:show="drawerOpen" :width="440" placement="right">
      <NDrawerContent :title="editing ? '编辑订阅' : '新建订阅'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="40" />
          </NFormItem>
          <NFormItem label="图标">
            <NInput v-model:value="form.icon" maxlength="4" />
          </NFormItem>
          <NFormItem label="套餐/档位">
            <NInput v-model:value="form.plan" placeholder="如：标准版 / 个人版" maxlength="40" />
          </NFormItem>
          <NFormItem label="金额" required>
            <NInput v-model:value="form.amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="周期">
            <NSelect v-model:value="form.cycle" :options="cycleOptions" />
          </NFormItem>
          <NFormItem label="下次扣费日">
            <NDatePicker
              v-model:value="form.next_charge_at"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="试用到期日（可选）">
            <NDatePicker
              v-model:value="form.trial_ends_on"
              type="date"
              clearable
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="支付账户">
            <NSelect v-model:value="form.account_id" :options="accountOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="分类">
            <NSelect v-model:value="form.category_id" :options="categoryOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="form.status" :options="statusOptions" />
          </NFormItem>
          <NFormItem label="提前提醒">
            <NInputNumber v-model:value="form.reminder_days" :min="0" :max="60" style="width: 100%" />
            <NText depth="3" class="hint">&nbsp;提前 N 天通知（0 = 不提醒）</NText>
          </NFormItem>
          <NFormItem label="自动续费">
            <NSwitch v-model:value="form.auto_renew" />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
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
.preset-card { margin-bottom: 12px; }
.preset-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.preset { font-size: 13px; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.item { transition: box-shadow .15s; }
.item:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.item.canceled { opacity: .65; }
.head { display: flex; align-items: center; gap: 12px; }
.head .ico { font-size: 22px; width: 32px; text-align: center; }
.head .meta { flex: 1; min-width: 0; }
.head .title { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.head .sub { font-size: 12px; color: var(--hl-muted); display: flex; gap: 6px; flex-wrap: wrap; }
.head .sub .dot { opacity: .5; }
.head .amount { text-align: right; }
.head .amount :deep(.hl-amount) { font-size: 18px; font-weight: 600; }
.head .amount .hint { font-size: 11px; color: var(--hl-muted); }
.footer { display: flex; gap: 8px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
.hint { font-size: 12px; }
</style>
