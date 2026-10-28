<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect,
  NPopconfirm, NDrawer, NDrawerContent, NSpin, NAlert,
  NSwitch, NDatePicker, useMessage,
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
    category_id: 0,
    frequency: 'monthly',
    next_run_at: dayjs().valueOf(),
    merchant: '',
    note: '',
    is_active: true,
    auto_post: true,
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

const typeOptions = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
]
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
  const wantIncome = form.value.type === 'income'
  return categories.value
    .filter((c: any) => wantIncome ? c.kind === 'income' : c.kind === 'expense')
    .map((c: any) => ({ label: `${c.icon} ${c.path || c.name}`, value: c.id }))
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
    type: b.type === 'income' ? 'income' : 'expense',
    amount: (Number(b.amount_cents) / 100).toFixed(2),
    account_id: b.account_id || 0,
    category_id: b.category_id || 0,
    frequency: b.frequency || 'monthly',
    next_run_at: b.next_run_at ? dayjs(b.next_run_at).valueOf() : dayjs().valueOf(),
    merchant: b.merchant || '',
    note: b.note || '',
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
      category_id: form.value.category_id || null,
      frequency: form.value.frequency,
      next_run_at: dayjs(form.value.next_run_at).format('YYYY-MM-DD'),
      merchant: form.value.merchant || null,
      note: form.value.note || null,
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
    <PageHead title="周期账单" sub="适合房租、工资、会员订阅等固定收支">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建周期</NButton>
      </template>
    </PageHead>

    <NAlert type="info" :bordered="false" class="notice">
      周期账单适合房租、工资、会员订阅、房贷等固定收支。开启「自动记账」后，到期当天系统会自动生成记录；关闭则只提醒你手动确认。
    </NAlert>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="🔁"
        title="还没有周期账单"
        description="在右侧添加，例如「每月 1 号 房租 3500」"
      >
        <NButton type="primary" @click="openCreate">＋ 新建周期</NButton>
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
              <div class="meta">
                <div class="title">
                  {{ b.name }}
                  <NTag v-if="!b.is_active" type="warning" size="small" :bordered="false">已暂停</NTag>
                  <NTag v-if="b.auto_post" type="success" size="small" :bordered="false">自动记账</NTag>
                  <NTag v-else type="info" size="small" :bordered="false">仅提醒</NTag>
                </div>
                <div class="sub">
                  <span>{{ cadenceLabel[b.frequency] || b.frequency }}<span v-if="Number(b.interval_n) > 1">（每 {{ b.interval_n }} 期）</span></span>
                  <span>· 下次执行 <b class="strong">{{ b.next_run_at }}</b></span>
                  <template v-if="b.last_run_at"> · 上次 {{ b.last_run_at }}</template>
                </div>
              </div>
              <div class="right">
                <AmountDisplay
                  class="amount"
                  :cents="b.amount_cents"
                  :sign="true"
                  :tone="b.type === 'income' ? 'income' : 'expense'"
                />
                <div class="tiny muted">1 项</div>
              </div>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton size="tiny" type="primary" quaternary @click="onRun(b)">立即记一笔</NButton>
              <NButton size="tiny" quaternary @click="onToggle(b)">
                {{ b.is_active ? '暂停' : '启用' }}
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
                确定删除「{{ b.name }}」？
              </NPopconfirm>
            </NSpace>
          </template>
        </NCard>
      </div>
    </NSpin>

    <!-- 抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="440" placement="right">
      <NDrawerContent :title="editing ? '编辑周期账单' : '新建周期账单'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="60" placeholder="例如：房租" />
          </NFormItem>
          <NFormItem label="统计对象">
            <NSelect v-model:value="form.type" :options="typeOptions" />
          </NFormItem>
          <NFormItem label="金额" required>
            <NInput v-model:value="form.amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="账户" required>
            <NSelect v-model:value="form.account_id" :options="accountOptions" filterable />
          </NFormItem>
          <NFormItem label="分类">
            <NSelect v-model:value="form.category_id" :options="categoryOptions" filterable />
          </NFormItem>
          <NFormItem label="频率">
            <NSelect v-model:value="form.frequency" :options="cadenceOptions" />
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
          <NFormItem label="到期自动记账">
            <NSwitch v-model:value="form.auto_post" />
            <NText depth="3" class="hint">&nbsp;开启后到日期自动生成交易，关闭则只提醒手动确认</NText>
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
.notice { margin-bottom: 12px; border-radius: 6px; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.item { transition: box-shadow .15s; }
.item:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.head { display: flex; align-items: flex-start; gap: 12px; width: 100%; }
.head .meta { flex: 1; min-width: 0; }
.head .title {
  font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.head .sub {
  font-size: 12px; color: var(--hl-muted); display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;
}
.head .sub .strong { color: var(--hl-text); font-weight: 600; }
.head .right { text-align: right; flex-shrink: 0; }
.head .amount { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.head .tiny { font-size: 11px; margin-top: 2px; }
.head .muted { color: var(--hl-muted); }
.hint { font-size: 12px; }
</style>
