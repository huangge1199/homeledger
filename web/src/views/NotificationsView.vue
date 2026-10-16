<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NPopconfirm, NSpin, NEmpty, NDivider,
  NBadge, useMessage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { DashboardApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useRouter } from 'vue-router'

const router = useRouter()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const items = ref<any[]>([])
const unreadCount = ref(0)
const filter = ref<'all' | 'unread'>('all')

async function load() {
  loading.value = true
  try {
    const d = await DashboardApi.notifications()
    items.value = d.items || []
    unreadCount.value = d.unreadCount || 0
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filtered = computed(() => filter.value === 'unread' ? items.value.filter((n) => !n.is_read) : items.value)

const kindMeta: Record<string, { icon: string; tone: any; label: string }> = {
  recurring:    { icon: '🔁', tone: 'info',    label: '周期账单' },
  budget:       { icon: '🎯', tone: 'warning', label: '预算' },
  debt:         { icon: '🤝', tone: 'warning', label: '借贷' },
  goal:         { icon: '🎯', tone: 'info',    label: '目标' },
  subscription: { icon: '🔔', tone: 'info',    label: '订阅' },
  warn:         { icon: '⚠️', tone: 'warning', label: '提醒' },
  danger:       { icon: '🚨', tone: 'error',   label: '告警' },
  info:         { icon: 'ℹ️', tone: 'info',    label: '提示' },
  system:       { icon: '🛠️', tone: 'default', label: '系统' },
}

function meta(kind: string) {
  return kindMeta[kind] || { icon: '🔔', tone: 'default', label: '通知' }
}

async function markRead(n: any) {
  if (n.is_read) return
  try {
    await DashboardApi.readNotification(Number(n.id))
    n.is_read = 1
    unreadCount.value = items.value.filter((x) => !x.is_read).length
  } catch (e) { /* ignore */ }
}

async function open(n: any) {
  await markRead(n)
  if (n.link) {
    if (n.link.startsWith('http')) window.open(n.link, '_blank')
    else router.push(n.link)
  }
}

async function markAll() {
  try {
    await DashboardApi.readAllNotifications()
    success('已全部标记为已读')
    load()
  } catch (e) { toastError(errorMessage(e, '操作失败')) }
}

function timeAgo(t: string) {
  if (!t) return ''
  const d = new Date(t.replace(' ', 'T') + (t.includes('Z') ? '' : '+08:00'))
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return d.toISOString().slice(0, 10)
}
</script>

<template>
  <AppShell>
    <PageHead title="通知中心" sub="预算 / 订阅 / 周期 / 目标 / 借贷等提醒">
      <template #actions>
        <NPopconfirm
          v-if="unreadCount"
          @positive-click="markAll"
          positive-text="全部已读"
          negative-text="取消"
        >
          <template #trigger>
            <NButton>全部标记为已读</NButton>
          </template>
          确定将 {{ unreadCount }} 条未读通知全部标记为已读？
        </NPopconfirm>
        <NButton @click="load">刷新</NButton>
      </template>
    </PageHead>

    <NCard :bordered="true" size="small" class="filter-card">
      <NSpace size="small" align="center">
        <NButton :type="filter === 'all' ? 'primary' : 'default'" size="small" @click="filter = 'all'">
          全部 <NTag :bordered="false" size="small" style="margin-left: 4px">{{ items.length }}</NTag>
        </NButton>
        <NButton :type="filter === 'unread' ? 'primary' : 'default'" size="small" @click="filter = 'unread'">
          未读
          <NBadge v-if="unreadCount" :value="unreadCount" :max="99" style="margin-left: 6px" />
        </NButton>
        <NText v-if="filter === 'unread' && unreadCount" depth="3" class="hint">共 {{ unreadCount }} 条未读</NText>
      </NSpace>
    </NCard>

    <NSpin :show="loading">
      <NCard :bordered="true" class="list-card">
        <Empty
          v-if="!loading && !filtered.length"
          icon="🔔"
          :title="filter === 'unread' ? '没有未读通知' : '暂时没有通知'"
          :description="filter === 'unread' ? '所有通知都已被处理' : '系统会在需要时推送通知'"
        />
        <div v-else class="list">
          <div
            v-for="n in filtered"
            :key="n.id"
            class="notif"
            :class="{ unread: !n.is_read }"
            @click="open(n)"
          >
            <div class="ico" :class="`tone-${meta(n.kind).tone}`">{{ meta(n.kind).icon }}</div>
            <div class="body">
              <div class="title-row">
                <span class="title">{{ n.title }}</span>
                <NTag v-if="!n.is_read" type="primary" size="tiny" :bordered="false">未读</NTag>
                <NTag :bordered="false" size="tiny" :type="meta(n.kind).tone">{{ meta(n.kind).label }}</NTag>
                <span v-if="n.ledger_name" class="ledger">{{ n.ledger_name }}</span>
                <span class="time">{{ timeAgo(n.created_at) }}</span>
              </div>
              <NText v-if="n.body" depth="2" class="body-text">{{ n.body }}</NText>
              <NSpace v-if="n.link" size="small" class="link-row">
                <NText depth="3" class="link">→ {{ n.link }}</NText>
              </NSpace>
            </div>
          </div>
        </div>
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.filter-card { margin-bottom: 12px; }
.hint { font-size: 12px; }
.list { display: flex; flex-direction: column; }
.notif {
  display: flex;
  gap: 12px;
  padding: 12px 8px;
  border-bottom: 1px solid var(--hl-border, #e6eaf1);
  cursor: pointer;
  transition: background .15s;
}
.notif:last-child { border-bottom: 0; }
.notif:hover { background: var(--hl-card-2, #f7f8fb); }
.notif.unread { background: rgba(61, 109, 245, 0.04); }
.notif.unread:hover { background: rgba(61, 109, 245, 0.08); }

.ico {
  width: 36px; height: 36px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.ico.tone-info    { background: #e8efff; color: #1677ff; }
.ico.tone-warning { background: #fef3e8; color: #fa8c16; }
.ico.tone-error   { background: #feefef; color: #e5484d; }
.ico.tone-default { background: #f0f1f4; color: #8c8c8c; }

.body { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.title { font-size: 14px; font-weight: 500; }
.ledger { font-size: 11px; color: var(--hl-muted); }
.time { font-size: 11px; color: var(--hl-muted); margin-left: auto; }
.body-text { font-size: 12px; line-height: 1.5; }
.link-row { margin-top: 4px; }
.link { font-size: 11px; }
</style>
