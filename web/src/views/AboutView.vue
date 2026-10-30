<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NSpin, NGrid, NGridItem,
  NDescriptions, NDescriptionsItem, NProgress, NAlert, NDivider,
  NCollapse, NCollapseItem, NPopconfirm,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import { AboutApi, AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const runningJobs = ref(false)
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
    data.value = await AboutApi.about()
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
})

const app = computed(() => data.value?.app || {})
const upstream = computed(() => data.value?.upstream || {})
const features = computed(() => data.value?.features || [])
const changelog = computed(() => data.value?.changelog || [])
const tech = computed(() => data.value?.tech || [])
const issuesUrl = computed(() => data.value?.issuesUrl || null)
const stat = computed(() => data.value?.stats || {})
const env = computed(() => data.value?.envInfo || {})

/** 老版口径：数据库与附件分别占多少（进度条按各自对总容量的占比） */
const totalBytes = computed(() => Number(stat.value.dataSize || 0))
const dbBytes = computed(() => Number(stat.value.dbSize || 0))
const uploadsBytes = computed(() => Number(stat.value.uploadsSize || 0))
const dbPercent = computed(() => (totalBytes.value ? Math.round((dbBytes.value / totalBytes.value) * 100) : 0))
const uploadsPercent = computed(() => (totalBytes.value ? Math.round((uploadsBytes.value / totalBytes.value) * 100) : 0))

function fmtBytes(n: number) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB'
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

/** 老版口径：X 小时 Y 分钟（新版原先直接显示秒数，不可读） */
function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h} 小时 ${m} 分钟`
}

/** 版本日志：默认全部收起，点击版本号展开（对齐老版 about.ejs 的 details 行为） */
const expandedVersions = ref<string[]>([])

async function runSchedulerNow() {
  runningJobs.value = true
  try {
    const r = await AdminApi.runScheduler()
    // 后端用 api.ok 返回，提示语在 data.message 里
    success(r?.data?.message || '已执行')
  } catch (e: any) {
    toastError(e?.message || '失败')
  } finally {
    runningJobs.value = false
  }
}

async function clearAllCaches() {
  localStorage.clear()
  sessionStorage.clear()
  success('已清空，请刷新页面')
}

function reloadPage() {
  location.reload()
}
</script>

<template>
  <AppShell>
    <PageHead title="关于" :sub="`家账簿 HomeLedger · v${data?.version || '2.0.0'} 重构版（Vue 3 + Naive UI）`" />

    <NSpin :show="loading">
      <!-- 品牌头 -->
      <NCard :bordered="true" class="card brand-card">
        <div class="hero">
          <div class="logo">📒</div>
          <div class="hero-main">
            <div class="hero-row">
              <h1 class="title">{{ app.name || '家账簿 HomeLedger' }}</h1>
              <NTag :bordered="false" type="primary">v{{ data?.version || '2.0.0' }}</NTag>
              <NTag v-for="c in changelog.filter((x: any) => x.tag)" :key="c.version" :bordered="false">
                {{ c.tag }}
              </NTag>
            </div>
            <NText depth="3">{{ app.slogan || '为家庭打造的轻量自托管记账系统' }}</NText>
            <NText depth="3" class="hero-desc">
              {{ app.description || '数据 100% 存放在你自己的设备上，支持文字与截图 AI 自动记账、订阅扣费管理、预算与储蓄目标、开放 API 对接。' }}
            </NText>
          </div>
        </div>

        <NDivider style="margin: 16px 0" />

        <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.txns || 0 }}</div>
              <div class="lbl">📒 记录笔数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.ledgers || 0 }}</div>
              <div class="lbl">📚 账本数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.days || 1 }}</div>
              <div class="lbl">📅 陪伴天数</div>
            </div>
          </NGridItem>
          <NGridItem span="4 m:1 l:1">
            <div class="stat">
              <div class="num">{{ stat.sizeLabel || '0 B' }}</div>
              <div class="lbl">💾 数据体积</div>
            </div>
          </NGridItem>
        </NGrid>
      </NCard>

      <!-- 功能亮点 -->
      <NCard :bordered="true" class="card" title="✨ 功能亮点">
        <NGrid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem v-for="f in features" :key="f.title" span="4 m:2 l:1">
            <div class="feature">
              <div class="ico">{{ f.ico }}</div>
              <div>
                <b>{{ f.title }}</b>
                <NText depth="3" class="feature-desc">{{ f.desc }}</NText>
              </div>
            </div>
          </NGridItem>
        </NGrid>
      </NCard>

      <!-- 提需求 / 报 Bug -->
      <NCard :bordered="true" class="card" title="💡 提功能需求 / 报 Bug">
        <div class="feedback">
          <div class="feedback-text">
            <NText depth="2">在使用中遇到不顺手的地方、发现 Bug，或者想到新功能，欢迎到本仓库提 Issue：</NText>
            <ul class="small muted feedback-list">
              <li>标题一句话说清需求，例如「支持周期转账的备注模板」</li>
              <li>正文写清楚使用场景和期望效果，越具体越容易被排期</li>
              <li>
                Bug 反馈请附上操作步骤（无需截图敏感数据）；源仓库的原始问题请前往
                <a :href="upstream.url" target="_blank" rel="noopener">{{ upstream.name }}</a> 反馈
              </li>
            </ul>
          </div>
          <div class="feedback-action">
            <NButton v-if="issuesUrl" type="primary" tag="a" :href="issuesUrl" target="_blank" rel="noopener">
              🐙 去 GitHub 提需求 / 报 Bug
            </NButton>
            <NButton v-else disabled title="管理员尚未配置仓库地址">🐙 去 GitHub 提需求 / 报 Bug</NButton>
            <NText v-if="!issuesUrl" depth="3" class="tiny">
              仓库地址暂未配置：在后端 src/lib/about.js 的 GITHUB_REPO 中填入仓库地址即可开启。
            </NText>
          </div>
        </div>
      </NCard>

      <!-- 版本日志 -->
      <NCard :bordered="true" class="card" title="🕘 版本日志">
        <NText depth="3" class="tiny block">点击版本号展开 / 收起</NText>
        <NCollapse v-model:expanded-names="expandedVersions">
          <NCollapseItem v-for="c in changelog" :key="c.version" :name="c.version">
            <template #header>
              <NSpace size="small" align="center" :wrap="false">
                <b>v{{ c.version }}</b>
                <NText depth="3" class="tiny">{{ c.date }}</NText>
                <NTag v-if="c.tag" :bordered="false" type="primary" size="small">{{ c.tag }}</NTag>
                <NText depth="3" class="tiny">{{ c.items.length }} 项</NText>
              </NSpace>
            </template>
            <ul class="changelog-list">
              <li v-for="(it, i) in c.items" :key="i">{{ it }}</li>
            </ul>
          </NCollapseItem>
        </NCollapse>
      </NCard>

      <!-- 技术栈 + 运行环境 -->
      <div class="two-col">
        <NCard :bordered="true" class="card" title="🧱 技术栈">
          <div class="tech-list">
            <NTag v-for="t in tech" :key="t.name" :bordered="false" size="small">
              <b>{{ t.name }}</b>
              <NText depth="3" class="tiny">{{ t.desc }}</NText>
            </NTag>
          </div>
          <NAlert type="info" :show-icon="true" style="margin-top: 12px" class="small-alert">
            🔒 数据与隐私：所有账目、附件仅存储在本机数据目录（{{ env.dataDir }}），不上传任何第三方服务器；
            AI 功能仅在管理员主动配置模型后按需调用。
          </NAlert>
        </NCard>

        <NCard :bordered="true" class="card" title="⚙️ 运行环境">
          <NDescriptions :column="1" size="small" bordered>
            <NDescriptionsItem label="Node 版本">{{ env.node }}</NDescriptionsItem>
            <NDescriptionsItem label="运行平台">{{ env.platform }}</NDescriptionsItem>
            <NDescriptionsItem label="时区">{{ env.tz }}</NDescriptionsItem>
            <NDescriptionsItem label="本次运行时长">{{ fmtUptime(Number(env.uptime || 0)) }}</NDescriptionsItem>
            <NDescriptionsItem label="数据目录">
              <code class="wrap">{{ env.dataDir }}</code>
            </NDescriptionsItem>
          </NDescriptions>
          <NText depth="3" class="sign">
            由 <b>{{ app.author || 'Panda-995' }}</b> 维护 · {{ app.maintainerNote }}<br>
            原项目：
            <a :href="upstream.url" target="_blank" rel="noopener">{{ upstream.name }}</a>（作者 {{ upstream.author }}） ·
            {{ app.aiNote }}
          </NText>
        </NCard>
      </div>

      <!-- 数据体积 -->
      <NCard :bordered="true" class="card" title="💾 数据体积">
        <NGrid :cols="2" :x-gap="24" responsive="screen" :item-responsive="true">
          <NGridItem span="2 m:1 l:1">
            <div class="lbl">数据库</div>
            <NProgress
              type="line"
              :percentage="dbPercent"
              :height="14"
              :border-radius="4"
              style="margin-top: 4px"
            />
            <NText depth="3" class="tiny">{{ fmtBytes(dbBytes) }}</NText>
          </NGridItem>
          <NGridItem span="2 m:1 l:1">
            <div class="lbl">附件</div>
            <NProgress
              type="line"
              :percentage="uploadsPercent"
              :height="14"
              :border-radius="4"
              style="margin-top: 4px"
            />
            <NText depth="3" class="tiny">{{ fmtBytes(uploadsBytes) }}</NText>
          </NGridItem>
        </NGrid>
        <NText depth="3" class="tiny block" style="margin-top: 10px">
          共 {{ stat.attachments || 0 }} 个附件
          <template v-if="data?.users != null"> · {{ data.users }} 位用户</template>
          · 合计 {{ stat.sizeLabel || '0 B' }}
        </NText>
      </NCard>

      <!-- 后端环境 -->
      <NCard :bordered="true" class="card" title="🛠️ 后端环境">
        <NDescriptions :column="2" size="small" bordered>
          <NDescriptionsItem label="Node.js">{{ env.node }}</NDescriptionsItem>
          <NDescriptionsItem label="平台">{{ env.platform }}</NDescriptionsItem>
          <NDescriptionsItem label="进程 PID">{{ env.pid ?? '—' }}</NDescriptionsItem>
          <NDescriptionsItem label="内存">{{ env.mem ? env.mem + ' MB' : '—' }}</NDescriptionsItem>
          <NDescriptionsItem label="时区">{{ env.tz }}</NDescriptionsItem>
          <NDescriptionsItem label="运行时长">{{ fmtUptime(Number(env.uptime || 0)) }}</NDescriptionsItem>
          <NDescriptionsItem label="数据目录" :span="2">
            <code class="wrap">{{ env.dataDir }}</code>
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 客户端环境 -->
      <NCard :bordered="true" class="card" title="🌐 客户端环境">
        <NDescriptions :column="1" size="small" bordered>
          <NDescriptionsItem label="User-Agent">
            <code class="tiny">{{ clientInfo.ua }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem label="屏幕">{{ clientInfo.screen }}</NDescriptionsItem>
          <NDescriptionsItem label="语言">{{ clientInfo.lang }}</NDescriptionsItem>
          <NDescriptionsItem label="网络">
            {{ clientInfo.online ? '✅ 在线' : '⚠️ 离线' }} · Cookie {{ clientInfo.cookie ? '✅' : '❌' }} ·
            localStorage {{ clientInfo.localStorage ? '✅' : '❌' }}
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 维护操作 -->
      <NCard :bordered="true" class="card" title="🧰 维护操作">
        <NSpace :wrap="true" size="small">
          <!-- 立即执行定时任务需要管理员权限（后端 POST /admin/run-scheduler 要求 requireAdmin） -->
          <NPopconfirm
            v-if="session.user?.isAdmin"
            @positive-click="runSchedulerNow"
            positive-text="执行"
            negative-text="取消"
          >
            <template #trigger>
              <NButton :loading="runningJobs">立即执行定时任务</NButton>
            </template>
            确定立即执行定时任务？将扫描预算/订阅/周期/借贷并可能生成通知。
          </NPopconfirm>
          <NPopconfirm
            @positive-click="clearAllCaches"
            positive-text="清空"
            negative-text="取消"
          >
            <template #trigger>
              <NButton>清空本地缓存</NButton>
            </template>
            清空所有本地缓存（不会影响数据）？
          </NPopconfirm>
          <NButton @click="reloadPage">刷新页面</NButton>
        </NSpace>
      </NCard>

      <!-- 致谢 -->
      <NCard :bordered="true" class="card" title="💝 致谢">
        <NText depth="2" class="thanks">
          本系统基于以下开源项目：
        </NText>
        <ul class="thanks-list">
          <li><strong>Vue 3</strong> + <strong>TypeScript</strong> + <strong>Vite</strong> —— 前端工程</li>
          <li><strong>Naive UI</strong> —— UI 组件库</li>
          <li><strong>Pinia</strong> + <strong>Pinia Persisted State</strong> —— 状态管理</li>
          <li><strong>ECharts</strong> —— 报表图表</li>
          <li><strong>Express 4</strong> —— 后端框架</li>
          <li><strong>node:sqlite</strong> —— 内置 SQLite 驱动，数据自持</li>
        </ul>
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
.hero { display: flex; gap: 16px; align-items: flex-start; }
.hero-main { flex: 1; min-width: 0; }
.hero-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.hero-desc { display: block; font-size: 12px; margin-top: 8px; max-width: 640px; line-height: 1.7; }
.logo {
  width: 56px; height: 56px; border-radius: 15px;
  background: linear-gradient(135deg, #3d6df5, #5a7cff);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; color: #fff;
  box-shadow: 0 4px 12px rgba(61, 109, 245, 0.25);
  flex-shrink: 0;
}
.title { margin: 0; font-size: 20px; font-weight: 600; }

.stat { text-align: center; padding: 8px 0; }
.stat .num { font-size: 22px; font-weight: 600; color: var(--hl-primary, #3d6df5); font-variant-numeric: tabular-nums; }
.stat .lbl { font-size: 12px; color: var(--hl-muted); margin-top: 4px; }

.feature { display: flex; gap: 10px; align-items: flex-start; }
.feature .ico { font-size: 20px; line-height: 1.3; flex-shrink: 0; }
.feature-desc { display: block; font-size: 12px; margin-top: 2px; }

.feedback { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.feedback-text { flex: 1; min-width: 260px; }
.feedback-list { margin: 6px 0 0 18px; padding: 0; font-size: 12px; line-height: 1.8; }
.feedback-action { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }

.block { display: block; margin-bottom: 8px; }
.changelog-list { margin: 6px 0 4px 18px; padding: 0; font-size: 12px; line-height: 1.8; color: var(--hl-muted); }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.two-col > .card { margin-bottom: 12px; }
.tech-list { display: flex; gap: 8px; flex-wrap: wrap; }
.small-alert { font-size: 12px; line-height: 1.7; }
.sign { display: block; margin-top: 14px; border-top: 1px solid var(--hl-border, #e6eaf1); padding-top: 12px; font-size: 12px; line-height: 1.8; }

.lbl { font-size: 12px; color: var(--hl-muted); }
.tiny { font-size: 11px; }
.thanks { line-height: 1.8; }
.thanks-list { margin: 4px 0 0 16px; padding: 0; font-size: 12px; line-height: 1.9; color: var(--hl-muted); }

code { background: var(--hl-card-2, #f7f8fb); padding: 2px 6px; border-radius: 3px; }
code.wrap { word-break: break-all; }

@media (max-width: 768px) {
  .two-col { grid-template-columns: 1fr; }
}
</style>
