<script setup lang="ts">
/**
 * AI 记账助手浮窗（对齐旧版 assistant.js + layout.ejs 的 #aiFab/#aiPanel）
 * - 悬浮球：桌面端右下角（移动端隐藏，旧版同样行为）
 * - 面板：右下 376x520，含消息气泡 / 截图缩略图 / 输入区
 * - Esc 关闭；Enter 发送、Shift+Enter 换行；最多 6 张图
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AiApi } from '@/api/modules'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()

interface ChatItem {
  amount_cents: number
  type?: string
  kind?: string
  merchant?: string
  note?: string
  category_path?: string
  account_name_resolved?: string
  txn_date?: string
}
interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  items?: ChatItem[]
  created?: number
  engine?: string
  model?: string
  warn?: string
  imgs?: string[]
}

const open = ref(false)
const busy = ref(false)
const text = ref('')
const pending = ref<{ dataUrl: string; name: string }[]>([])
const msgs = ref<ChatMsg[]>([])
const box = ref<HTMLElement | null>(null)

const canWrite = computed(() => session.canWrite)
const hint = computed(() => (session.aiUsable ? 'AI 模型已连接' : '未配置模型 · 规则解析'))

function scrollBottom() {
  nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
}
watch(() => msgs.value.length, scrollBottom)
watch(open, (v) => { if (v) scrollBottom() })

function readImage(file: File) {
  return new Promise<string>((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => resolve('')
    fr.readAsDataURL(file)
  })
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  for (const f of Array.from(input.files || [])) {
    if (pending.value.length >= 6) break
    const dataUrl = await readImage(f)
    if (dataUrl) pending.value.push({ dataUrl, name: f.name })
  }
  input.value = ''
}

function removePending(i: number) { pending.value.splice(i, 1) }

function fmtCents(c: number | null | undefined) {
  return '¥' + ((Number(c || 0)) / 100).toFixed(2)
}

function itemTitle(it: ChatItem) {
  return it.merchant || it.note || (it.kind === 'income' ? '一笔收入' : '一笔支出')
}

async function send() {
  if (busy.value) return
  const t = text.value.trim()
  if (!t && !pending.value.length) return
  busy.value = true

  const imgs = pending.value.map((p) => p.dataUrl)
  msgs.value.push({ role: 'user', text: t || '(发来一张截图)', imgs })
  text.value = ''
  const images = pending.value.splice(0)

  try {
    const r: any = await AiApi.chat({ text: t, images: images.map((i) => ({ name: i.name, dataUrl: i.dataUrl })) })
    if (r?.items?.length) {
      msgs.value.push({
        role: 'ai', text: '', items: r.items, created: r.created,
        engine: r.engine, model: r.model,
        warn: [...(r.errors || []), ...(r.warnings || [])].join('；') || undefined,
      })
    } else {
      msgs.value.push({ role: 'ai', text: '没有识别到可记账的内容 🤔 试试像这样描述：「午饭 35 元」、「昨天加油 300」，或发一张账单截图。' })
    }
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '识别失败，请稍后重试'
    msgs.value.push({ role: 'ai', text: msg, warn: /未配置|尚未配置/.test(msg) ? 'cfg' : undefined })
  } finally {
    busy.value = false
  }
}

function clearAll() {
  msgs.value = []
  pending.value = []
}

function goTransactions() {
  open.value = false
  router.push('/transactions')
}

function engineTag(m: ChatMsg) {
  if (m.engine === 'llm') return m.model ? `模型 ${m.model}` : 'AI 识别'
  return '规则解析'
}
</script>

<template>
  <!-- 桌面端悬浮球（移动端由底部导航的 AI 入口替代） -->
  <button
    v-if="canWrite && !open"
    class="ai-fab"
    type="button"
    title="AI 记账助手"
    aria-label="AI 记账助手"
    @click="open = true"
  >
    <span class="ai-fab-ico">🤖</span>
  </button>

  <section v-if="open" class="ai-panel" aria-label="AI 记账助手">
    <header class="ai-head">
      <span class="ai-head-avatar">🤖</span>
      <div class="ai-head-meta">
        <b>AI 记账助手</b>
        <span>{{ hint }}</span>
      </div>
      <router-link v-if="!session.aiUsable" class="ai-cfg" to="/settings?tab=ai">去配置</router-link>
      <button class="ai-icon-btn" type="button" title="清空对话" aria-label="清空对话" @click="clearAll">🗑️</button>
      <button class="ai-icon-btn" type="button" title="收起" aria-label="收起" @click="open = false">✕</button>
    </header>

    <div ref="box" class="ai-msgs">
      <div v-if="!msgs.length" class="ai-bubble bot">
        你好，我是记账小助手 👋<br />直接说消费就能记账，比如：<em>午饭 35 元</em>、<em>昨天打车 26.5</em>；也可以发账单截图，我自动识别入库。
      </div>
      <template v-for="(m, i) in msgs" :key="i">
        <div v-if="m.role === 'user'" class="ai-bubble user">
          <span v-if="m.text">{{ m.text }}</span>
          <img v-for="(src, k) in m.imgs || []" :key="k" :src="src" alt="" class="ai-bubble-img" />
        </div>
        <div v-else class="ai-bubble bot" :class="{ error: !!m.warn }">
          <template v-if="m.warn === 'cfg'">
            {{ m.text }} <router-link to="/settings?tab=ai">去配置 →</router-link>
          </template>
          <template v-else-if="m.items?.length">
            <div v-for="(it, k) in m.items" :key="k" class="ai-record">
              <span class="ico">{{ it.kind === 'income' ? '💰' : '💸' }}</span>
              <div class="m">
                <b>{{ itemTitle(it) }}</b>
                <span>{{ [it.category_path || '未分类', it.account_name_resolved, it.txn_date].filter(Boolean).join(' · ') }}</span>
              </div>
              <span class="amt" :class="it.kind === 'income' ? 'income' : 'expense'">
                {{ it.kind === 'income' ? '+' : '−' }}{{ fmtCents(it.amount_cents) }}
              </span>
            </div>
            <div class="ai-meta">
              <span>已记 {{ m.created ?? m.items.length }} 笔</span>
              <span>·</span>
              <span>{{ engineTag(m) }}</span>
              <span>·</span>
              <a @click="goTransactions">查看明细 →</a>
            </div>
            <div v-if="m.warn" class="ai-warn">⚠ {{ m.warn }}</div>
          </template>
          <template v-else>{{ m.text }}</template>
        </div>
      </template>
      <div v-if="busy" class="ai-bubble bot"><span class="ai-typing"><i></i><i></i><i></i></span></div>
    </div>

    <div v-if="pending.length" class="ai-thumbs">
      <div v-for="(p, i) in pending" :key="i" class="t">
        <img :src="p.dataUrl" alt="" />
        <button type="button" title="移除" @click="removePending(i)">✕</button>
      </div>
    </div>

    <footer class="ai-inputbar">
      <button class="ai-icon-btn" type="button" title="添加截图" aria-label="添加截图" @click="($refs.aiFile as HTMLInputElement).click()">📎</button>
      <textarea
        v-model="text"
        rows="1"
        placeholder="例如：午饭 35 元，打车 26.5"
        @keydown.enter.exact.prevent="send"
      />
      <button class="ai-send" type="button" title="发送" aria-label="发送" :disabled="busy" @click="send">➤</button>
      <input ref="aiFile" type="file" accept="image/*" multiple hidden @change="onPick" />
    </footer>
  </section>
</template>

<style scoped>
/* 悬浮球：旧版 .ai-fab，桌面端可见 */
.ai-fab {
  position: fixed; right: 22px; bottom: 22px; z-index: 70;
  width: 54px; height: 54px; border-radius: 50%; border: 0; cursor: pointer;
  background: linear-gradient(140deg, #5b86ff, #3d6df5 55%, #2b56d9); color: #fff;
  box-shadow: 0 10px 26px -8px rgba(61, 109, 245, .8), inset 0 1px 0 rgba(255, 255, 255, .25);
  display: grid; place-items: center; transition: transform .18s, box-shadow .18s;
}
.ai-fab:hover { transform: translateY(-2px) scale(1.05); }
.ai-fab:active { transform: scale(.95); }
.ai-fab-ico { font-size: 24px; line-height: 1; }

/* 面板：旧版 .ai-panel */
.ai-panel {
  position: fixed; right: 22px; bottom: 88px; z-index: 70;
  width: 376px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);
  background: var(--hl-card, #fff); border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 18px; box-shadow: 0 12px 32px rgba(15, 22, 36, .16);
  display: flex; flex-direction: column; overflow: hidden;
  animation: aiPop .2s ease;
}
@keyframes aiPop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.ai-head {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 12px; border-bottom: 1px solid var(--hl-border, #e6eaf1);
  background: var(--hl-card-2, #f7f8fb);
}
.ai-head-avatar {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  display: grid; place-items: center; font-size: 16px;
  background: linear-gradient(140deg, #5b86ff, #3d6df5);
}
.ai-head-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.ai-head-meta b { font-size: 13.5px; }
.ai-head-meta span { font-size: 11px; color: var(--hl-text-3, #8a93a3); }
.ai-cfg {
  font-size: 11.5px; text-decoration: none; color: var(--hl-primary, #3d6df5);
  padding: 3px 8px; border: 1px solid var(--hl-border, #e6eaf1); border-radius: 6px;
}
.ai-icon-btn {
  background: transparent; border: 0; cursor: pointer; font-size: 14px;
  padding: 4px 5px; border-radius: 6px; line-height: 1;
}
.ai-icon-btn:hover { background: var(--hl-card-2, #f7f8fb); }

.ai-msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.ai-bubble {
  max-width: 86%; padding: 9px 11px; border-radius: 12px;
  font-size: 13px; line-height: 1.55; word-break: break-word;
}
.ai-bubble.bot {
  align-self: flex-start; background: var(--hl-card-2, #f7f8fb);
  border: 1px solid var(--hl-border, #e6eaf1); border-top-left-radius: 4px;
}
.ai-bubble.user {
  align-self: flex-end; background: var(--hl-primary-2, #e8efff);
  color: var(--hl-primary-deep, #2b56d9); border-top-right-radius: 4px;
}
.ai-bubble.error { border-color: #f4c4c4; background: #fdf1f1; color: #a3261e; }
.ai-bubble em { font-style: normal; font-weight: 600; }
.ai-bubble a { color: var(--hl-primary, #3d6df5); cursor: pointer; }
.ai-bubble-img { max-width: 120px; border-radius: 8px; margin-top: 6px; display: block; }

.ai-record { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.ai-record + .ai-record { border-top: 1px dashed var(--hl-border, #e6eaf1); }
.ai-record .ico { font-size: 15px; }
.ai-record .m { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.ai-record .m b { font-size: 12.5px; }
.ai-record .m span { font-size: 10.5px; color: var(--hl-text-3, #8a93a3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-record .amt { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ai-record .amt.income { color: var(--hl-income, #177d4d); }
.ai-record .amt.expense { color: var(--hl-expense, #e5484d); }
.ai-meta {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  margin-top: 7px; padding-top: 6px; font-size: 10.5px;
  color: var(--hl-text-3, #8a93a3); border-top: 1px solid var(--hl-border, #e6eaf1);
}
.ai-meta a { color: var(--hl-primary, #3d6df5); cursor: pointer; }
.ai-warn { margin-top: 6px; font-size: 11px; color: #a3261e; }

.ai-typing { display: inline-flex; gap: 3px; align-items: center; height: 14px; }
.ai-typing i {
  width: 5px; height: 5px; border-radius: 50%; background: var(--hl-text-3, #8a93a3);
  animation: aiBlink 1.2s infinite;
}
.ai-typing i:nth-child(2) { animation-delay: .18s; }
.ai-typing i:nth-child(3) { animation-delay: .36s; }
@keyframes aiBlink { 0%, 60%, 100% { opacity: .28; } 30% { opacity: 1; } }

.ai-thumbs { display: flex; gap: 6px; padding: 0 12px 8px; flex-wrap: wrap; }
.ai-thumbs .t { position: relative; }
.ai-thumbs img { width: 42px; height: 42px; object-fit: cover; border-radius: 7px; border: 1px solid var(--hl-border, #e6eaf1); display: block; }
.ai-thumbs button {
  position: absolute; top: -5px; right: -5px;
  width: 17px; height: 17px; border-radius: 50%; border: 0; cursor: pointer;
  background: #e5484d; color: #fff; font-size: 10px; line-height: 1;
}

.ai-inputbar {
  display: flex; align-items: flex-end; gap: 7px;
  padding: 9px 10px; border-top: 1px solid var(--hl-border, #e6eaf1);
  background: var(--hl-card-2, #f7f8fb);
}
.ai-inputbar textarea {
  flex: 1; resize: none; border: 1px solid var(--hl-border, #e6eaf1); border-radius: 9px;
  padding: 7px 9px; font: inherit; font-size: 13px; line-height: 1.4;
  background: var(--hl-card, #fff); color: var(--hl-text, #17202e);
  max-height: 110px;
}
.ai-send {
  width: 32px; height: 32px; border-radius: 9px; border: 0; cursor: pointer; flex-shrink: 0;
  background: var(--hl-primary, #3d6df5); color: #fff; font-size: 13px;
}
.ai-send:disabled { opacity: .5; cursor: not-allowed; }

@media (max-width: 768px) {
  /* 移动端隐藏悬浮球，由底部导航 AI 入口进入独立页 */
  .ai-fab { display: none; }
}
@media (max-width: 900px) {
  .ai-panel { right: 12px; bottom: 140px; height: min(480px, calc(100vh - 170px)); }
}
</style>
