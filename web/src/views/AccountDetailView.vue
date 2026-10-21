<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NText, NTag, NDatePicker, NInput, NInputNumber, NGrid, NGridItem,
  NPopconfirm, NSpin, NAlert, NDivider, NDrawer, NDrawerContent, useMessage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import StatCard from '@/components/StatCard.vue'
import TxnList, { type TxnItem } from '@/components/TxnList.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AccountsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { ACCOUNT_TYPE_MAP } from '@/utils/accountTypes'
import { TXN_TYPE_MAP, flowOf } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const { success, error: toastError } = useFlash()
const message = useMessage()

const accountId = computed(() => Number(route.params.id))
const loading = ref(true)
const data = ref<any>(null)
const adjustOpen = ref(false)
const adjustDate = ref<number>(dayjs().valueOf())
const adjustBalance = ref<string>('')
const adjustNote = ref<string>('')

// 加载
async function load() {
  loading.value = true
  try {
    const d = await AccountsApi.get(accountId.value)
    data.value = d
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(accountId, load)

const acc = computed(() => data.value?.account)
const typeDef = computed(() => acc.value ? ACCOUNT_TYPE_MAP[acc.value.type] : null)

const groups = computed(() => {
  const items: TxnItem[] = (data.value?.items || []).map((r: any) => ({
    id: r.id,
    txn_date: r.txn_date,
    txn_time: r.txn_time,
    type: r.type,
    type_label: TXN_TYPE_MAP[r.type]?.label,
    type_icon: TXN_TYPE_MAP[r.type]?.icon,
    amount_cents: Number(r.amount_cents || 0),
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
    tags: r.tags,
    status: r.status,
    is_reimbursable: r.is_reimbursable,
    reimbursed_at: r.reimbursed_at,
    tag_names: r.tag_names,
    attachment_count: r.attachment_count,
  }))
  const byDate: Record<string, { items: TxnItem[]; income: number; expense: number }> = {}
  for (const it of items) {
    if (!byDate[it.txn_date]) byDate[it.txn_date] = { items: [], income: 0, expense: 0 }
    byDate[it.txn_date].items.push(it)
    if (it.is_income) byDate[it.txn_date].income += it.amount_cents
    if (it.is_expense) byDate[it.txn_date].expense += it.amount_cents
  }
  return Object.entries(byDate).map(([date, g]) => ({ date, ...g })).sort((a, b) => b.date.localeCompare(a.date))
})

const stats = computed(() => {
  const items = data.value?.items || []
  let income = 0, expense = 0
  for (const r of items) {
    if (flowOf(r.type) === 'in') income += Number(r.amount_cents || 0)
    else if (flowOf(r.type) === 'out') expense += Number(r.amount_cents || 0)
  }
  return { income, expense, net: income - expense, total: items.length }
})

function openAdjust() {
  adjustDate.value = dayjs().valueOf()
  adjustBalance.value = ((Number(acc.value?.balance_cents || 0)) / 100).toFixed(2)
  adjustNote.value = ''
  adjustOpen.value = true
}

async function submitAdjust() {
  try {
    const dateStr = dayjs(adjustDate.value).format('YYYY-MM-DD')
    const r = await AccountsApi.adjust(accountId.value, Number(adjustBalance.value), dateStr, adjustNote.value)
    success(`已调整（${(r.delta/100).toFixed(2)} 元）`)
    adjustOpen.value = false
    load()
  } catch (e) {
    toastError(errorMessage(e, '调整失败'))
  }
}
</script>

<template>
  <AppShell>
    <PageHead :title="acc?.name || '账户详情'" :sub="typeDef ? `${typeDef.icon} ${typeDef.label}` : ''">
      <template #actions>
        <NButton @click="router.push('/accounts')">← 返回账户列表</NButton>
        <NButton type="primary" @click="openAdjust">调整余额</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <NGrid v-if="acc" :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
        <NGridItem span="4 m:1 l:1">
          <StatCard label="当前余额" icon="💰" :value="acc.balance_cents" tone="neutral" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="初始余额" icon="🌱" :value="acc.initial_cents" tone="neutral" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="本期收入" icon="↗" :value="stats.income" tone="income" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="本期支出" icon="↘" :value="stats.expense" tone="expense" />
        </NGridItem>
      </NGrid>

      <!-- 账户元信息 -->
      <NCard v-if="acc" :bordered="true" size="small" class="info-card">
        <div class="info-grid">
          <div class="info-cell">
            <span class="label">币种</span>
            <span class="val">{{ acc.currency }}</span>
          </div>
          <div v-if="acc.institution" class="info-cell">
            <span class="label">{{ acc.type === 'credit' ? '发卡行' : '开户行' }}</span>
            <span class="val">{{ acc.institution }}</span>
          </div>
          <div v-if="acc.type === 'credit' && acc.credit_limit" class="info-cell">
            <span class="label">信用额度</span>
            <span class="val">¥{{ (Number(acc.credit_limit) / 100).toFixed(2) }}</span>
          </div>
          <div v-if="acc.type === 'credit' && acc.bill_day" class="info-cell">
            <span class="label">账单日</span>
            <span class="val">每月 {{ acc.bill_day }} 日</span>
          </div>
          <div v-if="acc.type === 'credit' && acc.due_day" class="info-cell">
            <span class="label">还款日</span>
            <span class="val">每月 {{ acc.due_day }} 日</span>
          </div>
          <div v-if="acc.note" class="info-cell full">
            <span class="label">备注</span>
            <span class="val">{{ acc.note }}</span>
          </div>
        </div>
      </NCard>

      <NCard :bordered="true" class="txn-card" title="该账户的交易">
        <Empty v-if="!loading && !stats.total" icon="🗒️" title="还没有交易" description="使用此账户记一笔吧" />
        <TxnList v-else :groups="groups" @click-item="(it: TxnItem) => router.push(`/transactions/${it.id}`)" />
      </NCard>
    </NSpin>

    <!-- 余额调整抽屉 -->
    <NDrawer v-model:show="adjustOpen" :width="420" placement="right">
      <NDrawerContent title="调整账户余额" :native-scrollbar="false">
        <NAlert type="info" :show-icon="true" class="tip">
          当前余额：<strong>¥{{ ((Number(acc?.balance_cents || 0))/100).toFixed(2) }}</strong>
        </NAlert>
        <NGrid :cols="2" :x-gap="12" :y-gap="12" class="form">
          <NGridItem>
            <div class="form-label">调整日期</div>
            <NDatePicker
              v-model:value="adjustDate"
              type="date"
              :clearable="false"
              style="width: 100%"
            />
          </NGridItem>
          <NGridItem>
            <div class="form-label">实际余额</div>
            <NInput v-model:value="adjustBalance" placeholder="0.00" />
          </NGridItem>
        </NGrid>
        <div class="form-label" style="margin-top: 12px">备注（可选）</div>
        <NInput v-model:value="adjustNote" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="如：盘点修正" />
        <template #footer>
          <NSpace>
            <NButton @click="adjustOpen = false">取消</NButton>
            <NButton type="primary" @click="submitAdjust">确认调整</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.info-card { margin-top: 12px; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.info-cell { display: flex; flex-direction: column; gap: 2px; }
.info-cell.full { grid-column: 1 / -1; }
.info-cell .label { font-size: 12px; color: var(--hl-muted); }
.info-cell .val { font-size: 14px; font-weight: 500; }

.txn-card { margin-top: 12px; }
.tip { margin-bottom: 12px; }
.form .form-label { font-size: 12px; color: var(--hl-muted); margin-bottom: 4px; }
</style>
