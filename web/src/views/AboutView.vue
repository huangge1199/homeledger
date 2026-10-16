<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NSpin, NGrid, NGridItem,
  NDescriptions, NDescriptionsItem, NProgress, NAlert, NDivider,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtAmount } from '@/utils/money'

const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const clientInfo = ref({
  ua: navigator.userAgent,
  screen: `${window.screen.width}x${window.screen.height}`,
  lang: navigator.language,
  online: navigator.onLine,
  cookie: navigator.cookieEnabled,
  localStorage: typeof localStorage !== 'undefined',
})

onMounted(async () => {
  try {
    data.value = await AdminApi.settings()
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
})

const stat = computed(() => data.value?.admin?.stats || {})
const env = computed(() => data.value?.envInfo || {})
const totalDb = computed(() => Math.round((stat.value.dbSize || 0) / 1024))
const totalUploads = computed(() => Math.round((stat.value.uploadsSize || 0) / 1024 / 1024))

function restartScheduler() {
  if (!confirm('确定立即执行定时任务？将扫描预算/订阅/周期/借贷并可能生成通知。')) return
  AdminApi.runScheduler().then(() => {
    alert('已执行')
  }).catch((e) => alert('失败：' + e.message))
}

async function clearAllCaches() {
  if (!confirm('清空所有本地缓存（不会影响数据）？')) return
  localStorage.clear()
  sessionStorage.clear()
  alert('已清空，请刷新页面')
}

function reloadPage() {
  location.reload()
}
</script>

<template>
  <AppShell>
    <PageHead title="关于" sub="家账簿 HomeLedger · v2.0 重构版（Vue 3 + Naive UI）" />

    <NSpin :show="loading">
      <!-- 概览 -->
      <NCard :bordered="true" class="card brand-card">
        <NSpace align="center" size="large" :wrap="false">
          <div class="logo">🏠</div>
          <div>
            <h1 class="title">家账簿 HomeLedger</h1>
            <NText depth="3">自托管的家庭财务 · SQLite 单文件 · Vue 3 + Naive UI 重构</NText>
            <NSpace size="small" style="margin-top: 8px">
              <NTag :bordered="false" type="primary">v2.0</NTag>
              <NTag :bordered="false">Vue 3.5</NTag>
              <NTag :bordered="false">Naive UI 2.40</NTag>
              <NTag :bordered="false">TypeScript 5.5</NTag>
            </NSpace>
          </div>
        </NSpace>
      </NCard>

      <!-- 系统统计 -->
      <NCard :bordered="true" class="card" title="📊 系统统计">
        <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.users || 0 }}</div>
              <div class="lbl">用户数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.ledgers || 0 }}</div>
              <div class="lbl">账本数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.txns || 0 }}</div>
              <div class="lbl">交易数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.attachments || 0 }}</div>
              <div class="lbl">附件数</div>
            </div>
          </NGridItem>
        </NGrid>

        <NDivider style="margin: 16px 0" />

        <div class="disk-row">
          <div>
            <div class="lbl">数据库</div>
            <NProgress
              type="line"
              :percentage="Math.min(100, totalDb / 10)"
              :height="14"
              :border-radius="4"
              style="margin-top: 4px"
            />
            <NText depth="3" style="font-size: 12px">{{ totalDb }} KB</NText>
          </div>
          <div>
            <div class="lbl">附件</div>
            <NProgress
              type="line"
              :percentage="Math.min(100, totalUploads / 10)"
              :height="14"
              :border-radius="4"
              style="margin-top: 4px"
            />
            <NText depth="3" style="font-size: 12px">{{ totalUploads }} MB</NText>
          </div>
        </div>
      </NCard>

      <!-- 后端环境 -->
      <NCard :bordered="true" class="card" title="🛠️ 后端环境">
        <NDescriptions :column="2" size="small" bordered>
          <NDescriptionsItem label="Node.js">{{ env.node }}</NDescriptionsItem>
          <NDescriptionsItem label="平台">{{ env.platform }}</NDescriptionsItem>
          <NDescriptionsItem label="进程 PID">{{ env.pid }}</NDescriptionsItem>
          <NDescriptionsItem label="内存">{{ env.mem }} MB</NDescriptionsItem>
          <NDescriptionsItem label="时区">{{ env.tz }}</NDescriptionsItem>
          <NDescriptionsItem label="运行时长">{{ env.uptime }} 秒</NDescriptionsItem>
          <NDescriptionsItem label="数据目录" :span="2">
            <code>{{ env.dataDir }}</code>
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 客户端环境 -->
      <NCard :bordered="true" class="card" title="🌐 客户端环境">
        <NDescriptions :column="1" size="small" bordered>
          <NDescriptionsItem label="User-Agent">
            <code style="font-size: 12px">{{ clientInfo.ua }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem label="屏幕">{{ clientInfo.screen }}</NDescriptionsItem>
          <NDescriptionsItem label="语言">{{ clientInfo.lang }}</NDescriptionsItem>
          <NDescriptionsItem label="网络">{
            clientInfo.online ? '✅ 在线' : '⚠️ 离线'
          } · Cookie {{
            clientInfo.cookie ? '✅' : '❌'
          }} · localStorage {{
            clientInfo.localStorage ? '✅' : '❌'
          }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 操作 -->
      <NCard :bordered="true" class="card" title="🧰 维护操作">
        <NSpace :wrap="true" size="small">
          <NButton @click="restartScheduler">立即执行定时任务</NButton>
          <NButton @click="clearAllCaches">清空本地缓存</NButton>
          <NButton @click="reloadPage">刷新页面</NButton>
        </NSpace>
      </NCard>

      <!-- 致谢 -->
      <NCard :bordered="true" class="card" title="💝 致谢">
        <NText depth="2" style="line-height: 1.8">
          本系统基于以下开源项目：
          <ul style="margin: 4px 0 0 16px; padding: 0">
            <li><strong>Vue 3</strong> + <strong>TypeScript</strong> + <strong>Vite</strong> —— 前端工程</li>
            <li><strong>Naive UI</strong> —— UI 组件库</li>
            <li><strong>Pinia</strong> + <strong>Pinia Persisted State</strong> —— 状态管理</li>
            <li><strong>ECharts</strong> —— 报表图表</li>
            <li><strong>Express 4</strong> + <strong>better-sqlite3</strong> —— 后端框架</li>
            <li><strong>EJS</strong> —— SSR 模板引擎（v1 之前，已退役）</li>
          </ul>
        </NText>
      </NCard>

      <NAlert type="info" :show-icon="true" style="margin-top: 12px">
        这是一个自托管的家用财务系统，数据完全保存在你自己的设备上。
      </NAlert>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.card { margin-bottom: 12px; }
.brand-card { background: linear-gradient(135deg, rgba(61, 109, 245, 0.05), rgba(61, 109, 245, 0.02)); }
.logo {
  width: 64px; height: 64px; border-radius: 16px;
  background: linear-gradient(135deg, #3d6df5, #5a7cff);
  display: flex; align-items: center; justify-content: center;
  font-size: 36px; color: #fff;
  box-shadow: 0 4px 12px rgba(61, 109, 245, 0.25);
}
.title { margin: 0 0 4px; font-size: 20px; font-weight: 600; }

.stat { text-align: center; padding: 8px 0; }
.stat .num { font-size: 22px; font-weight: 600; color: var(--hl-primary, #3d6df5); font-variant-numeric: tabular-nums; }
.stat .lbl { font-size: 12px; color: var(--hl-muted); margin-top: 4px; }

.disk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.disk-row .lbl { font-size: 12px; color: var(--hl-muted); }

code { background: var(--hl-card-2, #f7f8fb); padding: 2px 6px; border-radius: 3px; }
</style>
