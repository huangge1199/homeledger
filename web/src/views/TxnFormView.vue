<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NForm, NFormItem, NInput, NInputNumber, NButton, NSpace, NSelect, NText, NTag, NCheckbox,
  NDivider, NPopconfirm, NSpin, NSwitch, NAlert,
} from 'naive-ui'
import { useMessage } from 'naive-ui'

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
const accountId = ref<number | null>(null)
const toAccountId = ref<number | null>(null)
const categoryId = ref<number | null>(null)
const merchant = ref<string>('')
const note = ref<string>('')
const tags = ref<string[]>([])
const isReimbursable = ref<boolean>(false)
const status = ref<'pending' | 'cleared'>('cleared')

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
  return type.value === 'transfer'
})
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
      const t = data.txn
      type.value = t.type || 'expense'
      amount.value = (Number(t.amount_cents || 0) / 100).toFixed(2)
      date.value = t.txn_date
      accountId.value = t.account_id
      toAccountId.value = t.to_account_id
      categoryId.value = t.category_id
      merchant.value = t.merchant || ''
      note.value = t.note || ''
      tags.value = t.tags ? String(t.tags).split(/[,，\s]+/).filter(Boolean) : []
      isReimbursable.value = !!t.is_reimbursable
      status.value = t.status || 'cleared'
    } else {
      // 默认账户：取第一个
      if (accounts.value.length) accountId.value = Number(accounts.value[0].id)
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
      currency: 'CNY',
      account_id: accountId.value,
      txn_date: date.value,
      note: note.value,
      merchant: merchant.value,
      status: status.value,
      is_reimbursable: isReimbursable.value ? 1 : 0,
      tags: (Array.isArray(tags.value) ? tags.value : []).join(','),
    }
    if (needsCategory.value) payload.category_id = categoryId.value
    if (needsToAccount.value) payload.to_account_id = toAccountId.value

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
        <NForm label-placement="left" label-width="80" :show-feedback="false">
          <NFormItem :label="needsToAccount ? '转出账户' : '账户'">
            <AccountSelect v-model="accountId" :list="accounts" />
          </NFormItem>
          <NFormItem v-if="needsToAccount" label="转入账户">
            <AccountSelect v-model="toAccountId" :list="accounts" />
          </NFormItem>

          <!-- 日期 -->
          <NFormItem label="日期">
            <DatePickerWrap v-model="date" style="max-width: 200px" />
          </NFormItem>

          <!-- 分类 -->
          <NFormItem v-if="needsCategory" label="分类">
            <CategorySelect
              v-model="categoryId"
              :list="categories"
              :kind="kindOf(type)"
              placeholder="请选择分类"
            />
          </NFormItem>

          <!-- 商户 -->
          <NFormItem label="商户">
            <NInput
              v-model:value="merchant"
              placeholder="可选，如：星巴克 / 滴滴出行"
            />
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
            <NSwitch v-model:value="isReimbursable" />
            <NText depth="3" class="hint">&nbsp;勾选后可在「待报销」中一次性结清</NText>
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

        <NAlert v-if="type === 'adjust'" type="info" :show-icon="true" class="tip">
          余额调整会生成一条「调整」交易，把账户余额改成当前值。需先在账户页输入目标余额。
        </NAlert>
      </NCard>
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
.tip { margin-top: 12px; }
</style>
