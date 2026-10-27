<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NSelect, NText, NInput, NInputNumber, NForm, NFormItem, NTag,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NSwitch, NAlert, NGrid, NGridItem,
  NSpin, NDatePicker,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import StatCard from '@/components/StatCard.vue'
import { AccountsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_MAP, type AccountTypeDef } from '@/utils/accountTypes'
import { fmtPlain } from '@/utils/money'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)

interface Form {
  name: string
  type: string
  icon: string
  currency: string
  initial_balance: string
  credit_limit: string
  bill_day: number | null
  due_day: number | null
  institution: string
  note: string
  include_in_net: boolean
}
const form = reactive<Form>(emptyForm())

function emptyForm(): Form {
  return {
    name: '',
    type: 'cash',
    icon: '💵',
    currency: session.baseCurrency || 'CNY',
    initial_balance: '0',
    credit_limit: '',
    bill_day: null,
    due_day: null,
    institution: '',
    note: '',
    include_in_net: true,
  }
}

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    data.value = await AccountsApi.list()
  } catch (e) {
    toastError(errorMessage(e, '加载账户失败'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => session.currentLedger?.id, load)

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  drawerOpen.value = true
}

function openEdit(acc: any) {
  editing.value = acc
  Object.assign(form, {
    name: acc.name,
    type: acc.type,
    icon: acc.icon,
    currency: acc.currency,
    initial_balance: (Number(acc.initial_cents || 0) / 100).toFixed(2),
    credit_limit: acc.credit_limit ? (Number(acc.credit_limit) / 100).toFixed(2) : '',
    bill_day: acc.bill_day,
    due_day: acc.due_day,
    institution: acc.institution || '',
    note: acc.note || '',
    include_in_net: !!acc.include_in_net,
  })
  drawerOpen.value = true
}

async function onSubmit() {
  if (!form.name?.trim()) {
    message.warning('请填写账户名称')
    return
  }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.name.trim().slice(0, 30),
      type: form.type,
      icon: form.icon || ACCOUNT_TYPE_MAP[form.type]?.icon || '💳',
      currency: form.currency || session.baseCurrency || 'CNY',
      initial_balance: form.initial_balance,
      credit_limit: form.credit_limit || null,
      bill_day: form.bill_day,
      due_day: form.due_day,
      institution: form.institution || null,
      note: form.note || null,
      include_in_net: form.include_in_net ? 1 : 0,
    }
    if (editing.value) {
      await AccountsApi.update(Number(editing.value.id), payload)
      success('已保存')
    } else {
      await AccountsApi.create(payload)
      success('已创建账户')
    }
    drawerOpen.value = false
    load()
  } catch (e) {
    toastError(errorMessage(e, '保存失败'))
  } finally {
    submitting.value = false
  }
}

async function toggleArchive(acc: any) {
  try {
    await AccountsApi.archive(Number(acc.id))
    success(acc.is_archived ? '已恢复' : '已停用（历史记录保留）')
    load()
  } catch (e) {
    toastError(errorMessage(e, '操作失败'))
  }
}

async function onDelete(acc: any) {
  try {
    await AccountsApi.remove(Number(acc.id))
    success('账户已删除')
    load()
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '删除失败'
    if (msg.includes('无法删除') || msg.includes('下有')) {
      if (window.confirm(msg + '\n\n是否改为停用？')) {
        await toggleArchive(acc)
      }
    } else {
      toastError(msg)
    }
  }
}

const typeOptions = computed(() => ACCOUNT_TYPES.map((t) => ({ label: `${t.icon} ${t.label}`, value: t.key })))

const overview = computed(() => data.value?.overview || { net: 0, assets: 0, liabilities: 0 })

/** 分组顺序对齐老版 ACCOUNT_TYPES 定义顺序（老版按数组顺序遍历，不是字母序） */
const groupList = computed<{ type: string; def: AccountTypeDef; items: any[]; total: number }[]>(() => {
  const groups = (data.value?.groups || {}) as Record<string, any[]>
  return ACCOUNT_TYPES
    .filter((t) => groups[t.key]?.length)
    .map((t) => {
      const items = groups[t.key]
      const total = items.reduce((s, a) => s + Number(a.balance_cents || 0), 0)
      return { type: t.key, def: t, items, total }
    })
})

const activeCount = computed(() => (data.value?.accounts || []).length)
const archivedCount = computed(() => (data.value?.archived || []).length)

/** 账户副行：币种 · 尾号 · 账单日 · 还款日（对齐老版） */
function accountMeta(a: any): string {
  const parts: string[] = [a.currency || 'CNY']
  if (a.card_no) parts.push(`尾号 ${a.card_no}`)
  if (a.bill_day) parts.push(`账单日 ${a.bill_day} 号`)
  if (a.due_day) parts.push(`还款日 ${a.due_day} 号`)
  return parts.join(' · ')
}

/** 余额颜色：负数或负债类账户都标红（对齐老版 expense 判定） */
function amountTone(a: any): 'income' | 'expense' | 'neutral' {
  if (Number(a.balance_cents) < 0) return 'expense'
  if (a.isLiability) return 'expense'
  return 'neutral'
}

/* --- 余额调整（老版在列表页行内展开，新版用抽屉） --- */
const adjustOpen = ref(false)
const adjustTarget = ref<any>(null)
const adjustDate = ref<number>(dayjs().valueOf())
const adjustBalance = ref<string>('')
const adjustNote = ref<string>('')

function openAdjust(a: any) {
  adjustTarget.value = a
  adjustDate.value = dayjs().valueOf()
  adjustBalance.value = (Number(a.balance_cents || 0) / 100).toFixed(2)
  adjustNote.value = ''
  adjustOpen.value = true
}

async function submitAdjust() {
  if (!adjustTarget.value) return
  submitting.value = true
  try {
    const r = await AccountsApi.adjust(
      Number(adjustTarget.value.id),
      Number(adjustBalance.value),
      dayjs(adjustDate.value).format('YYYY-MM-DD'),
      adjustNote.value
    )
    success(`已调整（${(r.data.delta / 100).toFixed(2)} 元）`)
    adjustOpen.value = false
    load()
  } catch (e) {
    toastError(errorMessage(e, '调整失败'))
  } finally {
    submitting.value = false
  }
}

/* --- 币种（对齐老版 7 种，默认取站点本位币） --- */
const currencyOptions = [
  { label: 'CNY 人民币', value: 'CNY' },
  { label: 'USD 美元', value: 'USD' },
  { label: 'EUR 欧元', value: 'EUR' },
  { label: 'HKD 港币', value: 'HKD' },
  { label: 'JPY 日元', value: 'JPY' },
  { label: 'GBP 英镑', value: 'GBP' },
  { label: 'SGD 新元', value: 'SGD' },
]

// Naive UI message (全局提示)
import { useMessage } from 'naive-ui'
const message = useMessage()
</script>

<template>
  <AppShell>
    <PageHead title="账户管理" sub="管理你的所有账户，含资产负债">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建账户</NButton>
      </template>
    </PageHead>

    <!-- 总览 -->
    <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
      <NGridItem span="3 m:1 l:1">
        <StatCard
          label="净资产"
          icon="🪙"
          :value="overview.net"
          :tone="overview.net >= 0 ? 'neutral' : 'expense'"
          hint="资产 − 负债"
        />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard label="总资产" icon="💰" :value="overview.assets" tone="neutral" hint="现金、储蓄、虚拟、投资等" />
      </NGridItem>
      <NGridItem span="3 m:1 l:1">
        <StatCard label="总负债" icon="💳" :value="overview.liabilities" tone="expense" hint="信用卡、贷款、应付款" />
      </NGridItem>
    </NGrid>

    <!-- 在用账户计数 + 添加入口 -->
    <div class="row-between count-row">
      <span class="muted small">
        共 {{ activeCount }} 个在用账户<template v-if="archivedCount">，{{ archivedCount }} 个已停用</template>
      </span>
      <NButton type="primary" size="small" @click="openCreate">＋ 添加账户</NButton>
    </div>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && (!data?.accounts || data.accounts.length === 0)"
        icon="💳"
        title="还没有账户"
        description="添加现金、银行卡、支付宝、微信钱包等账户后即可开始记账"
      >
        <NButton type="primary" @click="openCreate">＋ 新建账户</NButton>
      </Empty>

      <template v-else>
        <NCard
          v-for="g in groupList"
          :key="g.type"
          :bordered="true"
          size="small"
          class="group-card"
        >
          <template #header>
            <div class="row-between">
              <span class="group-title">
                <span class="ico">{{ g.def?.icon || '📦' }}</span>
                <span class="name">{{ g.def?.label || g.type }}</span>
                <NTag :bordered="false" type="default" size="small">{{ g.items.length }} 个</NTag>
              </span>
              <NText depth="3" class="small">合计 ¥{{ fmtPlain(g.total) }}</NText>
            </div>
          </template>
          <div class="acc-grid">
            <div
              v-for="a in g.items"
              :key="a.id"
              class="acc-item"
              :class="{ liability: a.isLiability }"
              @click="router.push(`/accounts/${a.id}`)"
            >
              <div class="top">
                <div class="ico" :class="{ liability: a.isLiability }">{{ a.icon || '💳' }}</div>
                <div class="info">
                  <div class="name-row">
                    <span class="acc-name ellipsis">{{ a.icon }} {{ a.name }}</span>
                    <NTag v-if="a.is_archived" size="tiny" :bordered="false" type="warning">已停用</NTag>
                  </div>
                  <div class="meta">{{ accountMeta(a) }}</div>
                </div>
                <div class="right">
                  <div class="amount" :class="{ neg: amountTone(a) === 'expense' }">
                    <AmountDisplay :cents="a.balance_cents" :tone="amountTone(a)" />
                  </div>
                  <div class="tiny muted flow">近30天 −{{ fmtPlain(a.flow?.out || 0) }} / +{{ fmtPlain(a.flow?.inflow || 0) }}</div>
                </div>
              </div>
              <div class="actions" @click.stop>
                <NButton size="tiny" quaternary @click="router.push(`/accounts/${a.id}`)">明细</NButton>
                <NButton size="tiny" quaternary @click="openEdit(a)">编辑</NButton>
                <NButton size="tiny" quaternary @click="openAdjust(a)">余额调整</NButton>
                <NButton size="tiny" quaternary @click="toggleArchive(a)">
                  {{ a.is_archived ? '恢复' : '停用' }}
                </NButton>
                <NPopconfirm
                  @positive-click="onDelete(a)"
                  positive-text="删除"
                  negative-text="取消"
                >
                  <template #trigger>
                    <NButton size="tiny" quaternary type="error">删除</NButton>
                  </template>
                  确定删除账户「{{ a.name }}」？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </NCard>

        <!-- 已停用账户 -->
        <NCard v-if="archivedCount" :bordered="true" size="small" class="archived-card">
          <template #header>
            <div class="row-between">
              <span class="group-title"><span class="ico">📦</span>已停用账户</span>
              <NText depth="3" class="small">历史记录仍完整保留</NText>
            </div>
          </template>
          <div class="acc-grid">
            <div v-for="a in data.archived" :key="a.id" class="acc-item archived">
              <div class="top">
                <div class="ico">{{ a.icon }}</div>
                <div class="info">
                  <div class="name-row">
                    <span class="acc-name">{{ a.name }}</span>
                  </div>
                  <div class="meta">{{ accountMeta(a) }}</div>
                </div>
                <div class="right">
                  <div class="amount" :class="{ neg: amountTone(a) === 'expense' }">
                    <AmountDisplay :cents="a.balance_cents" :tone="amountTone(a)" />
                  </div>
                </div>
              </div>
              <div class="actions" @click.stop>
                <NButton size="tiny" quaternary @click="toggleArchive(a)">恢复</NButton>
              </div>
            </div>
          </div>
        </NCard>
      </template>
    </NSpin>

    <!-- 新建/编辑抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="480" placement="right">
      <NDrawerContent
        :title="editing ? '编辑账户' : '新建账户'"
        :native-scrollbar="false"
      >
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" placeholder="如：招商银行储蓄卡" maxlength="30" show-count />
          </NFormItem>
          <NFormItem label="类型">
            <NSelect v-model:value="form.type" :options="typeOptions" @update:value="(v: string) => form.icon = ACCOUNT_TYPE_MAP[v]?.icon || '💳'" />
          </NFormItem>
          <NFormItem label="图标">
            <NInput v-model:value="form.icon" placeholder="💳" maxlength="4" />
          </NFormItem>
          <NFormItem label="币种">
            <NSelect v-model:value="form.currency" :options="currencyOptions" />
          </NFormItem>
          <NFormItem :label="editing ? '初始余额' : '余额'">
            <NInput v-model:value="form.initial_balance" placeholder="0.00" />
          </NFormItem>

          <NDivider title-placement="left">额度与账期</NDivider>
          <NFormItem label="额度（信用卡）">
            <NInput v-model:value="form.credit_limit" placeholder="0.00" />
          </NFormItem>
          <NGrid :cols="2" :x-gap="12">
            <NGridItem>
              <NFormItem label="账单日">
                <NInputNumber v-model:value="form.bill_day" :min="1" :max="31" placeholder="如 5" style="width: 100%" />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem label="还款日">
                <NInputNumber v-model:value="form.due_day" :min="1" :max="31" placeholder="如 25" style="width: 100%" />
              </NFormItem>
            </NGridItem>
          </NGrid>
          <NFormItem label="发卡行 / 开户行">
            <NInput v-model:value="form.institution" placeholder="如：招商银行" maxlength="40" />
          </NFormItem>

          <NFormItem label="计入净资产">
            <NSwitch v-model:value="form.include_in_net" />
            <NText depth="3" class="hint">&nbsp;关闭后该账户余额不计入总览的「净资产」</NText>
          </NFormItem>
          <NFormItem label="备注">
            <NInput
              v-model:value="form.note"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="可选"
              maxlength="200"
            />
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

    <!-- 余额调整抽屉（老版是列表页行内展开表单） -->
    <NDrawer v-model:show="adjustOpen" :width="420" placement="right">
      <NDrawerContent title="调整账户余额" :native-scrollbar="false">
        <NAlert type="info" :show-icon="true" class="tip">
          <div>当前余额：<strong>¥{{ fmtPlain(adjustTarget?.balance_cents || 0) }}</strong></div>
          <div class="tiny">把账面余额对齐到实际金额，差额会记为一笔「余额调整」，不影响收支统计。</div>
        </NAlert>
        <NForm label-placement="top" :model="form">
          <NFormItem label="实际余额">
            <NInput v-model:value="adjustBalance" placeholder="0.00" />
          </NFormItem>
          <NFormItem label="日期">
            <NDatePicker v-model:value="adjustDate" type="date" :clearable="false" style="width: 100%" />
          </NFormItem>
          <NFormItem label="说明">
            <NInput v-model:value="adjustNote" placeholder="例如：对账差异" maxlength="60" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="adjustOpen = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="submitAdjust">确认调整</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.stats { margin-bottom: 12px; }
.count-row { margin-bottom: 12px; align-items: center; }
.group-card { margin-bottom: 12px; }
.group-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.group-title .ico { font-size: 16px; }
.archived-card { opacity: .85; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: var(--hl-muted, #7d8aa3); }
.small { font-size: 12px; }
.tiny { font-size: 11.5px; }
.hint { font-size: 12px; }
.tip { margin-bottom: 12px; }

.acc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}
.acc-item {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px;
  background: var(--hl-card-2, #f7f8fb);
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
  border: 1px solid transparent;
}
.acc-item:hover { background: var(--hl-primary-2, #e8efff); border-color: var(--hl-primary, #3d6df5); }
.acc-item.archived { opacity: .65; cursor: default; }

/* 上行：图标 | 名称+副行 | 金额+近30天 */
.acc-item .top { display: flex; align-items: center; gap: 12px; }
.acc-item .ico {
  width: 40px; height: 40px; flex: 0 0 40px;
  background: #fff;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  border: 1px solid var(--hl-border, #e6eaf1);
}
.acc-item .ico.liability { background: #feefef; border-color: #f4c4c4; }
.acc-item .info { flex: 1; min-width: 0; }
.acc-item .name-row { display: flex; align-items: center; gap: 4px; }
.acc-item .acc-name { font-size: 14px; font-weight: 500; }
.acc-item .meta { font-size: 11px; margin-top: 2px; color: var(--hl-muted); }

.acc-item .right { text-align: right; flex: 0 0 auto; }
.acc-item .amount { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 80px; text-align: right; }
.acc-item .amount.neg { color: var(--hl-expense); }
.acc-item .flow { margin-top: 2px; font-variant-numeric: tabular-nums; }

/* 下行：行内操作（老版常显，非 hover 才出现） */
.acc-item .actions { display: flex; gap: 2px; flex-wrap: wrap; }
</style>
