<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NForm, NFormItem, NInput, NInputNumber, NButton, NSpace, NSelect, NText, NTag, NCheckbox,
  NDivider, NPopconfirm, NSpin, NSwitch, NAlert, NTimePicker, NCollapse, NCollapseItem,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import { RouterLink } from 'vue-router'

import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import TxnTypeTabs from '@/components/TxnTypeTabs.vue'
import DatePickerWrap from '@/components/DatePickerWrap.vue'
import AccountSelect, { type AccountOption } from '@/components/AccountSelect.vue'
import CategorySelect, { type CategoryOption } from '@/components/CategorySelect.vue'
import AmountInput from '@/components/AmountInput.vue'

import { TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPE_MAP, kindOf, flowOf } from '@/utils/txnTypes'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const message = useMessage()
const { success, error: toastError } = useFlash()

const mode = computed(() => (route.path.endsWith('/edit') ? 'edit' : 'create'))
const editingId = computed(() => {
  if (mode.value !== 'edit') return null
  const m = /\/transactions\/(\d+)\/edit/.exec(route.path)
  return m ? Number(m[1]) : null
})

// 表单数据
const type = ref<string>('expense')
const amount = ref<string>('')
const date = ref<string>(dayjs().format('YYYY-MM-DD'))
/** 消费时刻 HH:mm:ss，可空（后端 txn_time 字段） */
const time = ref<number | null>(null)
const accountId = ref<number | null>(null)
const toAccountId = ref<number | null>(null)
const categoryId = ref<number | null>(null)
const merchant = ref<string>('')
const note = ref<string>('')
const tags = ref<string[]>([])
const isReimbursable = ref<boolean>(false)
const status = ref<'pending' | 'cleared'>('cleared')
const currency = ref<string>('CNY')
const rate = ref<string>('1')
/** AA 分账行：成员名 + 金额（元） */
interface SplitRow { name: string; amount: string }
const splits = ref<SplitRow[]>([])

const CURRENCIES = ['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP', 'KRW', 'SGD', 'AUD', 'CAD', 'TWD']

// 表单选项
const loading = ref(true)
const submitting = ref(false)
const accounts = ref<AccountOption[]>([])
const categories = ref<CategoryOption[]>([])
const allTags = ref<{ id: number; name: string }[]>([])

// 联动：分类按 type.kind 过滤
const availableCategories = computed(() => {
  if (type.value === 'transfer' || type.value === 'adjust') return []
  return categories.value.filter((c) => {
    if (c.kind === kindOf(type.value)) return true
    return false
  })
})

const needsCategory = computed(() => {
  return type.value !== 'transfer' && type.value !== 'adjust'
})
const needsToAccount = computed(() => {
  return ['transfer', 'invest_buy', 'invest_sell'].includes(type.value)
})

/** 账户字段标签随类型变化（与老版 acc-label 逻辑一致） */
const accountLabel = computed(() => {
  switch (type.value) {
    case 'expense': return '支付账户'
    case 'income': return '收款账户'
    case 'transfer': return '从账户'
    case 'lend': return '从哪个账户借出'
    case 'borrow': return '收到哪个账户'
    case 'repay_receive': return '收款账户'
    case 'repay_pay': return '付款账户'
    case 'invest_buy': return '付款账户'
    case 'invest_sell': return '收款账户'
    default: return '账户'
  }
})

/** 编辑模式回填用的元信息与截图 */
const t = ref<{ memberName?: string }>({})
const meta = ref<{ created_at?: string; updated_at?: string; source?: string }>({})
const images = ref<{ id: number; url: string; size?: number; created_at?: string }[]>([])

function fmtDateTime(s?: string) {
  if (!s) return '—'
  const d = dayjs(s)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : s
}
function fmtSize(n?: number) {
  return `${Math.round((n || 0) / 1024)} KB`
}

function addSplit() {
  splits.value.push({ name: '', amount: '' })
}
function removeSplit(i: number) {
  splits.value.splice(i, 1)
}
/** 按人数均摊：总额平分为 N 份，余额补到第一行 */
function splitAverage() {
  const n = splits.value.length
  if (!n) return
  const total = Number(String(amount.value).replace(/[,\s¥￥$]/g, ''))
  if (!total || total <= 0) {
    message.warning('请先填写金额')
    return
  }
  const cents = Math.round((total / n) * 100)
  let remain = Math.round(total * 100)
  splits.value.forEach((r, i) => {
    const c = i === 0 ? remain - cents * (n - 1) : cents
    r.amount = (c / 100).toFixed(2)
  })
}
const showReimbursable = computed(() => {
  return ['expense', 'fee', 'repay_pay'].includes(type.value)
})

// 类型变更时清空不兼容的分类
watch(type, () => {
  if (!needsCategory.value) {
    categoryId.value = null
  } else {
    // 保留同 kind 的 categoryId
    const cur = categories.value.find((c) => c.id === categoryId.value)
    if (cur && cur.kind !== kindOf(type.value)) categoryId.value = null
  }
  // 转账：清掉 toAccount 之外的所有
  if (type.value === 'transfer' || type.value === 'repay_pay' || type.value === 'repay_receive') {
    isReimbursable.value = false
  }
  if (type.value === 'adjust') {
    categoryId.value = null
    isReimbursable.value = false
    note.value = note.value || '余额调整'
  }
})

// 加载表单数据
async function load() {
  loading.value = true
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    // 分类合并 expense/income
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
    allTags.value = fd.tags || []
    // 编辑模式：拉单笔
    if (mode.value === 'edit' && editingId.value) {
      const data = await TransactionsApi.get(editingId.value)
      const tx = data.txn
      t.value = { memberName: tx.member_name || '' }
      type.value = tx.type || 'expense'
      amount.value = (Number(tx.amount_cents || 0) / 100).toFixed(2)
      date.value = tx.txn_date
      time.value = tx.txn_time ? dayjs(`2000-01-01T${tx.txn_time}`).valueOf() : null
      accountId.value = tx.account_id
      toAccountId.value = tx.to_account_id
      categoryId.value = tx.category_id
      merchant.value = tx.merchant || ''
      note.value = tx.note || ''
      // 后端列表/详情只返回 tag_names（空格分隔），没有 tags 字段
      tags.value = tx.tag_names ? String(tx.tag_names).split(/[,，\s]+/).filter(Boolean) : []
      isReimbursable.value = !!tx.is_reimbursable
      status.value = tx.status || 'cleared'
      currency.value = tx.currency || 'CNY'
      rate.value = String(tx.rate || 1)
      meta.value = { created_at: tx.created_at, updated_at: tx.updated_at, source: tx.source }
      images.value = (data.attachments || []).map((a: any) => ({
        id: a.id,
        url: a.url,
        size: a.size,
        created_at: a.created_at,
      }))
      splits.value = (data.splits || []).map((s: any) => ({
        name: s.member_name || '',
        amount: s.share_cents ? (Number(s.share_cents) / 100).toFixed(2) : '',
      }))
    } else {
      // 新建模式：URL 预填（老版 /transactions/new?type=&amount=&date=&category_id=&account_id=&note=）
      // AI 文字快速记账单笔会带这些参数跳过来
      const q = route.query
      const qType = String(q.type || '')
      if (TXN_TYPE_MAP[qType]) type.value = qType
      const qAmount = Number(String(q.amount ?? '').replace(/[,\s¥￥$]/g, ''))
      if (Number.isFinite(qAmount) && qAmount > 0) amount.value = qAmount.toFixed(2)
      const qDate = String(q.date || '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(qDate)) date.value = qDate
      // 时刻：AI 文字快速记账单笔会带 txn_time=HH:mm 或 HH:mm:ss
      const qTime = String(q.txn_time || '')
      if (/^\d{1,2}:\d{2}/.test(qTime)) time.value = dayjs(`2000-01-01T${qTime}`).valueOf()
      // 默认账户：取第一个
      if (accounts.value.length) accountId.value = Number(accounts.value[0].id)
      // 分类：必须存在且与当前类型 kind 一致才采用
      const qCatId = Number(q.category_id)
      if (qCatId) {
        const cat = categories.value.find((c) => c.id === qCatId)
        if (cat && cat.kind === kindOf(type.value)) categoryId.value = cat.id
      }
      // 账户：必须存在才采用
      const qAccId = Number(q.account_id)
      if (qAccId && accounts.value.some((a) => a.id === qAccId)) accountId.value = qAccId
      const qNote = String(q.note || '')
      if (qNote) note.value = qNote
    }
  } catch (e) {
    toastError(errorMessage(e, '加载表单失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 提交
async function onSubmit() {
  // 校验
  const amt = Number(String(amount.value).replace(/[,\s¥￥$]/g, ''))
  if (!amt || amt <= 0) {
    message.warning('请填写金额')
    return
  }
  if (!accountId.value) {
    message.warning('请选择账户')
    return
  }
  if (needsCategory.value && !categoryId.value) {
    message.warning('请选择分类')
    return
  }
  if (needsToAccount.value && !toAccountId.value) {
    message.warning('请选择转入账户')
    return
  }
  if (needsToAccount.value && toAccountId.value === accountId.value) {
    message.warning('转入账户不能与转出账户相同')
    return
  }

  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      type: type.value,
      amount: amount.value,
      currency: currency.value,
      rate: Number(rate.value) || 1,
      account_id: accountId.value,
      txn_date: date.value,
      txn_time: time.value ? dayjs(time.value).format('HH:mm:ss') : '',
      note: note.value,
      merchant: merchant.value,
      status: status.value,
      is_reimbursable: isReimbursable.value ? 1 : 0,
      tags: (Array.isArray(tags.value) ? tags.value : []).join(','),
    }
    if (needsCategory.value) payload.category_id = categoryId.value
    if (needsToAccount.value) payload.to_account_id = toAccountId.value
    const validSplits = splits.value.filter((s) => s.name.trim())
    if (validSplits.length) {
      payload.split_name = validSplits.map((s) => s.name.trim())
      payload.split_amount = validSplits.map((s) => s.amount || '0')
    }

    if (mode.value === 'edit' && editingId.value) {
      await TransactionsApi.update(editingId.value, payload)
      success('已更新')
      router.replace(`/transactions/${editingId.value}`)
    } else {
      const r = await TransactionsApi.create(payload)
      success('已记录')
      // 问是否再记一笔
      const goMore = await new Promise<boolean>((resolve) => {
        message.info('已记录 ✓', { duration: 1500 })
        setTimeout(() => resolve(true), 200)
      })
      // 简单策略：跳列表
      router.replace('/transactions')
      void goMore
    }
  } catch (e) {
    toastError(errorMessage(e, '保存失败'))
  } finally {
    submitting.value = false
  }
}

async function onDelete() {
  if (mode.value !== 'edit' || !editingId.value) return
  try {
    await TransactionsApi.remove(editingId.value)
    success('已删除')
    router.replace('/transactions')
  } catch (e) {
    toastError(errorMessage(e, '删除失败'))
  }
}

function onCancel() {
  router.back()
}

// 智能建议：今天 = 默认值
watch(() => session.currentLedger?.id, () => {
  if (mode.value === 'create') load()
})
</script>

<template>
  <AppShell>
    <PageHead
      :title="mode === 'edit' ? '编辑记录' : '记一笔'"
      :sub="mode === 'edit' ? '修改这条记录' : '支持类型/账户/分类联动，AI 智能识别'"
    >
      <template #actions>
        <NButton @click="onCancel">取消</NButton>
        <NPopconfirm v-if="mode === 'edit'" @positive-click="onDelete" positive-text="删除" negative-text="取消">
          <template #trigger><NButton type="error" ghost>删除</NButton></template>
          确定要删除这条记录吗？
        </NPopconfirm>
        <NButton type="primary" :loading="submitting" @click="onSubmit">
          {{ mode === 'edit' ? '保 存' : '记 这 一 笔' }}
        </NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <NCard :bordered="true" class="form-card">
        <!-- 类型选择 -->
        <div class="section">
          <div class="label">类型</div>
          <TxnTypeTabs v-model="type" />
        </div>

        <NDivider />

        <!-- 金额 -->
        <div class="section amount-section">
          <div class="label">金额</div>
          <div class="amount-input">
            <AmountInput
              v-model="amount"
              currency="¥"
              placeholder="0.00"
              :input-props="{ inputmode: 'decimal' }"
            />
          </div>
        </div>

        <NDivider />

        <!-- 账户 / 转入账户 -->
        <NForm label-placement="left" label-width="92" label-align="left" :show-feedback="false" class="txn-form">
          <NFormItem :label="accountLabel">
            <AccountSelect v-model="accountId" :list="accounts" />
          </NFormItem>
          <NFormItem v-if="needsToAccount" label="转入 / 投资账户">
            <AccountSelect v-model="toAccountId" :list="accounts" />
          </NFormItem>

          <!-- 日期 -->
          <NFormItem label="日期">
            <DatePickerWrap v-model="date" style="max-width: 200px" />
          </NFormItem>

          <!-- 消费时刻（可选，24 小时制） -->
          <NFormItem label="时刻">
            <NTimePicker
              v-model:value="time"
              format="HH:mm:ss"
              :clearable="true"
              placeholder="可选，如 08:30:00"
              style="max-width: 200px"
            />
          </NFormItem>

          <!-- 成员（记录人，只读，与老版一致） -->
          <NFormItem label="成员">
            <NInput
              :value="`${t.memberName || session.user?.displayName || ''}（当前记录人）`"
              disabled
              style="max-width: 200px"
            />
          </NFormItem>

          <!-- 分类 -->
          <NFormItem v-if="needsCategory" label="分类">
            <CategorySelect
              v-model="categoryId"
              :list="categories"
              :kind="kindOf(type)"
              placeholder="请选择分类"
              cascader
            />
          </NFormItem>

          <!-- 商家 / 对方 -->
          <NFormItem label="商家 / 对方">
            <div class="field-col">
              <NInput
                v-model:value="merchant"
                placeholder="例如：肯德基 / 张三 / 房东"
              />
              <NText depth="3" class="hint hint-block">借贷时的对方姓名很关键</NText>
            </div>
          </NFormItem>

          <!-- 备注 -->
          <NFormItem label="备注">
            <NInput
              v-model:value="note"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 5 }"
              placeholder="可选"
            />
          </NFormItem>

          <!-- 标签 -->
          <NFormItem label="标签">
            <NSelect
              v-model:value="tags"
              multiple
              tag
              filterable
              placeholder="输入后回车添加"
              style="min-width: 280px"
            />
          </NFormItem>

          <!-- 报销 / 状态 -->
          <NFormItem v-if="showReimbursable" label="可报销">
            <div class="field-row">
              <NSwitch v-model:value="isReimbursable" />
              <NText depth="3" class="hint">勾选后可在「待报销」中一次性结清</NText>
            </div>
          </NFormItem>

          <NFormItem label="状态">
            <NSelect
              v-model:value="status"
              :options="[
                { label: '已入账', value: 'cleared' },
                { label: '待入账', value: 'pending' },
              ]"
              style="max-width: 200px"
            />
          </NFormItem>
        </NForm>

        <!-- 多币种 / 汇率（可选，折叠） -->
        <NCollapse :default-expanded-names="[]">
          <NCollapseItem name="currency" title="多币种 / 汇率（可选）">
            <NForm label-placement="left" label-width="110" :show-feedback="false" class="currency-form">
              <NFormItem label="币种">
                <NSelect
                  v-model:value="currency"
                  :options="CURRENCIES.map((c) => ({ label: c, value: c }))"
                  style="max-width: 160px"
                />
              </NFormItem>
              <NFormItem label="汇率">
                <NInput v-model:value="rate" placeholder="1" style="max-width: 160px">
                  <template #suffix>≈ ¥</template>
                </NInput>
              </NFormItem>
            </NForm>
          </NCollapseItem>
        </NCollapse>

        <NAlert v-if="type === 'adjust'" type="info" :show-icon="true" class="tip">
          余额调整会生成一条「调整」交易，把账户余额改成当前值。需先在账户页输入目标余额。
        </NAlert>

        <NAlert type="info" :show-icon="true" class="tip">
          提示：<b>转账</b>、<b>借贷</b>、<b>投资买卖</b> 不计入收支统计，只影响账户余额，这样统计口径更准确。
        </NAlert>
      </NCard>

      <!-- AA 分账 -->
      <NCard :bordered="true" class="form-card split-card">
        <div class="split-head">
          <span class="split-title">AA 分账</span>
          <NText depth="3" class="hint">可选，用于朋友聚餐 / 团队开销</NText>
        </div>
        <div v-for="(row, i) in splits" :key="i" class="split-row">
          <NInput v-model:value="row.name" placeholder="成员" />
          <NInput v-model:value="row.amount" placeholder="金额" inputmode="decimal" />
          <NButton quaternary circle size="small" @click="removeSplit(i)">✕</NButton>
        </div>
        <NSpace>
          <NButton size="small" @click="addSplit">＋ 添加分摊人</NButton>
          <NButton size="small" quaternary @click="splitAverage">按人数均摊</NButton>
        </NSpace>
      </NCard>

      <!-- 编辑模式：元信息 + 关联截图 -->
      <template v-if="mode === 'edit'">
        <NCard :bordered="true" class="form-card">
          <div class="kv"><span class="k">创建时间</span><span class="v mono">{{ fmtDateTime(meta.created_at) }}</span></div>
          <div class="kv"><span class="k">最后修改</span><span class="v mono">{{ fmtDateTime(meta.updated_at) }}</span></div>
          <div class="kv"><span class="k">来源</span><span class="v">{{ meta.source || 'manual' }}</span></div>
        </NCard>

        <NCard v-if="images.length" :bordered="true" class="form-card">
          <div class="split-head">
            <span class="split-title">📎 关联账单截图（{{ images.length }}）</span>
            <RouterLink to="/attachments" class="more-link">全部截图 →</RouterLink>
          </div>
          <div class="gallery">
            <figure v-for="img in images" :key="img.id">
              <img :src="img.url" alt="账单截图" loading="lazy" />
              <figcaption>{{ fmtDateTime(img.created_at) }} · {{ fmtSize(img.size) }}</figcaption>
            </figure>
          </div>
        </NCard>
      </template>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.form-card {
  max-width: 760px;
  margin: 0 auto;
}
.section { padding: 4px 2px; }
.section .label {
  font-size: 13px;
  color: var(--hl-muted, #7d8aa3);
  margin-bottom: 8px;
}
.amount-section { padding: 8px 0 4px; }
.amount-input { max-width: 320px; }
.hint { font-size: 12px; }
/* 表单字段纵向排列容器：控件与说明文字分行，避免挤在一行 */
.field-col { display: flex; flex-direction: column; gap: 5px; width: 100%; }
/* 横向排列容器：开关与说明文字同行。不能用 field-col —— 列方向会把 NSwitch
   根元素拉伸到满宽，naive 的 .n-switch 内部是 justify-content:flex-end，
   滑块会被推到最右，与上方输入框左边缘错位 */
.field-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.hint-block { line-height: 1.5; }
/* 字段间距：红框处原本过近，统一放大行距 */
.txn-form :deep(.n-form-item) { margin-bottom: 10px; }
.txn-form :deep(.n-form-item:last-child) { margin-bottom: 4px; }
/* 多币种 / 汇率与主表单保持同一套行距 */
.currency-form :deep(.n-form-item) { margin-bottom: 10px; }
.currency-form :deep(.n-form-item:last-child) { margin-bottom: 0; }
/* label 竖排时不换行，「商家 / 对方」等长文案保持单行 */
.txn-form :deep(.n-form-item-label__text) { white-space: nowrap; }
.tip { margin-top: 12px; }
.currency-form { max-width: 420px; }
.split-card { margin-top: 12px; }
.split-head {
  display: flex; align-items: baseline; gap: 10px;
  margin-bottom: 12px; flex-wrap: wrap;
}
.split-title { font-size: 15px; font-weight: 600; }
.more-link { margin-left: auto; font-size: 12px; color: var(--hl-primary, #18a058); text-decoration: none; }
.more-link:hover { text-decoration: underline; }
.split-row {
  display: grid; grid-template-columns: 1fr 1fr auto;
  gap: 8px; margin-bottom: 8px; align-items: center;
}
/* 元信息键值对（老版 .kv） */
.kv {
  display: flex; justify-content: space-between;
  padding: 5px 0; font-size: 13px;
}
.kv .k { color: var(--hl-muted, #7d8aa3); }
.kv .v { color: var(--hl-text, #17202e); }
.kv .v.mono { font-variant-numeric: tabular-nums; font-family: v-mono, SFMono-Regular, Menlo, Consolas, monospace; }
/* 截图画廊（老版 .gallery） */
.gallery {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;
}
.gallery figure { margin: 0; }
.gallery img {
  width: 100%; aspect-ratio: 3 / 4; object-fit: cover;
  border-radius: 8px; border: 1px solid var(--hl-border, #e6eaf1);
  cursor: zoom-in; background: var(--hl-card-2, #f7f8fb);
}
.gallery figcaption {
  margin-top: 5px; font-size: 11px; color: var(--hl-muted, #7d8aa3);
}
</style>
