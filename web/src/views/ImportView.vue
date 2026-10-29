<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NSelect, NUpload, NUploadDragger, NAlert,
  NSpin, NGrid, NGridItem, NDivider, NDataTable, NCheckbox, NForm, NFormItem,
  useMessage, NEmpty, type DataTableColumns, type UploadFileInfo,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { fmtAmount } from '@/utils/money'

const router = useRouter()
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
  // 逐条指定记账本：{ 行号: 账本 id }，未指定的行走当前账本
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

// 可写账本（含当前账本），多个时才允许逐条切换
const myLedgers = computed<any[]>(() => preview.value?.myLedgers || [])
const hasMultiLedger = computed(() => myLedgers.value.length > 1)
const currentLedgerId = computed(() => myLedgers.value.find((l: any) => l.isCurrent)?.id ?? 0)
const ledgerOptions = computed(() => myLedgers.value.map((l: any) => ({
  label: `${l.icon || '📒'} ${l.name}`,
  value: l.id,
})))

function ledgerOfRow(idx: number): number {
  return commitOptions.value.ledger_overrides[idx] ?? currentLedgerId.value
}

function setLedgerOfRow(idx: number, ledgerId: number) {
  const o = commitOptions.value.ledger_overrides
  if (ledgerId === currentLedgerId.value) delete o[idx]
  else o[idx] = ledgerId
}

const commitCount = computed(() => {
  const c = preview.value?.count || 0
  const n = preview.value?.neutralCount || 0
  return c + (commitOptions.value.include_neutral ? n : 0)
})

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
    commitOptions.value.ledger_overrides = {}
    commitOptions.value.include_neutral = false
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
    // 与老版一致：短暂展示完成提示后回到交易列表
    setTimeout(() => router.push('/transactions'), 900)
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
  { title: '商家/说明', key: 'merchant_or_note', ellipsis: true, render: (r: any) => r.merchant || r.note || r.peer || '-' },
  {
    title: '建议分类',
    key: 'guess_category',
    ellipsis: true,
    render: (r: any) => h(NTag, { type: 'default', size: 'small', bordered: false }, { default: () => r.guess_category }),
  },
  { title: '账户', key: 'guess_account', width: 110, render: (r: any) => r.guess_account || '-' },
  {
    title: '记账本',
    key: 'ledger_override',
    width: 150,
    render: (r: any) => (hasMultiLedger.value
      ? h(NSelect, {
          size: 'small',
          value: ledgerOfRow(r.idx),
          options: ledgerOptions.value,
          onUpdateValue: (v: number) => setLedgerOfRow(r.idx, v),
        })
      : h(NText, { depth: 3, style: 'font-size: 12px' }, { default: () => '当前账本' })),
  },
])

const neutralColumns = computed<DataTableColumns>(() => [
  { title: '日期', key: 'txn_date', width: 100 },
  {
    title: '金额',
    key: 'amount_cents',
    width: 100,
    align: 'right',
    render: (r: any) => h(AmountDisplay, { cents: r.amount_cents, sign: false }),
  },
  { title: '说明', key: 'note', ellipsis: true, render: (r: any) => r.note || r.merchant || '-' },
  { title: '账户', key: 'account', width: 110, render: (r: any) => r.account || '-' },
])

const SOURCE_LABELS: Record<string, string> = { alipay: '支付宝', wechat: '微信支付', generic: '通用 CSV' }

const jobColumns = computed<DataTableColumns>(() => [
  { title: '时间', key: 'created_at', width: 150, render: (r: any) => (dayjs(r.created_at).isValid() ? dayjs(r.created_at).format('YYYY-MM-DD HH:mm') : r.created_at || '-') },
  { title: '来源', key: 'source', width: 90, render: (r: any) => SOURCE_LABELS[r.source] || r.source || '-' },
  { title: '文件', key: 'file_name', ellipsis: true },
  { title: '成功', key: 'imported', width: 70, render: (r: any) => r.imported ?? 0 },
  { title: '跳过', key: 'skipped', width: 70, render: (r: any) => r.skipped ?? 0 },
  { title: '失败', key: 'failed', width: 70, render: (r: any) => r.failed ?? 0 },
  { title: '说明', key: 'message', ellipsis: true, render: (r: any) => r.message || '-' },
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
                <div class="title">点击或拖拽账单文件到此处</div>
                <div class="hint">支持支付宝账单（CSV）、微信支付账单（CSV / xlsx）、通用 CSV（含日期 / 金额 / 备注列即可）</div>
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
              <NText depth="3" class="text">App →「我的」→「账单」→ 右上角「⋯」→「开具交易流水证明」→ 用于个人对账 → 下载 CSV。</NText>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" :bordered="true" class="guide">
              <div class="ico">📘</div>
              <h3>微信支付</h3>
              <NText depth="3" class="text">我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 用于个人对账，CSV 或 xlsx 均可。</NText>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" :bordered="true" class="guide">
              <div class="ico">📄</div>
              <h3>通用 CSV</h3>
              <NText depth="3" class="text">包含 <code>日期, 金额, 类型(收/支), 备注</code> 等列的标准 CSV。识别失败时也会保留原始记录。</NText>
            </NCard>
          </NGridItem>
        </NGrid>

        <NAlert type="info" :bordered="false" class="naive-tip">
          重复导入？系统以「日期 + 金额 + 商家」判重，重复导入不会产生重复记录。
        </NAlert>

        <!-- 导入历史 -->
        <NCard :bordered="true" size="small" class="jobs-card" title="导入历史">
          <NDataTable
            v-if="jobs.length"
            :columns="jobColumns"
            :data="jobs"
            :pagination="false"
            :bordered="false"
            size="small"
          />
          <NEmpty v-else description="还没有导入过账单" size="small">
            <template #icon><div class="empty-ico">📄</div></template>
          </NEmpty>
        </NCard>
      </template>

      <!-- 步骤 2：预览 -->
      <template v-else-if="step === 'preview' && preview">
        <NCard :bordered="true" class="preview-card">
          <div class="preview-head">
            <div>
              <h3>识别结果：<span class="src">{{ preview.sourceLabel }}</span></h3>
              <NText depth="3">共 <strong>{{ preview.count }}</strong> 笔{{ preview.neutralCount ? `，其中中性（不计收支）${preview.neutralCount} 笔` : '' }}</NText>
            </div>
            <NTag :type="preview.source === 'generic' ? 'default' : 'success'" :bordered="false">
              {{ preview.encoding === 'xlsx' ? 'Excel 文件' : `编码 ${preview.encoding}` }}
            </NTag>
          </div>
          <NDivider />

          <!-- 统计 -->
          <NGrid :cols="4" :x-gap="12" :y-gap="12" class="preview-stats">
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
            <NGridItem>
              <div class="stat neutral">
                <span class="label">时间范围</span>
                <span class="val small">{{ preview.stat.minDate || '-' }} ~ {{ preview.stat.maxDate || '-' }}</span>
              </div>
            </NGridItem>
          </NGrid>

          <NAlert v-if="preview.skipped" type="warning" :bordered="false" class="naive-tip">
            已自动跳过 {{ preview.skipped }} 条（交易关闭 / 已退款 / 失败）不参与导入。
          </NAlert>

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
          </NForm>

          <!-- 不计收支明细 -->
          <NCard v-if="preview.neutralCount" size="small" :bordered="true" class="neutral-card">
            <template #header>
              不计收支（{{ preview.neutralCount }} 笔）
            </template>
            <NText depth="3" class="neutral-text">
              提现、充值、零钱通 / 余额宝转出属于账户之间的搬钱，默认不记入收支。勾选下方可一并导入并按「转账」记账。
            </NText>
            <div v-if="preview.neutralSample?.length" class="neutral-table">
              <NText depth="3" style="font-size: 12px">仅预览前 {{ preview.neutralSample.length }} 条</NText>
              <NDataTable
                :columns="neutralColumns"
                :data="preview.neutralSample"
                :pagination="false"
                :bordered="false"
                size="small"
                :max-height="240"
              />
            </div>
            <NCheckbox v-model:checked="commitOptions.include_neutral" class="neutral-check">
              一并导入这 {{ preview.neutralCount }} 笔中性记录
            </NCheckbox>
          </NCard>

          <NDivider />

          <h3>样本预览（{{ preview.sample?.length || 0 }} 条，共 {{ preview.count }} 笔）</h3>
          <NText v-if="preview.sample?.length < preview.count" depth="3" style="font-size: 12px">
            仅预览前 {{ preview.sample?.length }} 条，导入时会包含全部 {{ preview.count }} 笔。
          </NText>
          <NDataTable
            :columns="sampleColumns"
            :data="preview.sample"
            :pagination="false"
            :bordered="true"
            size="small"
            :max-height="500"
            :scroll-x="1120"
          />

          <NDivider />

          <NSpace justify="end">
            <NButton @click="onReset">取消</NButton>
            <NButton type="primary" :loading="loading" @click="onCommit">
              ✅ 确认导入 {{ commitCount }} 笔
            </NButton>
          </NSpace>
        </NCard>
      </template>

      <!-- 步骤 3：完成 -->
      <NCard v-else-if="step === 'done'" :bordered="true" class="done-card">
        <div class="big">🎉</div>
        <h3>导入完成！正在跳转到交易列表…</h3>
        <NSpace justify="center" style="margin-top: 16px">
          <NButton @click="onReset">再导入一份</NButton>
          <NButton type="primary" @click="router.push('/transactions')">查看交易</NButton>
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

.naive-tip { margin-top: 12px; }
.jobs-card { margin-top: 16px; }
.empty-ico { font-size: 32px; }

.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.preview-head h3 { margin: 0 0 4px; font-size: 16px; }
.preview-head .src { color: var(--hl-primary); }
.preview-stats { margin-bottom: 8px; }
.stat { padding: 12px 16px; border-radius: 8px; text-align: center; }
.stat .label { display: block; font-size: 12px; color: var(--hl-muted); }
.stat .val { display: block; font-size: 18px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stat .val.small { font-size: 13px; font-weight: 500; }
.stat.income  { background: var(--hl-income-bg, #e8f6ed); color: var(--hl-income); }
.stat.expense { background: var(--hl-expense-2, #feefef); color: var(--hl-expense); }
.stat.neutral { background: var(--hl-card-2, #f7f8fb); color: var(--hl-text-2); }

.neutral-card { margin-top: 12px; }
.neutral-text { font-size: 12px; line-height: 1.6; }
.neutral-table { margin-top: 8px; }
.neutral-check { margin-top: 8px; }

.done-card { text-align: center; padding: 60px 16px; }
.done-card .big { font-size: 64px; }
.done-card h3 { margin: 12px 0 0; }
</style>
