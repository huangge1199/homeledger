<script setup lang="ts">
/**
 * AI 截图记账（对齐老版 ai.ejs + public/js/app.js 的 initAiPage）
 *
 * 老版行为基准：
 *   · 两栏 grid-main：左 = 上传卡 + 识别结果 + 文字快速记账；右 = 识别原理 + 识别历史
 *   · 顶部三态提示：未配置 / 已配置未启用 / 已连接（模型 · 视觉 · 自动保存）
 *   · 上传：拖拽 + 点击选择 + Ctrl+V 粘贴，单张 ≤8MB、仅图片、最多 6 张
 *   · 识别结果为「可编辑草稿卡」：金额 / 日期 / 类型 / 分类 / 账户 / 商家备注，可单笔删除
 *   · 文本快速记账：单笔跳「记一笔」页预填，多笔走草稿确认
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NText, NTag, NInput, NInputNumber, NSelect, NAlert,
  NImage,
} from 'naive-ui'

import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AccountSelect, { type AccountOption } from '@/components/AccountSelect.vue'
import DatePickerWrap from '@/components/DatePickerWrap.vue'
import { AiApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { kindOf } from '@/utils/txnTypes'
import { fmtPlain } from '@/utils/money'

const router = useRouter()
const session = useSessionStore()
const { success, error: toastError, warning } = useFlash()

/* --------------------------------- 配置 ---------------------------------- */
const aiConfig = ref<any>(null)
const aiReady = ref(false)
const aiUsable = ref(false)

async function loadConfig() {
  try {
    const d = await AiApi.config()
    aiConfig.value = d.config
    aiReady.value = !!d.ready
    aiUsable.value = !!d.usable
  } catch { /* ignore */ }
}

/* --------------------------------- 表单选项 -------------------------------- */
const accounts = ref<AccountOption[]>([])
const categories = ref<any[]>([])

async function loadFormOptions() {
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts || []
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
  } catch { /* ignore */ }
}

/* --------------------------------- 截图上传 -------------------------------- */
const MAX_IMAGES = 6
const MAX_BYTES = 8 * 1024 * 1024

interface Shot {
  dataUrl: string
  name: string
  size: number
}
const images = ref<Shot[]>([])
const dragover = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const textInput = ref('')
const scanning = ref(false)

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('读取失败'))
    fr.readAsDataURL(file)
  })
}

async function addFiles(files: File[]) {
  for (const f of files) {
    if (!/^image\//.test(f.type)) {
      warning(`只支持图片文件：${f.name}`)
      continue
    }
    if (f.size > MAX_BYTES) {
      warning(`图片请小于 8MB：${f.name}`)
      continue
    }
    if (images.value.length >= MAX_IMAGES) {
      warning('一次最多 6 张截图')
      break
    }
    try {
      images.value.push({ dataUrl: await readDataUrl(f), name: f.name, size: f.size })
    } catch (e: any) {
      warning(e?.message || '读取失败')
    }
  }
}

function pickFile() {
  fileInput.value?.click()
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  await addFiles(Array.from(input.files || []))
  input.value = ''
}

async function onDrop(e: DragEvent) {
  dragover.value = false
  await addFiles(Array.from(e.dataTransfer?.files || []))
}

/** 直接 Ctrl+V 粘贴截图（老版 document 级 paste 监听） */
async function onPaste(e: ClipboardEvent) {
  if (!e.clipboardData) return
  const files = Array.from(e.clipboardData.items || [])
    .filter((it) => it.kind === 'file')
    .map((it) => it.getAsFile())
    .filter(Boolean) as File[]
  if (!files.length) return
  e.preventDefault()
  await addFiles(files)
  success(`已粘贴 ${files.length} 张截图`)
}

function removeImage(i: number) {
  images.value.splice(i, 1)
}

/* --------------------------------- 识别结果 -------------------------------- */
interface Draft {
  key: number
  type: string
  amount: number | null
  txn_date: string
  category_id: number | null
  account_id: number | null
  note: string
  confidence: number
  raw: any
}

const drafts = ref<Draft[]>([])
const scanMeta = ref<{ engine: string; model?: string | null; warnings: string[] } | null>(null)
const lastImageIds = ref<number[]>([])
const saving = ref(false)
const saveHint = ref('')
let draftSeq = 0

const ENGINE_LABEL: Record<string, string> = { llm: 'AI 视觉模型', rule: '内置规则引擎' }
const TYPE_OPTIONS = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
]

function typeLabel(t: string) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label || t
}

function toDraft(it: any): Draft {
  const note = it.merchant || ''
    ? `${it.merchant}${it.note && it.note !== it.merchant ? ' ' + it.note : ''}`
    : (it.note || '')
  return {
    key: ++draftSeq,
    type: it.type || 'expense',
    amount: Math.round(Number(it.amount_cents || 0)) / 100,
    txn_date: it.txn_date || dayjs().format('YYYY-MM-DD'),
    category_id: it.category_id ? Number(it.category_id) : null,
    account_id: it.account_id ? Number(it.account_id) : null,
    note,
    confidence: Number(it.confidence || 0),
    raw: it.raw || it,
  }
}

function confClass(c: number) {
  const v = Number(c || 0)
  return v >= 0.8 ? 'high' : v >= 0.5 ? 'mid' : 'low'
}

/** 分类下拉：按当前类型的收支口径过滤（老版 kind 联动） */
function catOptions(type: string) {
  const k = kindOf(type)
  return categories.value
    .filter((c) => c.kind === k)
    .map((c) => ({ label: c.path || c.name, value: Number(c.id) }))
}

function categoryPath(id: number | null) {
  if (!id) return '未分类'
  const c = categories.value.find((x) => Number(x.id) === Number(id))
  return c ? (c.path || c.name) : '未分类'
}

/** 切换类型：转账不需要分类；口径变了要清掉不再匹配的分类 */
function onTypeChange(d: Draft) {
  if (d.type === 'transfer') {
    d.category_id = null
    return
  }
  if (d.category_id) {
    const c = categories.value.find((x) => Number(x.id) === Number(d.category_id))
    if (c && c.kind !== kindOf(d.type)) d.category_id = null
  }
}

function removeDraft(key: number) {
  drafts.value = drafts.value.filter((d) => d.key !== key)
}

const validDrafts = computed(() =>
  drafts.value.filter((d) => Math.round(Number(d.amount || 0) * 100) > 0)
)

function buildItems() {
  return validDrafts.value.map((d) => ({
    type: d.type,
    amount_cents: Math.round(Number(d.amount || 0) * 100),
    txn_date: d.txn_date,
    category_id: d.type === 'transfer' ? null : d.category_id,
    account_id: d.account_id,
    note: d.note,
    merchant: d.note,
    raw: d.raw,
  }))
}

/* --------------------------------- 扫描 ---------------------------------- */
const canWrite = computed(() => session.canWrite)
const canScan = computed(
  () => canWrite.value && (images.value.length > 0 || !!textInput.value.trim())
)

async function doScan() {
  if (!images.value.length && !textInput.value.trim()) {
    warning('请上传截图或输入账单文字')
    return
  }
  scanning.value = true
  saveHint.value = ''
  try {
    const r = await AiApi.scan({
      images: images.value.map((i) => ({ name: i.name, dataUrl: i.dataUrl })),
      text: textInput.value,
    })
    scanMeta.value = {
      engine: r.engine,
      model: r.model,
      warnings: r.warnings || [],
    }
    // 截图 id 留档，确认入库时回传，附件才会挂到交易上
    lastImageIds.value = (r.images || []).map((i: any) => Number(i.id)).filter(Boolean)
    drafts.value = (r.items || []).map(toDraft)
    if (!drafts.value.length) {
      warning('没有识别出可记账的交易，可以换个更清晰的截图，或直接手动输入账单文字')
    }
  } catch (e) {
    toastError(errorMessage(e, '识别失败'))
  } finally {
    scanning.value = false
  }
}

/** 清空重来：结果、图片、补充文字一并清掉（老版 #ai-clear） */
function clearResult() {
  drafts.value = []
  scanMeta.value = null
  lastImageIds.value = []
  saveHint.value = ''
  images.value = []
  textInput.value = ''
}

async function doConfirm() {
  if (!validDrafts.value.length) {
    warning('请至少保留一笔有效金额')
    return
  }
  saving.value = true
  saveHint.value = ''
  try {
    const r = await AiApi.confirm(buildItems(), lastImageIds.value, 'ai_screenshot')
    success(`已保存 ${r.created} 笔${r.errors?.length ? `，${r.errors.length} 笔失败` : ''}`)
    if (r.errors?.length) {
      saveHint.value = r.errors.join('；')
    } else {
      clearResult()
      router.push('/transactions')
    }
  } catch (e) {
    toastError(errorMessage(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

/* ------------------------------ 文字快速记账 ------------------------------ */
const quickText = ref('')
const quicking = ref(false)

async function doQuickText() {
  const text = quickText.value.trim()
  if (!text) {
    warning('请输入内容')
    return
  }
  quicking.value = true
  try {
    const r = await AiApi.text(text)
    const items = r.items || []
    ;(r.warnings || []).forEach((w: string) => warning(w))
    if (!items.length) {
      warning('没能识别出金额，请换个说法，例如「午饭 35 元 支付宝」')
      return
    }
    if (items.length === 1) {
      // 单笔：直接跳「记一笔」页预填（老版 from_ai 行为）
      const s = items[0]
      const q: Record<string, string> = {
        type: s.type || 'expense',
        amount: (Number(s.amount_cents || 0) / 100).toFixed(2),
        date: s.txn_date || dayjs().format('YYYY-MM-DD'),
        note: s.note || s.merchant || '',
      }
      if (s.category_id) q.category_id = String(s.category_id)
      if (s.account_id) q.account_id = String(s.account_id)
      router.push({ path: '/transactions/new', query: q })
      return
    }
    // 多笔：走草稿确认
    scanMeta.value = { engine: r.engine, model: null, warnings: r.warnings || [] }
    lastImageIds.value = []
    drafts.value = items.map(toDraft)
  } catch (e) {
    toastError(errorMessage(e, '识别失败'))
  } finally {
    quicking.value = false
  }
}

/* --------------------------------- 识别历史 -------------------------------- */
const galleryItems = ref<any[]>([])

async function loadHistory() {
  try {
    const d = await AiApi.attachments(1)
    galleryItems.value = (d.items || []).slice(0, 12)
  } catch { /* ignore */ }
}

function historyCaption(a: any) {
  if (a.merchant) return a.merchant
  if (a.category_name) return `${a.category_icon || ''} ${a.category_name}`
  return String(a.created_at || '').slice(0, 10)
}

/* --------------------------------- 生命周期 -------------------------------- */
onMounted(async () => {
  await Promise.all([loadConfig(), loadFormOptions()])
  loadHistory()
  document.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
})
</script>

<template>
  <AppShell>
    <PageHead title="AI 截图记账" sub="上传账单截图，AI 自动识别并入账；也可直接输入文字快速记">
      <template #actions>
        <NButton v-if="!aiUsable" type="warning" @click="router.push('/settings?tab=ai')">
          ⚠️ AI 未配置
        </NButton>
        <NButton v-else @click="router.push('/settings?tab=ai')">⚙️ AI 设置</NButton>
      </template>
    </PageHead>

    <!-- 配置状态三态提示（老版 ai.ejs） -->
    <NAlert v-if="!aiReady" type="warning" :show-icon="true" class="mb12">
      <b>尚未配置 AI 模型。</b>当前截图上传后会使用<b>内置规则引擎</b>解析（对结构清晰的账单文字效果不错，但读图能力有限）。
      想获得真正的「截图即记账」体验，请到 <RouterLink to="/settings?tab=ai">设置 → AI 记账</RouterLink> 填入一个支持视觉的模型接口；也可以填 NAS 上自建的 Ollama 地址。
    </NAlert>
    <NAlert v-else-if="!aiUsable" type="warning" :show-icon="true" class="mb12">
      已填写模型 <b>{{ aiConfig?.model }}</b>，但 AI 识别处于<b>关闭</b>状态，当前仍使用内置规则引擎。可在
      <RouterLink to="/settings?tab=ai">设置 → AI 记账</RouterLink> 中勾选「启用 AI 识别」。
    </NAlert>
    <NAlert v-else type="info" :show-icon="true" class="mb12">
      已连接模型 <b>{{ aiConfig?.model }}</b>（{{ aiConfig?.baseUrl }}）· 视觉能力
      {{ aiConfig?.vision ? '已开启' : '已关闭' }} · 自动保存
      {{ aiConfig?.autoSave ? '已开启（识别后直接入库）' : '关闭（识别后需你确认）' }}
    </NAlert>

    <NAlert v-if="!canWrite" type="error" :show-icon="true" class="mb12">
      当前账本为只读角色，无法通过 AI 记账。你仍可以上传截图查看识别结果，但不能保存入库。
    </NAlert>

    <div class="ai-grid">
      <!-- ==================== 左栏 ==================== -->
      <div class="ai-col">
        <!-- 上传账单截图 -->
        <NCard :bordered="true" class="mb12">
          <div class="card-head">
            <span class="ch-title">上传账单截图</span>
            <span class="muted small">支持拖拽、点击选择，或直接 Ctrl+V 粘贴</span>
          </div>

          <div
            class="dropzone"
            :class="{ dragover }"
            @click="pickFile"
            @dragover.prevent="dragover = true"
            @dragenter.prevent="dragover = true"
            @dragleave.prevent="dragover = false"
            @drop.prevent="onDrop"
          >
            <span class="big">📷</span>
            <div class="bold">把账单截图拖到这里，或点击选择</div>
            <div class="muted small mt8">
              支持支付宝 / 微信 / 银行 App / 购物订单截图，一次最多 6 张，每张不超过 8MB
            </div>
            <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
          </div>

          <div v-if="images.length" class="thumbs">
            <div v-for="(img, i) in images" :key="i" class="thumb">
              <img :src="img.dataUrl" alt="" />
              <button type="button" title="移除" @click="removeImage(i)">✕</button>
            </div>
          </div>

          <div class="field mt16">
            <label>或者补充账单文字（可选，能显著提高识别准确率）</label>
            <NInput
              v-model:value="textInput"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 6 }"
              placeholder="例如：&#10;9月14日 午饭 麦当劳 35.5 支付宝&#10;9月14日 打车 28 微信"
            />
          </div>

          <div class="row mt16">
            <NButton type="primary" size="large" :loading="scanning" :disabled="!canScan" @click="doScan">
              开始识别
            </NButton>
            <NButton size="large" @click="router.push('/transactions/new')">手动记一笔</NButton>
          </div>
        </NCard>

        <!-- 识别结果（可编辑草稿卡） -->
        <div v-if="scanMeta" class="mb12">
          <div class="card-head">
            <span class="ch-title">识别结果（{{ drafts.length }} 笔）</span>
            <NTag type="primary" size="small" :bordered="false">
              {{ ENGINE_LABEL[scanMeta.engine] || scanMeta.engine }}
              <template v-if="scanMeta.model"> · {{ scanMeta.model }}</template>
            </NTag>
          </div>

          <NAlert
            v-for="(w, i) in scanMeta.warnings"
            :key="i"
            type="warning"
            :show-icon="true"
            class="mb8"
          >{{ w }}</NAlert>

          <Empty
            v-if="!drafts.length"
            icon="🤔"
            title="没有识别出可记账的交易"
            description="可以换个更清晰的截图，或直接手动输入账单文字"
          />

          <NCard v-for="d in drafts" :key="d.key" :bordered="true" size="small" class="draft">
            <div class="draft-head">
              <NTag
                size="small"
                :bordered="false"
                :type="d.type === 'income' ? 'success' : d.type === 'transfer' ? 'info' : 'error'"
              >{{ typeLabel(d.type) }}</NTag>
              <NTag size="small" :bordered="false">{{ categoryPath(d.category_id) }}</NTag>
              <span class="confidence" :class="confClass(d.confidence)">
                把握 {{ Math.round((d.confidence || 0) * 100) }}%
              </span>
              <span class="spacer" />
              <NButton size="tiny" quaternary type="error" @click="removeDraft(d.key)">删除</NButton>
            </div>

            <div class="draft-grid">
              <div class="field">
                <label>金额</label>
                <NInputNumber
                  v-model:value="d.amount"
                  :min="0"
                  :precision="2"
                  placeholder="0.00"
                  style="width: 100%"
                >
                  <template #prefix>¥</template>
                </NInputNumber>
              </div>
              <div class="field">
                <label>日期</label>
                <DatePickerWrap v-model="d.txn_date" />
              </div>
              <div class="field">
                <label>类型</label>
                <NSelect
                  v-model:value="d.type"
                  :options="TYPE_OPTIONS"
                  @update:value="onTypeChange(d)"
                />
              </div>
              <div v-if="d.type !== 'transfer'" class="field">
                <label>分类</label>
                <NSelect
                  v-model:value="d.category_id"
                  clearable
                  filterable
                  placeholder="未分类"
                  :options="catOptions(d.type)"
                />
              </div>
              <div class="field">
                <label>账户</label>
                <AccountSelect v-model="d.account_id" :list="accounts" />
              </div>
              <div class="field">
                <label>商家 / 备注</label>
                <NInput v-model:value="d.note" placeholder="商家 / 备注" />
              </div>
            </div>
          </NCard>

          <div class="row mt16">
            <NButton
              type="primary"
              size="large"
              :loading="saving"
              :disabled="!validDrafts.length || !canWrite"
              @click="doConfirm"
            >
              确认并保存 {{ validDrafts.length }} 笔
            </NButton>
            <NButton size="large" quaternary @click="clearResult">清空重来</NButton>
            <NText v-if="saveHint" depth="3" class="hint">{{ saveHint }}</NText>
          </div>
        </div>

        <!-- 文字快速记账 -->
        <NCard :bordered="true">
          <div class="card-head">
            <span class="ch-title">文字快速记账</span>
            <span class="muted small">一行一笔，支持自然语言</span>
          </div>
          <div class="row">
            <NInput
              v-model:value="quickText"
              placeholder="午饭 35 支付宝"
              style="flex: 1"
              @keydown.enter="doQuickText"
            />
            <NButton type="primary" :loading="quicking" :disabled="!canWrite" @click="doQuickText">
              解析
            </NButton>
          </div>
          <div class="notice small mt12">
            示例：<span class="mono">昨天晚饭 88 微信</span> / <span class="mono">打车 26.5</span> /
            <span class="mono">工资 12000</span> / <span class="mono">房租 3500 银行卡</span>
          </div>
        </NCard>
      </div>

      <!-- ==================== 右栏 ==================== -->
      <div class="ai-col">
        <!-- 识别原理 -->
        <NCard :bordered="true" class="mb12">
          <div class="card-head"><span class="ch-title">识别原理</span></div>
          <ol class="small muted steps">
            <li>截图上传到你的 NAS，<b>不会发给第三方存储</b></li>
            <li>图片以 Base64 直接送入你配置的视觉模型接口</li>
            <li>模型返回结构化 JSON（金额 / 日期 / 商家 / 分类 / 账户）</li>
            <li>你在页面上核对修正后一键入库，原图作为附件留存</li>
          </ol>
          <div class="notice small mt12">
            未配置模型时使用内置规则引擎：从文字中提取金额、日期、支付方式与分类关键词，完全离线可用。
          </div>
        </NCard>

        <!-- 识别历史 -->
        <NCard :bordered="true">
          <div class="card-head">
            <span class="ch-title">识别历史</span>
            <RouterLink to="/attachments" class="more-link">全部 →</RouterLink>
          </div>
          <Empty v-if="!galleryItems.length" icon="🖼️" title="还没有上传过截图" />
          <div v-else class="gallery">
            <figure v-for="a in galleryItems" :key="a.id">
              <NImage
                :src="a.url"
                :alt="a.file_name || '账单截图'"
                width="100%"
                height="132"
                object-fit="cover"
                :preview-props="{ showToolbar: true }"
              />
              <figcaption>
                <b>{{ a.amount_cents != null ? fmtPlain(a.amount_cents) : '未关联' }}</b>
                {{ historyCaption(a) }}
              </figcaption>
            </figure>
          </div>
        </NCard>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* 老版 .grid-main：左 1.6fr / 右 1fr，窄屏塌成单栏 */
.ai-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .ai-grid { grid-template-columns: minmax(0, 1fr); }
}
.ai-col { min-width: 0; }
.mb8 { margin-bottom: 8px; }
.mb12 { margin-bottom: 12px; }
.mt8 { margin-top: 8px; }
.mt12 { margin-top: 12px; }
.mt16 { margin-top: 16px; }
.muted { color: var(--hl-muted, #7d8aa3); }
.small { font-size: 12.5px; }
.bold { font-weight: 650; }
.mono { font-family: v-mono, SFMono-Regular, Menlo, Consolas, monospace; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spacer { flex: 1; }
.hint { font-size: 12px; }

/* 卡头（老版 .card-head） */
.card-head {
  display: flex; align-items: center; gap: 10px;
  margin: -4px 0 12px; flex-wrap: wrap;
}
.ch-title { font-size: 15px; font-weight: 600; color: var(--hl-text, #17202e); }
.more-link { margin-left: auto; font-size: 12px; color: var(--hl-primary, #3d6df5); text-decoration: none; }
.more-link:hover { text-decoration: underline; }

/* 上传区（老版 .dropzone） */
.dropzone {
  border: 2px dashed var(--hl-border, #e6eaf1);
  border-radius: 10px;
  padding: 32px 18px;
  text-align: center;
  cursor: pointer;
  background: var(--hl-card-2, #f7f8fb);
  transition: border-color .18s, background .18s;
}
.dropzone:hover, .dropzone.dragover {
  border-color: var(--hl-primary, #3d6df5);
  background: var(--hl-primary-2, #e8efff);
}
.dropzone .big { font-size: 32px; display: block; margin-bottom: 8px; }
.hidden { display: none; }

/* 缩略图（老版 .thumbs / .thumb） */
.thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.thumb {
  position: relative; width: 78px; height: 78px;
  border-radius: 10px; overflow: hidden;
  border: 1px solid var(--hl-border, #e6eaf1);
  box-shadow: var(--hl-shadow, 0 1px 2px rgba(15,22,36,.04));
  background: var(--hl-card, #fff);
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb button {
  position: absolute; top: 3px; right: 3px;
  width: 19px; height: 19px; border-radius: 50%;
  border: 0; background: rgba(15, 23, 42, .65); color: #fff;
  font-size: 11px; cursor: pointer; line-height: 1;
  display: grid; place-items: center;
}

/* 表单字段 */
.field label {
  display: block; font-size: 12px; color: var(--hl-muted, #7d8aa3); margin-bottom: 4px;
}

/* 草稿卡（老版 .draft） */
.draft { margin-bottom: 10px; }
.draft-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; flex-wrap: wrap;
}
.draft-grid { display: grid; grid-template-columns: 118px 1fr 1fr; gap: 9px; }
.draft-grid .field { margin-bottom: 0; }
.confidence { font-size: 10.5px; padding: 1px 6px; border-radius: 99px; font-weight: 600; }
.confidence.high { background: var(--hl-income-bg, #e8f6ed); color: var(--hl-income, #12a150); }
.confidence.mid { background: #fff4e0; color: var(--hl-warn, #c97a16); }
.confidence.low { background: var(--hl-expense-2, #feefef); color: var(--hl-expense, #e5484d); }

/* 提示块（老版 .notice） */
.notice {
  padding: 11px 14px; border-radius: 8px; font-size: 12.5px; line-height: 1.65;
  background: var(--hl-card-2, #f7f8fb);
  border: 1px dashed var(--hl-border, #e6eaf1);
  color: var(--hl-text-2, #45516a);
}

/* 识别原理步骤（老版 ol） */
.steps { padding-left: 18px; line-height: 2; margin: 0; }

/* 识别历史画廊（老版 .gallery） */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
.gallery figure {
  margin: 0; border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 11px; overflow: hidden;
  background: var(--hl-card, #fff);
  box-shadow: var(--hl-shadow, 0 1px 2px rgba(15,22,36,.04));
  transition: transform .15s;
}
.gallery figure:hover { transform: translateY(-2px); }
.gallery figcaption { padding: 7px 9px; font-size: 11.5px; color: var(--hl-muted, #7d8aa3); }
.gallery figcaption b { display: block; color: var(--hl-text-2, #45516a); font-size: 12.5px; }

/* 手机端（老版 app.css ≤820px 规则） */
@media (max-width: 820px) {
  .draft-grid { grid-template-columns: 1fr 1fr; }
  .draft-grid .field:first-child { grid-column: span 2; }
  .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
