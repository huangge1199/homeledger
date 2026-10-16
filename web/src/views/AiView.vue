<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem,
  NSwitch, NSpin, NAlert, NDivider, NUpload, NDataTable, useMessage,
  NPopconfirm, type DataTableColumns, NEmpty, NInputNumber, NScrollbar,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AiApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const aiConfig = ref<any>(null)
const aiReady = ref(false)
const usable = ref(false)
const tab = ref<'scan' | 'text' | 'chat' | 'attachments'>('scan')

// --- 截图识别 ---
const images = ref<{ file: File; dataUrl: string; name: string; size: number }[]>([])
const scanning = ref(false)
const scanResult = ref<{ engine: string; items: any[]; warnings: string[]; autoSave: boolean } | null>(null)

// --- 文本识别 ---
const textInput = ref('')
const textScanning = ref(false)
const textResult = ref<{ engine: string; items: any[]; warnings: string[] } | null>(null)

// --- 对话 ---
const chatInput = ref('')
const chatImages = ref<{ file: File; dataUrl: string; name: string }[]>([])
const chatMessages = ref<{ role: 'user' | 'ai'; text: string; items?: any[]; created?: number[] }[]>([])
const chatLoading = ref(false)

// --- 附件 ---
const attachments = ref<any[]>([])
const loadingAttachments = ref(false)

async function loadConfig() {
  try {
    const d = await AiApi.config()
    aiConfig.value = d.config
    aiReady.value = d.ready
    usable.value = d.usable
    if (!usable.value && tab.value === 'scan') tab.value = 'text'
  } catch (e) { /* ignore */ }
}

async function loadAttachments() {
  loadingAttachments.value = true
  try {
    const d = await AiApi.attachments(1)
    attachments.value = d.items || []
  } catch (e) { /* ignore */ }
  finally { loadingAttachments.value = false }
}

onMounted(async () => {
  await loadConfig()
  if (tab.value === 'attachments') loadAttachments()
})

// --- 图片处理 ---
function onUploadImage({ file }: any) {
  if (!file.file) return false
  const reader = new FileReader()
  reader.onload = () => {
    images.value.push({
      file: file.file,
      dataUrl: String(reader.result),
      name: file.name,
      size: file.file.size,
    })
  }
  reader.readAsDataURL(file.file)
  return false
}
function removeImage(idx: number) {
  images.value.splice(idx, 1)
}
function clearImages() { images.value = [] }

async function doScan() {
  if (!images.value.length && !textInput.value.trim()) {
    message.warning('请上传图片或输入文字')
    return
  }
  scanning.value = true
  scanResult.value = null
  try {
    const r = await AiApi.scan({
      images: images.value.map((i) => ({ name: i.name, dataUrl: i.dataUrl })),
      text: textInput.value,
    })
    scanResult.value = { engine: r.engine, items: r.items, warnings: r.warnings || [], autoSave: !!r.autoSave }
    success(`识别完成：${r.items.length} 笔${r.warnings?.length ? `（${r.warnings.length} 个警告）` : ''}`)
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '识别失败')
  } finally {
    scanning.value = false
  }
}

async function doConfirm() {
  if (!scanResult.value?.items.length) return
  scanning.value = true
  try {
    const r = await AiApi.confirm(scanResult.value.items, [], 'ai_screenshot')
    success(`已入库 ${r.created} 笔${r.errors?.length ? `，${r.errors.length} 个错误` : ''}`)
    if (!r.errors?.length) {
      scanResult.value = null
      clearImages()
      textInput.value = ''
    }
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '入库失败')
  } finally {
    scanning.value = false
  }
}

async function doText() {
  if (!textInput.value.trim()) { message.warning('请输入账单内容'); return }
  textScanning.value = true
  textResult.value = null
  try {
    const r = await AiApi.text(textInput.value)
    textResult.value = { engine: r.engine, items: r.items, warnings: r.warnings || [] }
    success(`识别完成：${r.items.length} 笔`)
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '识别失败')
  } finally {
    textScanning.value = false
  }
}

async function doConfirmText() {
  if (!textResult.value?.items.length) return
  textScanning.value = true
  try {
    const r = await AiApi.confirm(textResult.value.items, [], 'ai_text')
    success(`已入库 ${r.created} 笔`)
    if (!r.errors?.length) {
      textResult.value = null
      textInput.value = ''
    }
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '入库失败')
  } finally {
    textScanning.value = false
  }
}

function onUploadChatImage({ file }: any) {
  if (!file.file) return false
  const reader = new FileReader()
  reader.onload = () => {
    chatImages.value.push({ file: file.file, dataUrl: String(reader.result), name: file.name })
  }
  reader.readAsDataURL(file.file)
  return false
}

async function sendChat() {
  if (!chatInput.value.trim() && !chatImages.value.length) {
    message.warning('请输入文字或上传截图')
    return
  }
  const userText = chatInput.value
  chatMessages.value.push({ role: 'user', text: userText })
  chatInput.value = ''
  chatLoading.value = true
  try {
    const r = await AiApi.chat({
      text: userText,
      images: chatImages.value.map((i) => ({ name: i.name, dataUrl: i.dataUrl })),
    })
    chatImages.value = []
    const aiMsg: any = { role: 'ai', text: '', items: r.items }
    if (r.items?.length) {
      aiMsg.text = `识别到 ${r.items.length} 笔，已自动入库 ${r.created} 笔。`
      if (r.errors?.length) aiMsg.text += `失败 ${r.errors.length} 笔。`
      aiMsg.created = r.ids
    } else {
      aiMsg.text = '没识别出可记账的内容，请补充描述（如「午饭 35 元」）。'
    }
    chatMessages.value.push(aiMsg)
  } catch (e: any) {
    chatMessages.value.push({ role: 'ai', text: e?.response?.data?.error || e?.message || '识别失败' })
  } finally {
    chatLoading.value = false
  }
}

const itemColumns = computed<DataTableColumns>(() => [
  { title: '日期', key: 'txn_date', width: 100 },
  {
    title: '类型', key: 'type', width: 80, render: (it: any) => h(NTag, { type: it.kind === 'income' ? 'success' : 'expense' === 'expense' ? 'error' : 'default', size: 'small', bordered: false }, { default: () => it.type_label || it.type }),
  },
  {
    title: '金额', key: 'amount_cents', width: 110, align: 'right',
    render: (it: any) => h(AmountDisplay, { cents: it.amount_cents, sign: true, tone: it.kind === 'income' ? 'income' : 'expense' }),
  },
  { title: '商户', key: 'merchant', ellipsis: true, render: (it: any) => it.merchant || '-' },
  { title: '分类', key: 'category_path', ellipsis: true, render: (it: any) => h(NTag, { size: 'small', bordered: false }, { default: () => it.category_path || '未分类' }) },
  { title: '账户', key: 'account_id', width: 100, render: (it: any) => it.account_name_resolved || it.account_id || '—' },
])

const attachmentColumns = computed<DataTableColumns>(() => [
  { title: '文件名', key: 'name', ellipsis: true },
  { title: '状态', key: 'ai_status', width: 100, render: (a: any) => {
    const tone = a.ai_status === 'recognized' ? 'success' : a.ai_status === 'rule' ? 'default' : 'warning'
    const label = ({ recognized: '已识别', rule: '已识别', error: '失败', pending: '待处理' } as Record<string, string>)[a.ai_status] || a.ai_status
    return h(NTag, { type: tone, size: 'small', bordered: false }, { default: () => label })
  } },
  { title: '上传时间', key: 'created_at', width: 160 },
  {
    title: '操作', key: 'op', width: 100,
    render: (a: any) => h(NPopconfirm, { positiveText: '删除', negativeText: '取消', onPositiveClick: async () => {
      try { await AiApi.removeAttachment(Number(a.id)); success('已删除'); loadAttachments() } catch (e: any) { toastError(e?.response?.data?.error || '删除失败') }
    } }, {
      trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, { default: () => '删除' }),
      default: () => '删除该附件？',
    }),
  },
])
</script>

<template>
  <AppShell>
    <PageHead title="AI 截图记账" sub="上传账单截图，AI 自动识别并入账；也可直接输入文字快速记">
      <template #actions>
        <NButton v-if="!usable" @click="session.canManage ? $router.push('/settings?tab=ai') : $router.push('/settings')" type="warning">
          ⚠️ AI 未配置
        </NButton>
        <NButton v-else @click="$router.push('/settings?tab=ai')">⚙️ AI 设置</NButton>
      </template>
    </PageHead>

    <NAlert v-if="!usable" type="warning" :show-icon="true" style="margin-bottom: 12px">
      AI 助手尚未配置完成。请先在「设置 → AI 设置」中填入 Base URL 和 API Key。
      <span v-if="aiConfig">
        当前状态：<NTag :type="aiReady ? 'success' : 'default'" size="small" :bordered="false">{{ aiReady ? '已就绪' : '未就绪' }}</NTag>
      </span>
    </NAlert>

    <NCard :bordered="true" size="small" class="tabs">
      <NSpace size="small">
        <NButton :type="tab === 'scan' ? 'primary' : 'default'" size="small" @click="tab = 'scan'">📷 截图识别</NButton>
        <NButton :type="tab === 'text' ? 'primary' : 'default'" size="small" @click="tab = 'text'">📝 文字记账</NButton>
        <NButton :type="tab === 'chat' ? 'primary' : 'default'" size="small" @click="tab = 'chat'">💬 智能对话</NButton>
        <NButton :type="tab === 'attachments' ? 'primary' : 'default'" size="small" @click="tab = 'attachments'; loadAttachments()">📎 附件</NButton>
      </NSpace>
    </NCard>

    <!-- ===== 截图识别 ===== -->
    <template v-if="tab === 'scan'">
      <NCard :bordered="true" class="tab-card" title="📷 截图识别">
        <NSpace vertical :size="12">
          <NUpload :custom-request="onUploadImage" :show-file-list="false" accept="image/*" :max="6" :default-upload="false">
            <NButton>点击或拖拽图片到此处（最多 6 张）</NButton>
          </NUpload>
          <NSpace v-if="images.length" :wrap="true" size="small">
            <div v-for="(img, idx) in images" :key="idx" class="thumb">
              <img :src="img.dataUrl" />
              <div class="thumb-info">
                <span class="ellipsis">{{ img.name }}</span>
                <NButton size="tiny" quaternary type="error" @click="removeImage(idx)">×</NButton>
              </div>
            </div>
          </NSpace>
          <NInput
            v-model:value="textInput"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            placeholder="（可选）补充描述，比如 '本月微信账单' 或 '支付宝消费'"
          />
          <NSpace>
            <NButton v-if="images.length" @click="clearImages">清空图片</NButton>
            <NButton type="primary" :loading="scanning" @click="doScan">🔍 识别</NButton>
          </NSpace>
        </NSpace>
      </NCard>

      <NCard v-if="scanResult" :bordered="true" class="tab-card" :title="`识别结果（${scanResult.engine}）`">
        <NAlert v-if="scanResult.warnings.length" type="warning" :show-icon="true" style="margin-bottom: 8px">
          <ul style="margin: 0; padding-left: 16px">
            <li v-for="(w, i) in scanResult.warnings" :key="i">{{ w }}</li>
          </ul>
        </NAlert>
        <NSpace v-if="scanResult.autoSave" size="small" style="margin-bottom: 8px">
          <NTag type="success" :bordered="false">自动入库已开启</NTag>
          <NText depth="3">点击「确认入库」将一次性写入所有识别项</NText>
        </NSpace>
        <Empty v-if="!scanResult.items.length" icon="🤔" title="没有识别到内容" />
        <NDataTable
          v-else
          :columns="itemColumns"
          :data="scanResult.items"
          :pagination="false"
          size="small"
          :max-height="400"
        />
        <NDivider />
        <NSpace justify="end">
          <NButton @click="scanResult = null">取消</NButton>
          <NButton type="primary" :loading="scanning" @click="doConfirm" :disabled="!scanResult.items.length">
            ✅ 确认入库 {{ scanResult.items.length }} 笔
          </NButton>
        </NSpace>
      </NCard>
    </template>

    <!-- ===== 文字记账 ===== -->
    <template v-if="tab === 'text'">
      <NCard :bordered="true" class="tab-card" title="📝 文字记账">
        <NInput
          v-model:value="textInput"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="比如：&#10;午饭 35.5&#10;打车回家 28 微信&#10;收到工资 5000 银行卡"
        />
        <NSpace style="margin-top: 8px">
          <NButton @click="textInput = ''">清空</NButton>
          <NButton type="primary" :loading="textScanning" @click="doText">🔍 识别</NButton>
        </NSpace>
      </NCard>

      <NCard v-if="textResult" :bordered="true" class="tab-card" :title="`识别结果（${textResult.engine}）`">
        <NAlert v-if="textResult.warnings.length" type="warning" :show-icon="true" style="margin-bottom: 8px">
          <ul style="margin: 0; padding-left: 16px">
            <li v-for="(w, i) in textResult.warnings" :key="i">{{ w }}</li>
          </ul>
        </NAlert>
        <Empty v-if="!textResult.items.length" icon="🤔" title="没有识别到内容" />
        <NDataTable
          v-else
          :columns="itemColumns"
          :data="textResult.items"
          :pagination="false"
          size="small"
          :max-height="400"
        />
        <NDivider />
        <NSpace justify="end">
          <NButton @click="textResult = null">取消</NButton>
          <NButton type="primary" :loading="textScanning" @click="doConfirmText" :disabled="!textResult.items.length">
            ✅ 确认入库
          </NButton>
        </NSpace>
      </NCard>
    </template>

    <!-- ===== 智能对话 ===== -->
    <template v-if="tab === 'chat'">
      <NCard :bordered="true" class="tab-card" title="💬 智能对话" style="height: 60vh; display: flex; flex-direction: column">
        <NScrollbar style="flex: 1; padding: 0 4px">
          <NEmpty v-if="!chatMessages.length" description="和 AI 聊一句，比如「午饭 35 元」" />
          <div v-for="(m, i) in chatMessages" :key="i" class="msg" :class="m.role">
            <div class="avatar">
              {{ m.role === 'user' ? (session.user?.displayName || '我').slice(0, 1) : '🤖' }}
            </div>
            <div class="bubble">
              <div class="text">{{ m.text }}</div>
              <div v-if="m.items?.length" class="items">
                <NDataTable :columns="itemColumns" :data="m.items" :pagination="false" size="small" :max-height="200" />
              </div>
            </div>
          </div>
        </NScrollbar>
        <NDivider style="margin: 8px 0" />
        <NSpace v-if="chatImages.length" :wrap="true" size="small" style="margin-bottom: 8px">
          <div v-for="(img, idx) in chatImages" :key="idx" class="thumb">
            <img :src="img.dataUrl" />
            <NButton size="tiny" quaternary type="error" @click="chatImages.splice(idx, 1)">×</NButton>
          </div>
        </NSpace>
        <NSpace :wrap="false">
          <NUpload :custom-request="onUploadChatImage" :show-file-list="false" accept="image/*" :default-upload="false">
            <NButton quaternary>📎 图片</NButton>
          </NUpload>
          <NInput
            v-model:value="chatInput"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            placeholder="输入账单内容（回车发送，Shift+回车换行）"
            style="flex: 1"
            @keydown.enter.exact.prevent="sendChat"
          />
          <NButton type="primary" :loading="chatLoading" @click="sendChat">发送</NButton>
        </NSpace>
      </NCard>
    </template>

    <!-- ===== 附件 ===== -->
    <template v-if="tab === 'attachments'">
      <NCard :bordered="true" class="tab-card" title="📎 历史附件">
        <NSpin :show="loadingAttachments">
          <Empty v-if="!loadingAttachments && !attachments.length" icon="📎" title="还没有附件" description="上传截图后会显示在这里" />
          <NDataTable
            v-else
            :columns="attachmentColumns"
            :data="attachments"
            :pagination="false"
            size="small"
          />
        </NSpin>
      </NCard>
    </template>
  </AppShell>
</template>

<style scoped>
.tabs { margin-bottom: 12px; }
.tab-card { margin-bottom: 12px; }
.thumb {
  position: relative;
  display: inline-block;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 6px;
  padding: 4px;
  background: #fff;
  width: 120px;
}
.thumb img { width: 100%; height: 80px; object-fit: cover; border-radius: 4px; display: block; }
.thumb-info {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
}
.thumb-info .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.msg { display: flex; gap: 8px; margin-bottom: 12px; }
.msg.user { flex-direction: row-reverse; }
.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--hl-primary, #3d6df5); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 500; flex-shrink: 0;
}
.msg.ai .avatar { background: #52c41a; }
.bubble {
  max-width: 75%;
  padding: 8px 12px;
  background: var(--hl-card-2, #f7f8fb);
  border-radius: 8px;
  font-size: 14px;
}
.msg.user .bubble { background: var(--hl-primary-2, #e8efff); }
.bubble .text { white-space: pre-wrap; }
.bubble .items { margin-top: 8px; }
</style>
