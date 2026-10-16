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
import AmountDisplay from '@/components/AmountDisplay.vue'
import { RecurringApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPES, TXN_TYPE_MAP, kindOf, flowOf } from '@/utils/txnTypes'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const items = ref<any[]>([])

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
    type: 'expense',
    amount: '',
    account_id: 0,
    to_account_id: 0,
    category_id: 0,
    frequency: 'monthly',
    interval_n: 1,
    day_of_month: 1,
    weekday: 1,
    next_run_at: dayjs().valueOf(),
    note: '',
    merchant: '',
    is_active: true,
    auto_post: false,
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await RecurringApi.list()
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
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadOptions()
  load()
})
watch(() => session.currentLedger?.id, load)

const typeOptions = TXN_TYPES.map((t) => ({ label: `${t.icon} ${t.label}`, value: t.key }))
const cadenceOptions = [
  { label: '每月', value: 'monthly' },
  { label: '每周', value: 'weekly' },
  { label: '每年', value: 'yearly' },
  { label: '每日', value: 'daily' },
]
const accountOptions = computed(() => [
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])
const categoryOptions = computed(() => {
  const k = kindOf(form.value.type)
  return categories.value.filter((c: any) => c.kind === k).map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))
})

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  drawerOpen.value = true
}

function openEdit(b: any) {
  editing.value = b
  form.value = {
    name: b.name || b.note || b.merchant || '',
    type: b.type,
    amount: (Number(b.amount_cents) / 100).toFixed(2),
    account_id: b.account_id || 0,
    to_account_id: b.to_account_id || 0,
    category_id: b.category_id || 0,
    frequency: b.frequency || 'monthly',
    interval_n: b.interval_n || 1,
    day_of_month: b.day_of_month || 1,
    weekday: b.weekday ?? 1,
    next_run_at: b.next_run_at ? dayjs(b.next_run_at).valueOf() : dayjs().valueOf(),
    note: b.note || '',
    merchant: b.merchant || '',
    is_active: !!b.is_active,
    auto_post: !!b.auto_post,
  }
  drawerOpen.value = true
}

async function onSubmit() {
  const amt = Number(String(form.value.amount).replace(/[,\s¥￥$]/g, ''))
  if (!form.value.name?.trim()) { message.warning('请填写名称'); return }
  if (!amt) { message.warning('请填写金额'); return }
  if (!form.value.account_id) { message.warning('请选择账户'); return }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      type: form.value.type,
      amount: form.value.amount,
      account_id: form.value.account_id,
      to_account_id: form.value.to_account_id || null,
      category_id: form.value.category_id || null,
      frequency: form.value.frequency,
      interval_n: form.value.interval_n,
      day_of_month: form.value.frequency === 'monthly' ? form.value.day_of_month : null,
      weekday: form.value.frequency === 'weekly' ? form.value.weekday : null,
      next_run_at: dayjs(form.value.next_run_at).format('YYYY-MM-DD'),
      note: form.value.note,
      merchant: form.value.merchant,
      is_active: form.value.is_active ? 1 : 0,
      auto_post: form.value.auto_post ? 1 : 0,
    }
    if (editing.value) {
      await RecurringApi.update(Number(editing.value.id), payload)
      success('已更新')
    } else {
      await RecurringApi.create(payload)
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
    await RecurringApi.toggle(Number(b.id))
    success(b.is_active ? '已停用' : '已启用')
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}

async function onRun(b: any) {
  try {
    const r = await RecurringApi.run(Number(b.id))
    if (r?.id) success('已补登一笔')
    else message.info('没有需要补登的')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '补登失败')
  }
}

async function onDelete(b: any) {
  try {
    await RecurringApi.remove(Number(b.id))
    success('已删除')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const cadenceLabel: Record<string, string> = {
  monthly: '每月', weekly: '每周', yearly: '每年', daily: '每日',
}
</script>

<template>
  <AppShell>
    <PageHead title="周期账单" sub="按月/周/年/自定义周期自动入账或提醒">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建规则</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="🔁"
        title="还没有周期规则"
        description="订阅、房租、贷款、保险等都可设为周期账单"
      >
        <NButton type="primary" @click="openCreate">＋ 新建规则</NButton>
      </Empty>

      <div v-else class="grid">
        <NCard
          v-for="b in items"
          :key="b.id"
          :bordered="true"
          size="small"
          class="item"
        >
          <template #header>
            <div class="head">
              <span class="ico">{{ TXN_TYPE_MAP[b.type]?.icon || '·' }}</span>
              <div class="meta">
                <div class="title">
                  {{ b.note || TXN_TYPE_MAP[b.type]?.label || '周期账单' }}
                  <NTag v-if="b.merchant" size="tiny" :bordered="false" type="default">{{ b.merchant }}</NTag>
                </div>
                <div class="sub">
                  <span>{{ cadenceLabel[b.frequency] || b.frequency }}<span v-if="b.interval_n > 1"> · {{ b.interval_n }} 期</span></span>
                  <span v-if="b.category_name" class="dot">·</span>
                  <span v-if="b.category_name">{{ b.category_icon }} {{ b.category_name }}</span>
                  <span class="dot">·</span>
                  <span>{{ b.account_name }}</span>
                </div>
              </div>
              <div class="amount" :class="[flowOf(b.type) === 'in' ? 'income' : 'expense']">
                <AmountDisplay :cents="b.amount_cents" :sign="flowOf(b.type) !== 'move'" :tone="flowOf(b.type) === 'in' ? 'income' : flowOf(b.type) === 'out' ? 'expense' : 'neutral'" />
              </div>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton size="tiny" quaternary @click="onRun(b)">补登</NButton>
              <NButton size="tiny" quaternary @click="onToggle(b)">
                {{ b.is_active ? '停用' : '启用' }}
              </NButton>
              <NButton size="tiny" quaternary @click="openEdit(b)">编辑</NButton>
              <NPopconfirm
                @positive-click="onDelete(b)"
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
            <NTag :type="b.is_active ? 'success' : 'default'" size="small" :bordered="false">
              {{ b.is_active ? '启用中' : '已停用' }}
            </NTag>
            <NTag v-if="b.auto_post" type="info" size="small" :bordered="false">自动入账</NTag>
            <NText depth="3" class="anchor">下次执行：{{ b.next_run_at }}</NText>
          </div>
        </NCard>
      </div>
    </NSpin>

    <!-- 抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="440" placement="right">
      <NDrawerContent :title="editing ? '编辑周期规则' : '新建周期规则'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="60" placeholder="如：房租、网费" />
          </NFormItem>
          <NFormItem label="类型">
            <NSelect v-model:value="form.type" :options="typeOptions" :disabled="!!editing" />
          </NFormItem>
          <NFormItem label="金额" required>
            <NInput v-model:value="form.amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="账户" required>
            <NSelect v-model:value="form.account_id" :options="accountOptions" filterable />
          </NFormItem>
          <NFormItem v-if="form.type !== 'transfer'" label="分类">
            <NSelect v-model:value="form.category_id" :options="categoryOptions" filterable />
          </NFormItem>
          <NFormItem label="周期">
            <NSelect v-model:value="form.frequency" :options="cadenceOptions" />
          </NFormItem>
          <NFormItem v-if="form.frequency === 'monthly'" label="每月几号">
            <NInputNumber v-model:value="form.day_of_month" :min="1" :max="31" style="width: 100%" />
          </NFormItem>
          <NFormItem v-if="form.frequency === 'weekly'" label="每周几">
            <NSelect
              v-model:value="form.weekday"
              :options="[
                { label: '周一', value: 1 },
                { label: '周二', value: 2 },
                { label: '周三', value: 3 },
                { label: '周四', value: 4 },
                { label: '周五', value: 5 },
                { label: '周六', value: 6 },
                { label: '周日', value: 0 },
              ]"
            />
          </NFormItem>
          <NFormItem v-if="form.frequency !== 'daily' && form.frequency !== 'yearly'" label="间隔（每 N 期执行）">
            <NInputNumber v-model:value="form.interval_n" :min="1" :max="12" style="width: 100%" />
          </NFormItem>
          <NFormItem label="下次执行日">
            <NDatePicker
              v-model:value="form.next_run_at"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="商户">
            <NInput v-model:value="form.merchant" />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="form.note" />
          </NFormItem>
          <NFormItem label="自动入账">
            <NSwitch v-model:value="form.auto_post" />
            <NText depth="3" class="hint">&nbsp;开启后到日期自动生成交易（默认仅提醒）</NText>
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.item { transition: box-shadow .15s; }
.item:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.head { display: flex; align-items: center; gap: 12px; }
.head .ico { font-size: 22px; width: 32px; text-align: center; }
.head .meta { flex: 1; min-width: 0; }
.head .title { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
.head .sub { font-size: 12px; color: var(--hl-muted); display: flex; gap: 6px; flex-wrap: wrap; }
.head .sub .dot { opacity: .5; }
.head .amount { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.head .amount.income { color: var(--hl-income); }
.head .amount.expense { color: var(--hl-expense); }
.footer { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.footer .anchor { font-size: 12px; }
.hint { font-size: 12px; }
</style>
