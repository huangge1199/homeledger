<script setup lang="ts">
/**
 * 账单截图库（对齐老版 attachments.ejs）
 *
 * 老版行为基准：
 *   · 顶部一行：左「共 N 张截图，存放在 data/uploads 目录中」，右「＋ 上传新截图」按钮
 *   · 空态：🖼️「还没有上传过账单截图」+「去体验 AI 截图记账」入口
 *   · 画廊：图片（点击放大）+ 图注（金额 / 商家 / 日期·KB）+「查看记录」「删除」
 *   · 分页：每页 36 张
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { NCard, NButton, NImage, NPopconfirm, NSpin } from 'naive-ui'

import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { AiApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtPlain } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()

/* --------------------------------- 列表 ---------------------------------- */
const page = ref<number>(Number(route.query.page) || 1)
const loading = ref(true)
const list = ref<{ items: any[]; total: number; totalPages: number }>({
  items: [],
  total: 0,
  totalPages: 1,
})

async function load() {
  loading.value = true
  try {
    const d = await AiApi.attachments(page.value)
    list.value = {
      items: d.items || [],
      total: Number(d.total || 0),
      totalPages: Number(d.totalPages || 1),
    }
    // 页码越界（删完最后一条）时回退到有效页
    if (!list.value.items.length && page.value > 1 && list.value.totalPages < page.value) {
      page.value = list.value.totalPages
      return load()
    }
  } catch (e) {
    toastError(errorMessage(e, '加载截图失败'))
  } finally {
    loading.value = false
  }
}

watch(page, (v) => {
  router.replace({ query: { ...route.query, page: v > 1 ? String(v) : undefined } })
  load()
})
watch(() => route.query.page, (v) => {
  const p = Number(v) || 1
  if (p !== page.value) { page.value = p; load() }
})

/* ------------------------------- 分页页码 -------------------------------- */
/** 与账单明细页同款：固定 5 页滑动窗口 */
const pageNumbers = computed<(number | 'gap')[]>(() => {
  const total = list.value.totalPages
  const cur = page.value
  if (total <= 0) return []
  let start = Math.max(1, cur - 2)
  let end = Math.min(total, start + 4)
  start = Math.max(1, end - 4)
  const out: (number | 'gap')[] = []
  if (start > 1) out.push(1, 'gap')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total) out.push('gap', total)
  return out
})

/* --------------------------------- 图注 ---------------------------------- */
/** 老版：有关联金额显示金额；否则规则引擎识别显示「规则解析」，其余显示「未关联记录」 */
function captionTitle(a: any) {
  if (a.amount_cents !== null && a.amount_cents !== undefined) return fmtPlain(a.amount_cents)
  return a.ai_status === 'rule' ? '规则解析' : '未关联记录'
}

function fmtSize(n?: number) {
  return `${Math.round((n || 0) / 1024)} KB`
}

function fmtDate(s?: string) {
  return s ? String(s).slice(0, 10) : '—'
}

/* --------------------------------- 删除 ---------------------------------- */
const deleting = ref<number | null>(null)

async function removeAttachment(a: any) {
  deleting.value = a.id
  try {
    await AiApi.removeAttachment(a.id)
    success('截图已删除')
    load()
  } catch (e) {
    toastError(errorMessage(e, '删除失败'))
  } finally {
    deleting.value = null
  }
}

const canWrite = computed(() => session.canWrite)

onMounted(load)
</script>

<template>
  <AppShell>
    <PageHead title="账单截图" sub="AI 识别过的账单原图都存在这里，可随时回看">
      <template #actions>
        <NButton type="primary" size="small" @click="router.push('/ai')">＋ 上传新截图</NButton>
      </template>
    </PageHead>

    <NCard :bordered="true">
      <div class="card-head">
        <span class="ch-title">
          共 {{ list.total }} 张截图，存放在服务器的 data/uploads 目录中
        </span>
        <span class="muted small">
          <RouterLink to="/ai">＋ 上传新截图</RouterLink>
        </span>
      </div>

      <NSpin :show="loading">
        <Empty
          v-if="!loading && !list.items.length"
          icon="🖼️"
          title="还没有上传过账单截图"
          description="在 AI 截图记账页上传截图后，原图会留存在这里"
        >
          <NButton type="primary" size="small" style="margin-top: 12px" @click="router.push('/ai')">
            去体验 AI 截图记账
          </NButton>
        </Empty>

        <div v-else class="gallery">
          <figure v-for="a in list.items" :key="a.id">
            <NImage
              :src="a.url"
              :alt="a.file_name || '账单截图'"
              width="100%"
              height="132"
              object-fit="cover"
              lazy
              :preview-props="{ showToolbar: true }"
            />
            <figcaption>
              <b>{{ captionTitle(a) }}</b>
              <div class="row-line">{{ a.merchant || '—' }}</div>
              <div class="tiny">{{ fmtDate(a.created_at) }} · {{ fmtSize(a.size) }}</div>
              <div class="ops">
                <RouterLink
                  v-if="a.linked_txn_id"
                  :to="`/transactions/${a.linked_txn_id}`"
                  class="tiny"
                >查看记录</RouterLink>
                <NPopconfirm
                  v-if="canWrite"
                  positive-text="删除"
                  negative-text="取消"
                  @positive-click="removeAttachment(a)"
                >
                  <template #trigger>
                    <NButton size="tiny" quaternary type="error" :loading="deleting === a.id">删除</NButton>
                  </template>
                  删除这张截图？
                </NPopconfirm>
              </div>
            </figcaption>
          </figure>
        </div>
      </NSpin>

      <!-- 分页（与账单明细页同款） -->
      <div v-if="list.totalPages > 1" class="pager">
        <button v-if="page > 1" class="pg" @click="page = page - 1">上一页</button>
        <template v-for="(p, i) in pageNumbers" :key="`${p}-${i}`">
          <span v-if="p === 'gap'" class="gap">…</span>
          <button v-else class="pg" :class="{ cur: p === page }" @click="page = p as number">{{ p }}</button>
        </template>
        <button v-if="page < list.totalPages" class="pg" @click="page = page + 1">下一页</button>
      </div>
    </NCard>
  </AppShell>
</template>

<style scoped>
.muted { color: var(--hl-muted, #7d8aa3); }
.small { font-size: 12.5px; }
.tiny { font-size: 11.5px; }

/* 卡头（老版 .card-head） */
.card-head {
  display: flex; align-items: center; gap: 10px;
  margin: -4px 0 12px; flex-wrap: wrap;
}
.ch-title { font-size: 14px; color: var(--hl-text-2, #45516a); }

/* 画廊（老版 .gallery） */
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
.gallery .row-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gallery .ops {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px; min-height: 22px;
}

/* 分页（与账单明细页同款） */
.pager {
  display: flex; gap: 6px; align-items: center; justify-content: center; flex-wrap: wrap;
  padding: 16px 0 4px; color: var(--hl-text-2, #45516a); font-size: 13px;
}
.pager .pg {
  min-width: 32px; height: 32px; padding: 0 8px;
  display: grid; place-items: center;
  border-radius: 7px;
  border: 1px solid var(--hl-border, #e6eaf1);
  background: var(--hl-card, #fff);
  color: var(--hl-text-2, #45516a);
  font-family: inherit; font-size: 13px; font-variant-numeric: tabular-nums;
  cursor: pointer; transition: border-color .14s, color .14s;
}
.pager .pg:hover { border-color: var(--hl-primary, #3d6df5); color: var(--hl-primary, #3d6df5); }
.pager .pg.cur { background: var(--hl-primary, #3d6df5); border-color: var(--hl-primary, #3d6df5); color: #fff; font-weight: 600; }
.pager .gap {
  min-width: 32px; height: 32px; padding: 0 8px;
  display: grid; place-items: center;
  color: var(--hl-muted, #7d8aa3);
}

@media (max-width: 820px) {
  .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
