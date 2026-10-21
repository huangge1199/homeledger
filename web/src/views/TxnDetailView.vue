<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NText, NTag, NSpin, NPopconfirm, NDivider, NImage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import Empty from '@/components/Empty.vue'
import { TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()

const txnId = computed(() => Number(route.params.id))
const loading = ref(true)
const notFound = ref(false)
const txn = ref<any>(null)
const attachments = ref<any[]>([])
const splits = ref<any[]>([])

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const d = await TransactionsApi.get(txnId.value)
    txn.value = d.txn
    attachments.value = d.attachments || []
    splits.value = d.splits || []
  } catch (e) {
    notFound.value = true
    txn.value = null
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(txnId, load)

/* ============================== 展示派生 ============================== */

/** 类型图标 + 名称（转账无分类语义） */
const headIcon = computed(() => txn.value?.category_icon || txn.value?.type_icon || '·')
const headTitle = computed(() => {
  const t = txn.value
  if (!t) return ''
  return t.type === 'transfer' ? '转账' : (t.category_name || t.type_label)
})

/** 金额带符号：支出取负（老版详情弹窗 is_income 加 +、is_expense 加 −，库中金额恒为正） */
const signedCents = computed(() => {
  const t = txn.value
  if (!t) return 0
  const cents = Number(t.amount_cents || 0)
  if (t.type === 'adjust') return cents
  if (t.is_expense) return -Math.abs(cents)
  if (t.is_income) return Math.abs(cents)
  return cents
})
const amountTone = computed(() => {
  const t = txn.value
  if (!t || t.type === 'adjust') return 'neutral'
  return t.is_expense ? 'expense' : t.is_income ? 'income' : 'neutral'
})

/** 账户：转账/投资类显示双边 */
const accountText = computed(() => {
  const t = txn.value
  if (!t) return ''
  if (t.type === 'transfer' || t.type === 'invest_buy' || t.type === 'invest_sell') {
    return `${t.account_name || '—'} → ${t.to_account_name || '—'}`
  }
  return t.account_name || '未指定账户'
})

/** 标签：后端 tag_names 是空格分隔字符串 */
const tagList = computed(() => {
  const s = txn.value?.tag_names
  if (!s) return [] as string[]
  return String(s).split(/[,，\s]+/).filter(Boolean)
})

/** 来源中文映射（老版 app.js TXN_SOURCE_LABEL） */
const SOURCE_LABEL: Record<string, string> = {
  manual: '手动',
  ai_screenshot: 'AI 截图',
  ai_text: 'AI 文本',
  import: '导入',
  recurring: '周期账单',
  subscription: '订阅',
}
const sourceText = computed(() => {
  const s = txn.value?.source
  if (!s) return '手动'
  return SOURCE_LABEL[s] || s
})

/** 日期（含消费时刻） */
const dateText = computed(() => {
  const t = txn.value
  if (!t) return ''
  const d = String(t.txn_date || '')
  return t.txn_time ? `${d} ${t.txn_time}` : d
})

const statusText = computed(() => (txn.value?.status === 'pending' ? '待确认' : '已确认'))

function fmtDateTime(s?: string) {
  if (!s) return '—'
  return dayjs(s).format('YYYY-MM-DD HH:mm:ss')
}
function fmtSize(n?: number) {
  return `${Math.round((n || 0) / 1024)} KB`
}

/* ============================== 操作 ============================== */

const canWrite = computed(() => session.canWrite)

async function onDelete() {
  try {
    await TransactionsApi.remove(txnId.value)
    success('已删除')
    router.replace('/transactions')
  } catch (e) {
    toastError(errorMessage(e, '删除失败'))
  }
}
</script>

<template>
  <AppShell>
    <PageHead title="记录详情" sub="查看完整记录、附件、分账">
      <template #actions>
        <NSpace size="small" :wrap="true">
          <NButton size="small" quaternary @click="router.back()">返回</NButton>
          <template v-if="canWrite">
            <NButton size="small" @click="router.push(`/transactions/${txnId}/edit`)">编辑</NButton>
            <NPopconfirm positive-text="删除" negative-text="取消" @positive-click="onDelete">
              <template #trigger>
                <NButton size="small" type="error" ghost>删除</NButton>
              </template>
              确定要删除这笔记录吗？
            </NPopconfirm>
          </template>
        </NSpace>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && notFound"
        icon="🗒️"
        title="记录不存在"
        description="这笔记录可能已被删除"
      />

      <div v-else-if="txn" class="detail">
        <!-- 头部：图标 + 名称 + 金额 -->
        <NCard :bordered="true" class="head-card">
          <div class="head">
            <div class="ico" :style="{ background: txn.category_color ? `${txn.category_color}18` : 'var(--hl-card-2, #f7f8fb)' }">
              {{ headIcon }}
            </div>
            <div class="head-main">
              <div class="head-title">{{ headTitle }}</div>
              <div class="head-sub">{{ txn.type_label }} · {{ dateText }}</div>
            </div>
            <div class="head-amt">
              <AmountDisplay :cents="signedCents" :sign="txn.type !== 'adjust'" :tone="amountTone" />
              <NText v-if="txn.currency && txn.currency !== 'CNY'" depth="3" class="cur">{{ txn.currency }}</NText>
            </div>
          </div>
        </NCard>

        <!-- 详细信息 -->
        <NCard :bordered="true" class="info-card">
          <div class="kv"><span class="k">日期</span><span class="v mono">{{ dateText }}</span></div>
          <div class="kv"><span class="k">类型</span><span class="v">{{ txn.type_icon }} {{ txn.type_label }}</span></div>
          <div v-if="txn.type !== 'transfer'" class="kv">
            <span class="k">分类</span>
            <span class="v">{{ txn.category_path || '—' }}</span>
          </div>
          <div class="kv"><span class="k">账户</span><span class="v">{{ accountText }}</span></div>
          <div v-if="txn.member_name" class="kv"><span class="k">成员</span><span class="v">{{ txn.member_name }}</span></div>
          <div v-if="txn.merchant" class="kv"><span class="k">商家</span><span class="v">{{ txn.merchant }}</span></div>
          <div v-if="txn.note" class="kv"><span class="k">备注</span><span class="v">{{ txn.note }}</span></div>
          <div v-if="tagList.length" class="kv">
            <span class="k">标签</span>
            <span class="v tags">
              <NTag v-for="tg in tagList" :key="tg" size="tiny" :bordered="false" type="primary">{{ tg }}</NTag>
            </span>
          </div>
          <div v-if="txn.currency !== 'CNY'" class="kv">
            <span class="k">原币金额</span>
            <span class="v mono">
              {{ (Number(txn.amount_cents || 0) / 100).toFixed(2) }} {{ txn.currency }}
              × {{ Number(txn.rate) || 1 }}
              ≈ {{ (Number(txn.amount_base_cents || 0) / 100).toFixed(2) }} CNY
            </span>
          </div>
          <div v-if="txn.is_reimbursable" class="kv">
            <span class="k">报销</span>
            <span class="v">
              <NTag size="tiny" :bordered="false" :type="txn.reimbursed_at ? 'success' : 'warning'">
                {{ txn.reimbursed_at ? '已报销' : '待报销' }}
              </NTag>
              <NText v-if="txn.reimbursed_at" depth="3" class="reimb-at">{{ fmtDateTime(txn.reimbursed_at) }}</NText>
            </span>
          </div>
          <div class="kv"><span class="k">状态</span><span class="v">{{ statusText }}</span></div>
          <div class="kv"><span class="k">来源</span><span class="v">{{ sourceText }}</span></div>
          <NDivider style="margin: 6px 0" />
          <div class="kv"><span class="k">创建时间</span><span class="v mono">{{ fmtDateTime(txn.created_at) }}</span></div>
          <div class="kv"><span class="k">最后修改</span><span class="v mono">{{ fmtDateTime(txn.updated_at) }}</span></div>
        </NCard>

        <!-- AA 分账 -->
        <NCard v-if="splits.length" :bordered="true" class="info-card">
          <div class="section-title">👥 AA 分账（{{ splits.length }}）</div>
          <div v-for="sp in splits" :key="sp.id" class="kv">
            <span class="k">{{ sp.member_name || '未命名' }}</span>
            <span class="v">
              <span class="mono">¥{{ (Number(sp.share_cents || 0) / 100).toFixed(2) }}</span>
              <NTag v-if="sp.is_settled" size="tiny" :bordered="false" type="success">已结算</NTag>
              <NTag v-else size="tiny" :bordered="false" type="warning">未结算</NTag>
            </span>
          </div>
        </NCard>

        <!-- 关联账单截图 -->
        <NCard v-if="attachments.length" :bordered="true" class="info-card">
          <div class="section-title">📎 关联账单截图（{{ attachments.length }}）</div>
          <div class="gallery">
            <figure v-for="a in attachments" :key="a.id">
              <NImage
                :src="a.url"
                :alt="a.file_name"
                width="200"
                class="shot"
                object-fit="cover"
                :preview-props="{ showToolbar: true }"
              />
              <figcaption>{{ fmtDateTime(a.created_at) }} · {{ fmtSize(a.size) }}</figcaption>
            </figure>
          </div>
        </NCard>
      </div>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.detail {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 头部：图标 + 名称 + 金额 */
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.head .ico {
  width: 40px; height: 40px; flex: 0 0 40px;
  border-radius: 10px;
  display: grid; place-items: center;
  font-size: 20px;
}
.head-main { flex: 1; min-width: 0; }
.head-title { font-size: 16px; font-weight: 600; }
.head-sub { font-size: 12px; color: var(--hl-muted, #7d8aa3); margin-top: 2px; }
.head-amt {
  display: flex; align-items: baseline; gap: 4px;
  font-size: 22px; font-weight: 700;
  white-space: nowrap;
}
.head-amt .cur { font-size: 12px; font-weight: 400; }

/* 键值信息对（老版 .kv） */
.info-card { padding: 8px 16px 14px; }
.kv {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; padding: 5px 0; font-size: 13px;
}
.kv .k { color: var(--hl-muted, #7d8aa3); flex: 0 0 auto; }
.kv .v { color: var(--hl-text, #17202e); text-align: right; word-break: break-word; }
.kv .v.mono { font-variant-numeric: tabular-nums; font-family: v-mono, SFMono-Regular, Menlo, Consolas, monospace; }
.kv .v.tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.reimb-at { margin-left: 6px; font-size: 12px; }

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }

/* 截图画廊（老版 .gallery） */
.gallery {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;
}
.gallery figure { margin: 0; }
.gallery .shot {
  width: 100%; aspect-ratio: 3 / 4;
  border-radius: 8px; border: 1px solid var(--hl-border, #e6eaf1);
  background: var(--hl-card-2, #f7f8fb);
}
.gallery figcaption {
  margin-top: 5px; font-size: 11px; color: var(--hl-muted, #7d8aa3);
}
</style>
