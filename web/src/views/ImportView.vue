<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect,
  NUpload, NUploadDragger, NAlert, NSpin, NGrid, NGridItem, NDivider, NDataTable,
  NCheckbox, NProgress, useMessage, NEmpty, type DataTableColumns, type UploadFileInfo,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AdminApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtAmount } from '@/utils/money'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const step = ref<'upload' | 'preview' | 'done'>('upload')
const loading = ref(false)
const preview = ref<any>(null)
const jobs = ref<any[]>([])

const commitOptions = ref({
  include_neutral: false,
  auto_create_account: true,
  default_account_id: 0,
  ledger_overrides: {} as Record<string, number>,
})

const accounts = ref<any[]>([])

async function loadJobs() {
  try {
    const d = await AdminApi.importJobs()
    jobs.value = d.items || []
    accounts.value = d.accounts || []
  } catch (e) { /* ignore */ }
}

onMounted(() => {
  loadJobs()
})

const accountOptions = computed(() => [
  { label: '（不指定，让 AI 自动判断）', value: 0 },
  ...accounts.value.map((a: any) => ({ label: `${a.icon} ${a.name}`, value: a.id })),
])

/** 把上传的 File 读成 base64 dataUrl */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

async function onUpload({ file }: { file: UploadFileInfo }) {
  if (!file.file) return false
  loading.value = true
  try {
    const dataUrl = await readAsDataUrl(file.file)
    const r = await AdminApi.importPreview(dataUrl, file.name)
    preview.value = r
    step.value = 'preview'
  } catch (e) {
    toastError(errorMessage(e, '预览失败'))
  } finally {
    loading.value = false
  }
  return false  // 阻止 Naive UI 自己上传
}

async function onCommit() {
  if (!preview.value) return
  loading.value = true
  try {
    const r = await AdminApi.importCommit({
      token: preview.value.token,
      include_neutral: commitOptions.value.include_neutral,
      auto_create_account: commitOptions.value.auto_create_account,
      default_account_id: commitOptions.value.default_account_id || undefined,
      ledger_overrides: commitOptions.value.ledger_overrides,
    })
    success(`已导入 ${r.imported} 笔交易${r.skipped ? `（跳过 ${r.skipped} 笔）` : ''}`)
    step.value = 'done'
    preview.value = null
    loadJobs()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '导入失败')
  } finally {
    loading.value = false
  }
}

function onReset() {
  step.value = 'upload'
  preview.value = null
}

const sampleColumns = computed<DataTableColumns>(() => [
  { title: '日期', key: 'txn_date', width: 100 },
  { title: '类型', key: 'type_label', width: 80 },
  {
    title: '金额',
    key: 'amount_cents',
    width: 110,
    align: 'right',
    render: (r: any) => h(AmountDisplay, {
      cents: r.amount_cents,
      sign: true,
      tone: r.type === 'income' ? 'income' : r.type === 'transfer' ? 'neutral' : 'expense',
    }),
  },
  { title: '商户/对方', key: 'merchant_or_peer', ellipsis: true, render: (r: any) => r.merchant || r.peer || '-' },
  { title: '备注', key: 'note', ellipsis: true, render: (r: any) => r.note || '-' },
  { title: '分类', key: 'guess_category', ellipsis: true, render: (r: any) => h(NTag, { type: 'default', size: 'small', bordered: false }, { default: () => r.guess_category }) },
  { title: '账户', key: 'guess_account', render: (r: any) => r.guess_account || '-' },
])

const jobColumns = computed<DataTableColumns>(() => [
  { title: '文件', key: 'file_name', ellipsis: true },
  { title: '类型', key: 'source_label', width: 100 },
  { title: '导入/跳过', key: 'imported', width: 100, render: (r: any) => `${r.imported} / ${r.skipped}` },
  { title: '时间', key: 'created_at', width: 160 },
])
</script>

<template>
  <AppShell>
    <PageHead title="账单导入" sub="支持支付宝 / 微信 / 通用 CSV 账单，AI 智能识别分类">
      <template #actions>
        <NButton v-if="step !== 'upload'" @click="onReset">← 重新上传</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <!-- 步骤 1：上传 -->
      <template v-if="step === 'upload'">
        <NCard :bordered="true" class="upload-card">
          <NUpload
            :custom-request="onUpload"
            :show-file-list="false"
            accept=".csv,.txt,.xlsx"
            :max="1"
          >
            <NUploadDragger>
              <div class="drop">
                <div class="ico">📂</div>
                <div class="title">点击或拖拽 CSV 账单到此处</div>
                <div class="hint">支持 支付宝账单 / 微信支付账单 / 通用 CSV 格式</div>
                <NText depth="3" style="font-size: 12px">最大 20MB · 导入前会预览分类与金额</NText>
              </div>
            </NUploadDragger>
          </NUpload>
        </NCard>

        <!-- 引导 -->
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="guides">
          <NGridItem>
            <NCard size="small" :bordered="true" class="guide">
              <div class="ico">📗</div>
              <h3>支付宝</h3>
              <NText depth="3" class="text">从支付宝 App 导出「交易流水证明」CSV（2020+ 版本支持），文件名前缀是 <code>alipay</code>。</NText>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" :bordered="true" class="guide">
              <div class="ico">📘</div>
              <h3>微信支付</h3>
              <NText depth="3" class="text">从微信支付「账单」-「常见问题」-「下载账单」导出的 CSV，文件名前缀是 <code>微信支付账单</code>。</NText>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" :bordered="true" class="guide">
              <div class="ico">📄</div>
              <h3>通用 CSV</h3>
              <NText depth="3" class="text">包含 <code>日期, 金额, 类型(收/支), 备注</code> 等列的标准 CSV。智能识别失败时也会保留原始记录。</NText>
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- 导入历史 -->
        <NCard v-if="jobs.length" :bordered="true" size="small" class="jobs-card" title="导入历史">
          <NDataTable :columns="jobColumns" :data="jobs" :pagination="false" :bordered="false" size="small" />
        </NCard>
      </template>

      <!-- 步骤 2：预览 -->
      <template v-else-if="step === 'preview' && preview">
        <NCard :bordered="true" class="preview-card">
          <div class="preview-head">
            <div>
              <h3>识别结果：<span class="src">{{ preview.sourceLabel }}</span></h3>
              <NText depth="3">共 <strong>{{ preview.count }}</strong> 笔，识别失败 <strong>{{ preview.skipped }}</strong> 笔{{ preview.neutralCount ? `，中性（不计收支）${preview.neutralCount} 笔` : '' }}</NText>
            </div>
            <NTag :type="preview.source === 'generic' ? 'default' : 'success'" :bordered="false">
              编码 {{ preview.encoding }}
            </NTag>
          </div>
          <NDivider />

          <!-- 统计 -->
          <NGrid :cols="3" :x-gap="12" :y-gap="12" class="preview-stats">
            <NGridItem>
              <div class="stat income">
                <span class="label">收入</span>
                <span class="val">{{ fmtAmount(preview.stat.income) }}</span>
              </div>
            </NGridItem>
            <NGridItem>
              <div class="stat expense">
                <span class="label">支出</span>
                <span class="val">{{ fmtAmount(preview.stat.expense) }}</span>
              </div>
            </NGridItem>
            <NGridItem>
              <div class="stat neutral">
                <span class="label">转账</span>
                <span class="val">{{ fmtAmount(preview.stat.transfer) }}</span>
              </div>
            </NGridItem>
          </NGrid>

          <NDivider />

          <!-- 选项 -->
          <NForm label-placement="left" label-width="120">
            <NFormItem label="默认账户">
              <NSelect
                v-model:value="commitOptions.default_account_id"
                :options="accountOptions"
                filterable
                style="max-width: 280px"
              />
            </NFormItem>
            <NFormItem label="自动建账户">
              <NCheckbox v-model:checked="commitOptions.auto_create_account">
                没有匹配账户时自动创建（同名）
              </NCheckbox>
            </NFormItem>
            <NFormItem v-if="preview.neutralCount" label="导入中性记录">
              <NCheckbox v-model:checked="commitOptions.include_neutral">
                包含「{{ preview.neutralCount }} 笔」账户间转账等中性记录
              </NCheckbox>
            </NFormItem>
          </NForm>

          <NDivider />

          <h3>样本预览（最多 200 笔）</h3>
          <NDataTable
            :columns="sampleColumns"
            :data="preview.sample"
            :pagination="false"
            :bordered="true"
            size="small"
            :max-height="500"
            :scroll-x="1000"
          />

          <NDivider />

          <NSpace justify="end">
            <NButton @click="onReset">取消</NButton>
            <NButton type="primary" :loading="loading" @click="onCommit">
              ✅ 确认导入 {{ preview.count }} 笔
            </NButton>
          </NSpace>
        </NCard>
      </template>

      <!-- 步骤 3：完成 -->
      <NCard v-else-if="step === 'done'" :bordered="true" class="done-card">
        <div class="big">🎉</div>
        <h3>导入完成！</h3>
        <NSpace justify="center" style="margin-top: 16px">
          <NButton @click="onReset">再导入一份</NButton>
          <NButton type="primary" @click="$router.push('/transactions')">查看交易</NButton>
        </NSpace>
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.upload-card { padding: 4px; }
.drop { padding: 40px 16px; text-align: center; }
.drop .ico { font-size: 48px; }
.drop .title { font-size: 16px; font-weight: 500; margin: 8px 0 4px; }
.drop .hint { font-size: 12px; color: var(--hl-muted); margin-bottom: 4px; }

.guides { margin-top: 16px; }
.guide { text-align: center; padding: 16px; }
.guide .ico { font-size: 32px; }
.guide h3 { font-size: 14px; margin: 8px 0; }
.guide .text { font-size: 12px; line-height: 1.5; }
.guide code { background: var(--hl-card-2, #f7f8fb); padding: 1px 4px; border-radius: 3px; }

.jobs-card { margin-top: 16px; }

.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.preview-head h3 { margin: 0 0 4px; font-size: 16px; }
.preview-head .src { color: var(--hl-primary); }
.preview-stats { margin-bottom: 8px; }
.stat { padding: 12px 16px; border-radius: 8px; text-align: center; }
.stat .label { display: block; font-size: 12px; color: var(--hl-muted); }
.stat .val { display: block; font-size: 18px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stat.income  { background: var(--hl-income-bg, #e8f6ed); color: var(--hl-income); }
.stat.expense { background: var(--hl-expense-2, #feefef); color: var(--hl-expense); }
.stat.neutral { background: var(--hl-card-2, #f7f8fb); color: var(--hl-text-2); }

.done-card { text-align: center; padding: 60px 16px; }
.done-card .big { font-size: 64px; }
.done-card h3 { margin: 12px 0 0; }
</style>
