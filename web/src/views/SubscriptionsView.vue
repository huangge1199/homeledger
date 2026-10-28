<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
import { currencySymbol } from '@/utils/money'

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
/** 编辑态的历史扣费记录（老版「历史扣费记录」卡） */
const history = ref<any[]>([])

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

/** 计费周期 7 种（对齐老版：每月/每季/每半年/每年/每周/固定到期日/不周期） */
const cycleOptions = [
  { label: '每月', value: 'monthly' },
  { label: '每季', value: 'quarterly' },
  { label: '每半年', value: 'half_yearly' },
  { label: '每年', value: 'yearly' },
  { label: '每周', value: 'weekly' },
  { label: '固定到期日', value: 'fixed' },
  { label: '不周期（仅记录）', value: 'none' },
]
/** 状态只 3 项（老版编辑页没有「已取消」选项，已取消的沿用原状态） */
const statusOptions = computed(() => {
  const list = [
    { label: '生效中', value: 'active' },
    { label: '试用中', value: 'trial' },
    { label: '已暂停', value: 'paused' },
  ]
  // 已取消的订阅不随表单复活（后端也会兜底），这里补一个只读选项避免显示成裸值
  if (editing.value?.status === 'canceled') list.push({ label: '已取消', value: 'canceled' })
  return list
})
const currencyOptions = [
  { label: 'CNY', value: 'CNY' },
  { label: 'USD', value: 'USD' },
  { label: 'HKD', value: 'HKD' },
  { label: 'JPY', value: 'JPY' },
  { label: 'EUR', value: 'EUR' },
]

/** 固定到期日的标签是「到期日」（不周期时整个「下次扣费日」表单项隐藏） */
const nextChargeLabel = computed(() => (form.value.cycle === 'fixed' ? '到期日' : '下次扣费日'))

function openCreate() {
  editing.value = null
  history.value = []
  form.value = emptyForm()
  drawerOpen.value = true
}

function openCreateFromPreset(preset: any) {
  editing.value = null
  history.value = []
  form.value = emptyForm()
  form.value.name = preset.name
  form.value.icon = preset.icon
  form.value.cycle = preset.cycle || 'monthly'
  drawerOpen.value = true
}

async function openEdit(s: any) {
  editing.value = s
  history.value = []
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
  // 拉取该订阅的历史扣费记录（老版编辑页的「历史扣费记录」卡）
  try {
    const d = await SubscriptionsApi.get(Number(s.id))
    history.value = d?.history || []
  } catch { /* ignore */ }
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
      success('订阅已更新')
    } else {
      await SubscriptionsApi.create(payload)
      success('订阅已添加')
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
    success(`已记一笔订阅扣费 ${((Number(s.amount_cents) || 0) / 100).toFixed(2)} 元，下次扣费日已顺延`)
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '记账失败')
  }
}
async function onSkip(s: any) {
  try {
    const r = await SubscriptionsApi.skip(Number(s.id))
    success(`已跳过本期，下次扣费顺延至 ${r?.data?.next_charge_at || ''}`)
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onToggle(s: any) {
  try {
    await SubscriptionsApi.toggle(Number(s.id))
    success(s.status === 'paused' || s.status === 'canceled' ? `「${s.name}」已恢复订阅` : `「${s.name}」已暂停，不再自动扣费`)
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onCancel(s: any) {
  try {
    await SubscriptionsApi.cancel(Number(s.id))
    success(`「${s.name}」已标记为取消，历史扣费记录保留`)
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}
async function onDelete(s: any) {
  try {
    await SubscriptionsApi.remove(Number(s.id))
    success('订阅已删除（已生成的流水不受影响）')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const overview = computed(() => data.value.overview || {})
const items = computed(() => data.value.items || [])

/** 按状态分组（对齐老版：生效中 / 试用中 / 已暂停 / 已取消） */
const groups = computed(() => {
  const list = items.value
  return [
    { key: 'active', title: '生效中', list: list.filter((s: any) => s.status === 'active') },
    { key: 'trial', title: '试用中', list: list.filter((s: any) => s.status === 'trial') },
    { key: 'paused', title: '已暂停', list: list.filter((s: any) => s.status === 'paused') },
    { key: 'canceled', title: '已取消', list: list.filter((s: any) => s.status === 'canceled') },
  ].filter((g) => g.list.length)
})

const statusType: Record<string, any> = {
  active: 'success', trial: 'info', paused: 'warning', canceled: 'default',
}
const statusLabel: Record<string, string> = {
  active: '生效中', trial: '试用中', paused: '已暂停', canceled: '已取消',
}
const cycleLabel: Record<string, string> = {
  monthly: '每月', quarterly: '每季', half_yearly: '每半年', yearly: '每年',
  weekly: '每周', fixed: '固定到期日', none: '不周期',
}
const cycleUnit: Record<string, string> = {
  monthly: '月', quarterly: '季', half_yearly: '半年', yearly: '年', weekly: '周',
}

/** 周期文案：支持「每 N 期」 */
function cycleText(s: any): string {
  const n = Number(s.cycle_n) || 1
  if (n > 1 && s.cycle !== 'none' && s.cycle !== 'fixed') return `每 ${n} ${cycleUnit[s.cycle] || '月'}`
  return cycleLabel[s.cycle] || s.cycle
}

/** 金额右侧副标题（对齐老版：不周期·手动记账 / 固定到期日·到期提醒 / 周期·月均） */
function amountSub(s: any): string {
  if (s.cycle === 'none') return '不周期 · 手动记账'
  if (s.cycle === 'fixed') return '固定到期日 · 到期提醒'
  return `${cycleText(s)} · 月均 ${currencySymbol(s.currency)}${((Number(s.monthly_cents) || 0) / 100).toFixed(2)}`
}

/** 3 天内到期（或已逾期）标红 */
function isUrgent(s: any): boolean {
  if (s.status === 'canceled') return false
  const d = s.daysLeft
  return d !== null && d !== undefined && d <= 3 && d >= 0
}
function isOverdue(s: any): boolean {
  const d = s.daysLeft
  return s.status !== 'canceled' && d !== null && d !== undefined && d < 0
}
</script>

<template>
  <AppShell>
    <PageHead title="订阅扣费" sub="追踪每月订阅服务，提前收到续费提醒">
      <template #actions>
        <NButton @click="openCreate" type="primary">＋ 新建订阅</NButton>
      </template>
    </PageHead>

    <!-- 说明卡（对齐老版，讲清与「周期账单」的区别） -->
    <NAlert type="info" :show-icon="false" class="intro">
      管好每一个「自动续费」：软件、会员、云盘、服务器……填一次，之后到期自动记账、到期前提醒你，
      还能一眼看出<b>每月固定被扣走多少钱</b>、哪些该退了。
      <span class="muted">与「周期账单」的区别：周期账单管房租工资等任意固定收支，这里专门管订阅制消费。</span>
    </NAlert>

    <!-- 总览：4 张卡（对齐老版） -->
    <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
      <NGridItem span="4 m:2 l:1">
        <StatCard
          label="生效中订阅"
          icon="🔔"
          :value="overview.live?.length || 0"
          tone="neutral"
          raw
          :hint="`试用中 ${overview.trials?.length || 0} · 已暂停 ${(overview.paused?.length || 0) + (overview.canceled?.length || 0)}`"
        />
      </NGridItem>
      <NGridItem span="4 m:2 l:1">
        <StatCard label="每月固定支出" icon="📅" :value="overview.monthlyTotal || 0" tone="expense" hint="按当前生效订阅摊平到每月" />
      </NGridItem>
      <NGridItem span="4 m:2 l:1">
        <StatCard
          label="每年合计"
          icon="📆"
          :value="overview.annualTotal || 0"
          tone="expense"
          :hint="`年付 / 半年付 ${overview.annualPaidCount || 0} 项已按周期摊平`"
        />
      </NGridItem>
      <NGridItem span="4 m:2 l:1">
        <StatCard
          label="本月待扣 / 已扣"
          icon="🧾"
          :value="overview.dueThisMonth || 0"
          tone="neutral"
          raw
          :hint="`本月已扣 ¥${((Number(overview.thisMonthCharged) || 0) / 100).toFixed(2)}` + (overview.upcoming ? ` · 最近 ${overview.upcoming.name} ${overview.upcoming.dueLabel}` : '')"
        />
      </NGridItem>
    </NGrid>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="🧾"
        title="还没有订阅"
        description="添加订阅，例如「Netflix 每月 15 号 45 元」，或点上方常用服务快选"
      >
        <NButton type="primary" @click="openCreate">＋ 新建订阅</NButton>
      </Empty>

      <template v-else>
        <div v-for="g in groups" :key="g.key" class="group">
          <h2 class="group-title">{{ g.title }}（{{ g.list.length }}）</h2>
          <div class="grid">
            <NCard
              v-for="s in g.list"
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
                      <span v-if="s.plan" class="plan">· {{ s.plan }}</span>
                    </div>
                    <div class="chips">
                      <NTag :type="statusType[s.status] || 'default'" size="small" :bordered="false">
                        {{ statusLabel[s.status] || s.status }}
                      </NTag>
                      <NTag size="small" :bordered="false">{{ cycleText(s) }}</NTag>
                      <NTag v-if="s.cycle !== 'none' && s.cycle !== 'fixed'" size="small" :bordered="false" :type="s.auto_renew ? 'success' : 'warning'">
                        {{ s.auto_renew ? '到期自动记账' : '仅提醒' }}
                      </NTag>
                      <NTag v-if="s.trial_ends_on" size="small" :bordered="false" :type="s.trialDue ? 'warning' : 'default'">
                        试用至 {{ s.trial_ends_on }}
                      </NTag>
                    </div>
                  </div>
                  <div class="amount">
                    <AmountDisplay :cents="s.amount_cents" :currency="s.currency" tone="expense" />
                    <div class="hint">{{ amountSub(s) }}</div>
                  </div>
                </div>
              </template>

              <div class="details">
                <span v-if="s.cycle === 'none'">记录型订阅：不自动扣费，需要时手动记一期</span>
                <span v-else-if="s.cycle === 'fixed'">
                  到期日：<b :class="{ danger: isUrgent(s) }">{{ s.next_charge_at }}</b>（{{ s.dueLabel }}，到期只提醒不扣费）
                </span>
                <span v-else>
                  {{ s.status === 'canceled' ? '已取消' : '下次扣费' }}：<b :class="{ danger: isUrgent(s) || isOverdue(s) }">{{ s.next_charge_at }}</b>
                  <template v-if="s.status !== 'canceled'">（{{ s.dueLabel }}）</template>
                </span>
                <span v-if="s.last_charge_at">上次扣费：{{ s.last_charge_at }}</span>
                <span v-if="s.account_name">账户：{{ s.account_name }}</span>
                <span v-if="s.category_name">分类：{{ s.category_icon || '' }} {{ s.category_name }}</span>
                <span v-if="s.charge_count">已自动记账 {{ s.charge_count }} 笔</span>
                <span v-if="s.annual_cents && s.cycle !== 'monthly'">全年 {{ currencySymbol(s.currency) }}{{ (s.annual_cents / 100).toFixed(2) }}</span>
              </div>

              <div v-if="s.note" class="note">📝 {{ s.note }}</div>

              <div class="actions">
                <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onCharge(s)">立即扣费一期</NButton>
                <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onSkip(s)">跳过本期</NButton>
                <NButton size="tiny" quaternary @click="onToggle(s)">
                  {{ s.status === 'paused' || s.status === 'canceled' ? '恢复' : '暂停' }}
                </NButton>
                <NButton v-if="s.status !== 'canceled'" size="tiny" quaternary @click="onCancel(s)">标记已取消</NButton>
                <NButton size="tiny" quaternary @click="openEdit(s)">编辑</NButton>
                <NButton
                  v-if="s.vendor_url"
                  size="tiny"
                  quaternary
                  tag="a"
                  :href="s.vendor_url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  管理页 ↗
                </NButton>
                <NPopconfirm
                  @positive-click="onDelete(s)"
                  positive-text="删除"
                  negative-text="取消"
                >
                  <template #trigger>
                    <NButton size="tiny" quaternary type="error">删除</NButton>
                  </template>
                  删除订阅「{{ s.name }}」？已生成的流水不受影响。
                </NPopconfirm>
              </div>
            </NCard>
          </div>
        </div>
      </template>
    </NSpin>

    <!-- 常用服务快选（老版在右侧表单内，这里独立成卡） -->
    <NCard v-if="data.presets?.length" :bordered="true" size="small" class="preset-card">
      <template #header>
        <span>🚀 常用服务快选</span>
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

    <NDrawer v-model:show="drawerOpen" :width="440" placement="right">
      <NDrawerContent :title="editing ? '编辑订阅' : '新建订阅'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <div class="row-icon">
            <NFormItem label="图标" class="col-icon">
              <NInput v-model:value="form.icon" maxlength="4" />
            </NFormItem>
            <NFormItem label="订阅名称" required class="col-name">
              <NInput v-model:value="form.name" placeholder="例如：Netflix" maxlength="40" />
            </NFormItem>
          </div>
          <NFormItem label="套餐 / 说明（选填）">
            <NInput v-model:value="form.plan" placeholder="例如：高级会员 · 4 人共享" maxlength="40" />
          </NFormItem>
          <div class="row-2">
            <NFormItem label="每期金额" required>
              <NInput v-model:value="form.amount" placeholder="45.00" />
            </NFormItem>
            <NFormItem label="币种">
              <NSelect v-model:value="form.currency" :options="currencyOptions" />
            </NFormItem>
          </div>
          <NFormItem label="计费周期">
            <NSelect v-model:value="form.cycle" :options="cycleOptions" />
          </NFormItem>
          <NFormItem v-if="form.cycle !== 'none'" :label="nextChargeLabel">
            <NDatePicker
              v-model:value="form.next_charge_at"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NFormItem>
          <div class="row-2">
            <NFormItem label="试用结束日（选填）">
              <NDatePicker
                v-model:value="form.trial_ends_on"
                type="date"
                clearable
                style="width: 100%"
              />
            </NFormItem>
            <NFormItem label="状态">
              <NSelect v-model:value="form.status" :options="statusOptions" />
            </NFormItem>
          </div>
          <NFormItem label="提前提醒">
            <NInputNumber v-model:value="form.reminder_days" :min="0" :max="60" style="width: 100%" />
            <NText depth="3" class="hint">提前 N 天通知（0 = 不提醒）</NText>
          </NFormItem>
          <NFormItem label="扣费账户">
            <NSelect v-model:value="form.account_id" :options="accountOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="分类">
            <NSelect v-model:value="form.category_id" :options="categoryOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="管理页地址（选填）">
            <NInput v-model:value="form.vendor_url" placeholder="https://... 方便一键去取消订阅" />
          </NFormItem>
          <NFormItem label="备注（选填）">
            <NInput v-model:value="form.note" placeholder="例如：与家人共享，AA 后每人 22.5" maxlength="200" />
          </NFormItem>
          <NFormItem label="到期自动记账">
            <NSwitch v-model:value="form.auto_renew" />
            <NText depth="3" class="hint">关闭后到期只提醒、不自动生成流水，适合「还没决定要不要续」的订阅。</NText>
          </NFormItem>
        </NForm>

        <!-- 历史扣费记录（老版编辑页的「历史扣费记录」卡） -->
        <template v-if="editing">
          <NDivider title-placement="left">历史扣费记录</NDivider>
          <div v-if="!history.length" class="muted small">暂无扣费记录</div>
          <div v-for="h in history" :key="h.id" class="hist-row">
            <span class="hist-date">{{ h.txn_date }} · {{ h.note }}</span>
            <span class="hist-amt">¥{{ ((Number(h.amount_base_cents) || 0) / 100).toFixed(2) }}</span>
          </div>
        </template>

        <template #footer>
          <NSpace>
            <NButton @click="drawerOpen = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="onSubmit">
              {{ editing ? '保存修改' : '添加订阅' }}
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.intro { margin-bottom: 12px; line-height: 1.7; }
.intro b { font-weight: 600; }
.stats { margin-bottom: 12px; }
.group { margin-bottom: 14px; }
.group-title {
  font-size: 12px;
  color: var(--hl-muted, #7d8aa3);
  letter-spacing: 1px;
  margin: 0 0 8px;
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.item { transition: box-shadow .15s; }
.item:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.item.canceled { opacity: .65; }
.head { display: flex; align-items: flex-start; gap: 12px; }
.head .ico { font-size: 26px; line-height: 1.1; width: 32px; text-align: center; }
.head .meta { flex: 1; min-width: 0; }
.head .title { font-size: 14px; font-weight: 600; display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.head .title .plan { color: var(--hl-muted, #7d8aa3); font-weight: 400; font-size: 13px; }
.head .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.head .amount { text-align: right; flex: 0 0 auto; }
.head .amount :deep(.hl-amount) { font-size: 18px; font-weight: 600; }
.head .amount .hint { font-size: 11px; color: var(--hl-muted, #7d8aa3); }

.details {
  display: flex; flex-wrap: wrap; gap: 14px;
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--hl-muted, #7d8aa3);
}
.details b { color: var(--hl-text, #1f2225); font-weight: 600; }
.details b.danger { color: var(--hl-expense, #d03050); }
.note { margin-top: 8px; font-size: 11.5px; color: var(--hl-muted, #7d8aa3); }
.actions { display: flex; gap: 2px; flex-wrap: wrap; margin-top: 12px; }

.preset-card { margin-bottom: 12px; }
.preset-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.preset { font-size: 13px; }

.row-icon { display: flex; gap: 8px; }
.row-icon .col-icon { flex: 0 0 66px; }
.row-icon .col-name { flex: 1; }
.row-2 { display: flex; gap: 8px; }
.row-2 > * { flex: 1; }

.hint { font-size: 12px; }
.muted { color: var(--hl-muted, #7d8aa3); }
.small { font-size: 12px; }
.hist-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px dashed var(--hl-border, #e6eaf1);
}
.hist-amt { font-variant-numeric: tabular-nums; }
</style>
