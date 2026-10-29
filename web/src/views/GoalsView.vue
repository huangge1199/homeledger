<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect, NInputNumber,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin, NGrid, NGridItem,
  NSwitch, NProgress, useMessage, NDatePicker,
} from 'naive-ui'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { GoalsApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const items = ref<any[]>([])

const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref(emptyForm())

const depositOpen = ref(false)
const depositGoal = ref<any>(null)
const depositForm = ref({ amount: '', account_id: 0, category_id: 0, deposit_date: dayjs().valueOf(), note: '' })

const accounts = ref<any[]>([])
const categories = ref<any[]>([])

function emptyForm() {
  return {
    name: '',
    icon: '🐷',
    target_amount: '',
    saved_amount: '',
    target_date: null as number | null,
    account_id: 0,
    status: 'active',
    note: '',
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await GoalsApi.list()
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

const accountOptions = computed(() => [
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])
const categoryOptions = computed(() =>
  categories.value.filter((c: any) => c.kind === 'expense').map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))
)

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  drawerOpen.value = true
}

function openEdit(g: any) {
  editing.value = g
  form.value = {
    name: g.name,
    icon: g.icon || '🐷',
    target_amount: (Number(g.target_cents) / 100).toFixed(2),
    saved_amount: '',
    target_date: g.target_date ? dayjs(g.target_date).valueOf() : null,
    account_id: g.account_id || 0,
    // 历史数据可能是 achieved，统一成 done
    status: g.status === 'achieved' || g.status === 'done' ? 'done' : (g.status || 'active'),
    note: g.note || '',
  }
  drawerOpen.value = true
}

async function onSubmit() {
  const amt = Number(String(form.value.target_amount).replace(/[,\s¥￥$]/g, ''))
  if (!form.value.name) { message.warning('请填写目标名'); return }
  if (!amt) { message.warning('请填写目标金额'); return }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      icon: form.value.icon,
      target_amount: form.value.target_amount,
      target_date: form.value.target_date ? dayjs(form.value.target_date).format('YYYY-MM-DD') : null,
      account_id: form.value.account_id || null,
      status: form.value.status,
      note: form.value.note,
    }
    if (editing.value) {
      await GoalsApi.update(Number(editing.value.id), payload)
      success('已更新')
    } else {
      payload.saved_amount = form.value.saved_amount
      await GoalsApi.create(payload)
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

function openDeposit(g: any) {
  depositGoal.value = g
  depositForm.value = {
    amount: '',
    account_id: g.account_id || (accounts.value[0]?.id ?? 0),
    category_id: 0,
    deposit_date: dayjs().valueOf(),
    note: '',
  }
  depositOpen.value = true
}

async function onDeposit() {
  if (!depositGoal.value) return
  const amt = Number(String(depositForm.value.amount).replace(/[,\s¥￥$]/g, ''))
  if (!amt) { message.warning('请填写金额'); return }
  try {
    await GoalsApi.deposit(Number(depositGoal.value.id), {
      amount: depositForm.value.amount,
      account_id: depositForm.value.account_id || null,
      category_id: depositForm.value.category_id || null,
      deposit_date: dayjs(depositForm.value.deposit_date).format('YYYY-MM-DD'),
      note: depositForm.value.note,
    })
    success('已存入')
    depositOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '存入失败')
  }
}

async function onDelete(g: any) {
  try {
    await GoalsApi.remove(Number(g.id))
    success('已删除')
    load()
  } catch (e) { toastError(errorMessage(e, '删除失败')) }
}

const goalProgress = (g: any) => {
  const target = Number(g.target_cents) || 0
  const saved = Number(g.saved_cents) || 0
  const remain = Math.max(0, target - saved)
  // 允许负数：负数表示已逾期多少天
  const days = g.target_date ? dayjs(g.target_date).diff(dayjs().startOf('day'), 'day') : null
  return {
    ratio: target > 0 ? Math.min(100, (saved / target) * 100) : 0,
    saved,
    target,
    remain,
    reached: saved >= target,
    days,
    daysLabel: days === null ? null : (days >= 0 ? `还有 ${days} 天` : `已逾期 ${-days} 天`),
    // 每月需存：剩余金额 / 剩余月数（按 30 天/月），四舍五入到分
    needPerMonth: days !== null && days > 0 && remain > 0
      ? Math.ceil(remain / Math.max(1, days / 30))
      : null,
  }
}
const isDone = (g: any) => g.status === 'done' || g.status === 'achieved'
</script>

<template>
  <AppShell>
    <PageHead title="储蓄目标" sub="为目标攒钱，自动扣账户">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建目标</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="🎯"
        title="还没有储蓄目标"
        description="为梦想（旅行/房子/教育）设个目标，一点点攒起来"
      >
        <NButton type="primary" @click="openCreate">＋ 新建目标</NButton>
      </Empty>

      <div v-else class="grid">
        <NCard
          v-for="g in items"
          :key="g.id"
          :bordered="true"
          size="small"
          class="goal-card"
        >
          <template #header>
            <div class="head">
              <span class="ico">{{ g.icon || '🐷' }}</span>
              <div class="meta">
                <div class="title">
                  {{ g.name }}
                  <NTag v-if="isDone(g)" size="tiny" type="success" :bordered="false">已达成</NTag>
                </div>
                <div class="sub">
                  <NText depth="3">
                    目标
                    <AmountDisplay :cents="g.target_cents" :small="true" />
                    <span v-if="g.target_date"> · 目标日 {{ g.target_date }}</span>
                    <span v-if="g.account_name"> · 存入账户 {{ g.account_name }}</span>
                    <span v-if="g.note"> · {{ g.note }}</span>
                  </NText>
                </div>
              </div>
            </div>
          </template>
          <template #header-extra>
            <NSpace size="small">
              <NButton size="tiny" quaternary @click="openEdit(g)">编辑</NButton>
              <NPopconfirm
                @positive-click="onDelete(g)"
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

          <div class="amount-row">
            <div class="saved">
              <AmountDisplay :cents="goalProgress(g).saved" :sign="true" tone="income" />
              <span class="muted">/ <AmountDisplay :cents="g.target_cents" tone="neutral" /></span>
            </div>
            <div v-if="!goalProgress(g).reached" class="remain">
              差 <AmountDisplay :cents="goalProgress(g).remain" />
            </div>
            <div v-else class="reached">
              ✨ 已达成
            </div>
          </div>

          <NProgress
            type="line"
            :percentage="goalProgress(g).ratio"
            :status="goalProgress(g).reached ? 'success' : 'default'"
            :height="10"
            :border-radius="5"
            class="progress"
          />

          <div class="footer">
            <span>📊 完成 {{ goalProgress(g).ratio.toFixed(1) }}%</span>
            <span v-if="!goalProgress(g).reached && goalProgress(g).daysLabel">📅 {{ goalProgress(g).daysLabel }}</span>
            <span v-if="!goalProgress(g).reached && goalProgress(g).needPerMonth">
              💰 每月需存 <AmountDisplay :cents="goalProgress(g).needPerMonth" />
            </span>
            <NSpace size="small" @click.stop>
              <NButton type="primary" size="small" @click="openDeposit(g)">+ 存入</NButton>
            </NSpace>
          </div>
        </NCard>
      </div>
    </NSpin>

    <!-- 抽屉：新建/编辑目标 -->
    <NDrawer v-model:show="drawerOpen" :width="420" placement="right">
      <NDrawerContent :title="editing ? '编辑目标' : '新建目标'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="30" />
          </NFormItem>
          <NFormItem label="图标">
            <NInput v-model:value="form.icon" maxlength="4" />
          </NFormItem>
          <NFormItem label="目标金额" required>
            <NInput v-model:value="form.target_amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem v-if="!editing" label="已存金额">
            <NInput v-model:value="form.saved_amount" placeholder="0.00（可选，不生成流水）" />
          </NFormItem>
          <NFormItem label="截止日期">
            <NDatePicker
              v-model:value="form.target_date"
              type="date"
              clearable
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="关联账户">
            <NSelect v-model:value="form.account_id" :options="accountOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="form.status"
              :options="[
                { label: '进行中', value: 'active' },
                { label: '已达成', value: 'done' },
                { label: '已归档', value: 'archived' },
              ]"
            />
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

    <!-- 抽屉：存入 -->
    <NDrawer v-model:show="depositOpen" :width="380" placement="right">
      <NDrawerContent :title="`存入：${depositGoal?.name || ''}`" :native-scrollbar="false">
        <NForm label-placement="top" :model="depositForm">
          <NFormItem label="金额" required>
            <NInput v-model:value="depositForm.amount" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="从哪个账户">
            <NSelect v-model:value="depositForm.account_id" :options="accountOptions" filterable />
          </NFormItem>
          <NFormItem label="分类">
            <NSelect v-model:value="depositForm.category_id" :options="categoryOptions" filterable clearable />
          </NFormItem>
          <NFormItem label="日期">
            <NDatePicker
              v-model:value="depositForm.deposit_date"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="depositForm.note" />
          </NFormItem>
          <NAlert type="info" :show-icon="true">
            存入后会生成一笔「支出」交易从对应账户扣款，并累计到目标进度中。
          </NAlert>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="depositOpen = false">取消</NButton>
            <NButton type="primary" @click="onDeposit">确认存入</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.goal-card { transition: box-shadow .15s; }
.goal-card:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.head { display: flex; align-items: center; gap: 10px; }
.head .ico { font-size: 24px; }
.head .meta { flex: 1; min-width: 0; }
.head .title { font-size: 15px; font-weight: 500; }
.head .sub { font-size: 12px; color: var(--hl-muted); }

.amount-row {
  display: flex; align-items: baseline; justify-content: space-between;
  margin: 8px 0;
}
.amount-row .saved { font-size: 18px; font-weight: 600; }
.amount-row .saved .muted { color: var(--hl-muted); font-weight: 400; font-size: 13px; }
.amount-row .remain { font-size: 12px; color: var(--hl-muted); }
.amount-row .reached { font-size: 13px; color: var(--hl-income); font-weight: 500; }
.progress { margin: 6px 0; }
.footer { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--hl-muted); margin-top: 8px; }
.footer > :last-child { margin-left: auto; }
</style>
