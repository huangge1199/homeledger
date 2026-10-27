<script setup lang="ts">
/**
 * 设置页（对齐老版 settings.ejs 的 6 个 tab）
 *
 * 老版：账号安全 / AI 记账 / 开放 API / 站点设置 / 系统管理 / 运行信息
 * tab 名与老版 hash 锚点保持一致，老链接（/settings#admin）可直接命中。
 * 备份与恢复在老版位于「导出备份」页（export.ejs），不在设置页。
 */
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect, NInputNumber,
  NSwitch, NSpin, NTabs, NTab, NAlert, NDivider, NDataTable, useMessage,
  NAvatar, type DataTableColumns, NPopconfirm,
  NGrid, NGridItem, NCheckbox, NColorPicker,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

/** 老版 hash 锚点 → 新版 tab 名。老版只有 6 个锚点，tab 名与之一一对应 */
const HASH_TAB: Record<string, string> = {
  account: 'account', ai: 'ai', api: 'api', site: 'site', admin: 'admin', env: 'env',
}

const tab = ref<string>((route.query.tab as string) || 'account')
const loading = ref(true)
const data = ref<any>(null)

watch(() => route.query.tab, (v) => { if (v && v !== tab.value) tab.value = String(v) })
watch(tab, (v) => {
  if (route.query.tab !== v) router.replace({ query: { ...route.query, tab: v } })
})

/* ------------------------------- 小工具 ------------------------------- */
const fmtDateTime = (d?: string | null) => (d ? String(d).slice(0, 16) : '—')
const initials = (name?: string | null) => {
  const s = String(name || '').trim()
  if (!s) return '?'
  return /[A-Za-z]/.test(s[0]) ? s.slice(0, 2).toUpperCase() : s.slice(0, 1)
}
const avatarSrc = (u: any) =>
  u?.avatar_path ? `/uploads/avatars/${encodeURIComponent(u.avatar_path)}?v=${Number(u.avatar_ver) || 0}` : undefined

/* --- profile form --- */
const profileForm = ref({
  username: '',
  display_name: '',
  email: '',
  avatar_color: '#3d6df5',
})

/* --- password form --- */
const passwordForm = ref({
  old_password: '',
  new_password: '',
  new_password2: '',
})
const changingPwd = ref(false)

/* --- theme --- */
const theme = ref<'light' | 'dark'>('light')

/* --- site form --- */
const siteForm = ref({
  'site.name': '',
  'site.currency': 'CNY',
  'site.allow_register': false,
  'security.login_max_fail': 10,
})
/** 老版本位币是下拉，只允许这 6 种 */
const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'SGD'].map((c) => ({ label: c, value: c }))

/* --- AI form --- */
const aiForm = ref({
  enabled: false,
  vision: false,
  auto_save: false,
  base_url: '',
  api_key: '',
  model: '',
  timeout_ms: 90000,
  clear_api_key: false,
})
/** 已保存的 Key 是否存在（后端不再下发明文） */
const hasApiKey = ref(false)
const aiTesting = ref(false)
const aiTestResult = ref<{ ok: boolean; msg: string } | null>(null)
const aiModelOptions = ref<{ label: string; value: string }[]>([])
const aiModelSearching = ref(false)

/** 老版 AI 卡的「推荐几个可直接用的接口」清单，点击可一键填入 */
const AI_PRESETS = [
  { name: '智谱 GLM', desc: '有免费视觉模型', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-flash' },
  { name: '阿里通义千问', desc: '', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' },
  { name: 'DeepSeek', desc: '纯文本，无视觉', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'NAS 本地 Ollama', desc: '数据不出局域网', base_url: 'http://你的NAS地址:11434/v1', model: 'qwen2.5vl:7b' },
]
function applyAiPreset(p: typeof AI_PRESETS[number]) {
  aiForm.value.base_url = p.base_url
  aiForm.value.model = p.model
}

/* --- API tokens --- */
const newToken = ref<{ name: string; token: string } | null>(null)
const tokenVisible = ref(false)
const tokenName = ref('')
const creatingToken = ref(false)

/* --- 后台任务 --- */
const runningJobs = ref(false)
async function runSchedulerNow() {
  runningJobs.value = true
  try {
    const r = await AdminApi.runScheduler()
    // 后端用 api.ok 返回，提示语在 data.message 里
    success(r?.data?.message || '已执行')
    load()
  } catch (e: any) {
    toastError(e?.message || '失败')
  } finally {
    runningJobs.value = false
  }
}

/* --- 用户管理 --- */
const resetResult = ref<{ name: string; password: string } | null>(null)

async function load() {
  loading.value = true
  try {
    const d = await AdminApi.settings()
    data.value = d
    const me = d.user || {}
    profileForm.value.username = me.username || ''
    profileForm.value.display_name = me.display_name || ''
    profileForm.value.email = me.email || ''
    profileForm.value.avatar_color = me.avatar_color || '#3d6df5'
    theme.value = me.theme || 'light'
    siteForm.value['site.name'] = d.settings?.['site.name'] || '家账簿'
    siteForm.value['site.currency'] = d.settings?.['site.currency'] || 'CNY'
    siteForm.value['site.allow_register'] = d.settings?.['site.allow_register'] === 'true'
    siteForm.value['security.login_max_fail'] = Number(d.settings?.['security.login_max_fail'] || 10)
    const cfg = d.cfg || {}
    hasApiKey.value = !!cfg.hasApiKey
    aiForm.value = {
      enabled: cfg.enabled !== false,
      vision: cfg.vision !== false,
      auto_save: !!cfg.autoSave,
      base_url: cfg.baseUrl || '',
      // 老版刻意不回填真实 Key / 掩码：留空保存 = 继续用原 Key，要更换直接粘贴新的
      api_key: '',
      model: cfg.model || '',
      timeout_ms: cfg.timeoutMs || 90000,
      clear_api_key: false,
    }
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const h = String(location.hash || '').replace('#', '')
  if (h && HASH_TAB[h]) tab.value = HASH_TAB[h]
  load()
})

/* --- profile save --- */
const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    await AdminApi.updateProfile(profileForm.value)
    success('已更新')
    await session.refresh()
    load()
  } catch (e: any) { toastError(e?.response?.data?.error || e?.message || '保存失败') }
  finally { savingProfile.value = false }
}

/* --- avatar upload --- */
const avatarInput = ref<HTMLInputElement | null>(null)
function pickAvatar() { avatarInput.value?.click() }
async function onAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) { message.warning('头像请小于 2MB'); return }
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await AdminApi.uploadAvatar(String(reader.result))
      success('头像已更新')
      await session.refresh()
      load()
    } catch (err: any) {
      toastError(err?.response?.data?.error || '上传失败')
    }
  }
  reader.readAsDataURL(file)
}
async function clearAvatar() {
  try {
    await AdminApi.clearAvatar()
    success('已清除')
    await session.refresh()
    load()
  } catch (e: any) { toastError(e?.response?.data?.error || '清除失败') }
}

/* --- password --- */
async function changePassword() {
  if (passwordForm.value.new_password.length < 6) { message.warning('新密码至少 6 位'); return }
  if (passwordForm.value.new_password !== passwordForm.value.new_password2) { message.warning('两次输入的新密码不一致'); return }
  changingPwd.value = true
  try {
    const r = await AdminApi.changePassword(
      passwordForm.value.old_password,
      passwordForm.value.new_password,
      passwordForm.value.new_password2,
    )
    success(r?.data?.message || '密码已修改')
    passwordForm.value = { old_password: '', new_password: '', new_password2: '' }
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '修改失败')
  } finally {
    changingPwd.value = false
  }
}

/* --- theme --- */
async function setTheme(mode: 'light' | 'dark') {
  theme.value = mode
  session.setTheme(mode)
  try {
    await AdminApi.setTheme(mode)
  } catch (e) { /* ignore */ }
}

/* --- site --- */
const savingSite = ref(false)
async function saveSite() {
  if (!data.value?.isAdmin) { message.warning('需要管理员权限'); return }
  savingSite.value = true
  try {
    await AdminApi.updateSite(siteForm.value)
    success('已保存')
    load()
  } catch (e: any) { toastError(e?.response?.data?.error || '保存失败') }
  finally { savingSite.value = false }
}

/* --- AI --- */
const savingAI = ref(false)
async function saveAI() {
  if (!data.value?.isAdmin) { message.warning('需要管理员权限'); return }
  savingAI.value = true
  try {
    // 后端按老版表单字段名读取（ai.base_url / ai.model / ai.api_key / ai.enabled ...）
    await AdminApi.updateAi({
      'ai.base_url': aiForm.value.base_url,
      'ai.model': aiForm.value.model,
      'ai.api_key': aiForm.value.api_key,
      'ai.enabled': aiForm.value.enabled,
      'ai.vision': aiForm.value.vision,
      'ai.auto_save': aiForm.value.auto_save,
      'ai.timeout_ms': aiForm.value.timeout_ms,
      clear_api_key: aiForm.value.clear_api_key,
    })
    success('AI 配置已保存')
    load()
  } catch (e: any) { toastError(e?.response?.data?.error || e?.message || '保存失败') }
  finally { savingAI.value = false }
}
async function testAI() {
  aiTesting.value = true
  aiTestResult.value = null
  try {
    await AdminApi.testAi({
      base_url: aiForm.value.base_url,
      model: aiForm.value.model,
      api_key: aiForm.value.api_key,
    })
    aiTestResult.value = { ok: true, msg: '连接成功 ✓' }
  } catch (e: any) {
    aiTestResult.value = { ok: false, msg: e?.response?.data?.error || e?.message || '连接失败' }
  } finally {
    aiTesting.value = false
  }
}
async function listAiModels() {
  aiModelSearching.value = true
  try {
    const r = await AdminApi.listAiModels({
      base_url: aiForm.value.base_url,
      api_key: aiForm.value.api_key,
    })
    // 后端已按命名习惯判断能否读图（vision: true/false/null），能读图的标 ✅
    // 接口返回体为 { ok, data: { baseUrl, count, models } }
    const models = r?.data?.models || []
    aiModelOptions.value = models.map((m: any) => ({
      label: m.vision === true ? `${m.id} ✅` : String(m.id),
      value: String(m.id),
    }))
    success(`找到 ${aiModelOptions.value.length} 个模型`)
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '获取模型失败')
  } finally {
    aiModelSearching.value = false
  }
}

/* --- API tokens --- */
const tokenColumns = computed<DataTableColumns>(() => [
  { title: '名称', key: 'name' },
  { title: '尾号', key: 'token_tail', width: 100, render: (t: any) => h('code', { style: 'font-size: 12px' }, t.token_tail || '') },
  { title: '最近使用', key: 'last_used_at', width: 160, render: (t: any) => (t.last_used_at ? fmtDateTime(t.last_used_at) : '从未使用') },
  { title: '创建时间', key: 'created_at', width: 160, render: (t: any) => fmtDateTime(t.created_at) },
  {
    title: '操作', key: 'op', width: 100,
    render: (t: any) => h(NPopconfirm, { onPositiveClick: () => revokeToken(t), positiveText: '吊销', negativeText: '取消' }, {
      trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, { default: () => '吊销' }),
      default: () => '确定吊销该令牌？',
    }),
  },
])
async function createToken() {
  if (!tokenName.value.trim()) { message.warning('请填写令牌名'); return }
  creatingToken.value = true
  try {
    const r = await fetch('/api/v1/admin/settings/api-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf },
      body: JSON.stringify({ name: tokenName.value }),
      credentials: 'include',
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || '创建失败')
    // 拉明文 token（仅一次性）
    const t = await fetch('/api/v1/admin/settings/api-tokens/new', { credentials: 'include' })
    const tj = await t.json()
    newToken.value = { name: tokenName.value, token: tj.newToken?.token || '' }
    tokenVisible.value = false
    tokenName.value = ''
    load()
  } catch (e: any) { toastError(e?.message || '创建失败') }
  finally { creatingToken.value = false }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    success('已复制')
  } catch {
    message.warning('复制失败')
  }
}
async function revokeToken(t: any) {
  try {
    const r = await fetch(`/api/v1/admin/settings/api-tokens/${t.id}/revoke`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': session.csrf },
      credentials: 'include',
    })
    if (r.ok) { success('已吊销'); load() }
    else toastError('吊销失败')
  } catch (e) { toastError('吊销失败') }
}

/* --- 审计日志 --- */
const auditColumns = computed<DataTableColumns>(() => [
  { title: '时间', key: 'created_at', width: 150, render: (a: any) => fmtDateTime(a.created_at) },
  { title: '用户', key: 'display_name', width: 100, render: (a: any) => a.display_name || '—' },
  { title: '动作', key: 'action', width: 140, render: (a: any) => h(NTag, { type: 'default', size: 'small', bordered: false }, { default: () => a.action_label || a.action || '—' }) },
  { title: '对象', key: 'target', width: 120, render: (a: any) => a.target_label || '—' },
  { title: '详情', key: 'detail', ellipsis: true, render: (a: any) => a.detail_label || a.detail || '' },
  { title: 'IP', key: 'ip', width: 120, render: (a: any) => a.ip || '' },
])

/* --- 用户管理 --- */
const USER_ACTION_LABEL: Record<string, string> = {
  promote: '设为管理员', demote: '取消管理员', disable: '禁用', enable: '启用',
  reset: '重置密码', delete: '删除',
}
async function userAction(u: any, action: string, extra: Record<string, unknown> = {}) {
  try {
    const r = await AdminApi.userAction(Number(u.id), action, extra)
    if (action === 'reset' && r?.data?.newPassword) {
      resetResult.value = { name: u.display_name, password: r.data.newPassword }
    }
    success(`已${USER_ACTION_LABEL[action] || action}：${u.display_name}`)
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '操作失败')
  }
}

const userColumns = computed<DataTableColumns>(() => [
  {
    title: '用户', key: 'display_name',
    render: (u: any) => h(NSpace, { align: 'center', size: 'small', wrap: false }, {
      default: () => [
        h(NAvatar, {
          round: true, size: 26,
          src: avatarSrc(u),
          color: u.avatar_color || '#8c8c8c',
        }, { default: () => initials(u.display_name) }),
        h('div', {}, [
          h('div', { style: 'font-weight:600' }, u.display_name || '—'),
          h('div', { style: 'font-size:11px;color:var(--hl-muted,#7d8aa3)' }, '@' + (u.username || '')),
        ]),
      ],
    }),
  },
  {
    title: '角色', key: 'is_admin', width: 100,
    render: (u: any) => h(NTag, { type: u.is_admin ? 'primary' : 'default', size: 'small', bordered: false },
      { default: () => (u.is_admin ? '管理员' : '普通用户') }),
  },
  { title: '账本 / 记录', key: 'ledger_count', width: 120, render: (u: any) => `${u.ledger_count || 0} 本 / ${u.txn_count || 0} 笔` },
  { title: '最近登录', key: 'last_login_at', width: 150, render: (u: any) => (u.last_login_at ? fmtDateTime(u.last_login_at) : '从未登录') },
  {
    title: '状态', key: 'status', width: 90,
    render: (u: any) => h(NTag, { type: u.status === 'active' ? 'success' : 'error', size: 'small', bordered: false },
      { default: () => (u.status === 'active' ? '正常' : '已禁用') }),
  },
  {
    title: '操作', key: 'op', width: 300,
    render: (u: any) => h(NSpace, { size: 4, wrap: false }, {
      default: () => [
        h(NButton, {
          size: 'tiny', quaternary: true,
          onClick: () => userAction(u, u.is_admin ? 'demote' : 'promote'),
        }, { default: () => (u.is_admin ? '取消管理员' : '设为管理员') }),
        h(NButton, {
          size: 'tiny', quaternary: true,
          onClick: () => userAction(u, u.status === 'active' ? 'disable' : 'enable'),
        }, { default: () => (u.status === 'active' ? '禁用' : '启用') }),
        h(NPopconfirm, {
          positiveText: '重置', negativeText: '取消',
          onPositiveClick: () => userAction(u, 'reset'),
        }, {
          trigger: () => h(NButton, { size: 'tiny', quaternary: true }, { default: () => '重置密码' }),
          default: () => `重置 ${u.display_name} 的密码？`,
        }),
        h(NPopconfirm, {
          positiveText: '删除', negativeText: '取消',
          onPositiveClick: () => userAction(u, 'delete'),
        }, {
          trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, { default: () => '删除' }),
          default: () => `⚠️ 删除用户 ${u.display_name}？其名下账本会转交给其他成员。`,
        }),
      ],
    }),
  },
])

/* --- 运行信息 --- */
const stats = computed(() => data.value?.admin?.stats || {})
const spaceMb = computed(() => ((Number(stats.value.dbSize || 0) + Number(stats.value.uploadsSize || 0)) / 1024 / 1024).toFixed(2))
const dbKb = computed(() => (Number(stats.value.dbSize || 0) / 1024).toFixed(0))
const uploadsMb = computed(() => (Number(stats.value.uploadsSize || 0) / 1024 / 1024).toFixed(2))
const uptimeText = computed(() => {
  const s = Number(data.value?.envInfo?.uptime || 0)
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
})
</script>

<template>
  <AppShell>
    <PageHead title="设置" sub="账号安全、AI 记账、开放 API、站点设置、系统管理、运行信息">
      <template #actions>
        <NSpin v-if="loading" size="small" />
        <NButton @click="load">刷新</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <NCard :bordered="true" size="small" class="tabs-card">
        <!-- 用 NTab 而非 NTabPane：naive-ui 2.45 下自闭合 NTabPane 的标签会渲染为空 -->
        <!-- tab 名与老版 hash 锚点一一对应，老链接（/settings#admin）可直接命中 -->
        <NTabs v-model:value="tab" type="line">
          <NTab name="account" tab="账号安全" />
          <NTab name="ai" tab="AI 记账" />
          <NTab name="api" tab="开放 API" />
          <NTab v-if="data?.isAdmin" name="site" tab="站点设置" />
          <NTab v-if="data?.isAdmin" name="admin" tab="系统管理" />
          <NTab name="env" tab="运行信息" />
        </NTabs>
      </NCard>

      <!-- ===== Account（老版 #account：个人资料 + 外观主题 | 修改密码 + 注册信息） ===== -->
      <NGrid v-if="tab === 'account'" :cols="2" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
        <NGridItem>
          <NCard :bordered="true" class="tab-card" title="个人资料">
            <NForm label-placement="left" label-width="100" :model="profileForm">
              <NFormItem label="头像">
                <NSpace align="center">
                  <NAvatar round :size="52" :src="avatarSrc(data?.user)" :color="profileForm.avatar_color">
                    {{ initials(data?.user?.display_name) }}
                  </NAvatar>
                  <NButton size="small" @click="pickAvatar">换头像</NButton>
                  <NButton v-if="data?.user?.avatar_path" size="small" quaternary @click="clearAvatar">恢复默认</NButton>
                  <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" style="display: none" @change="onAvatarFile" />
                </NSpace>
              </NFormItem>
              <NFormItem label="昵称" required>
                <NInput v-model:value="profileForm.display_name" maxlength="30" />
              </NFormItem>
              <NFormItem label="用户名">
                <NInput v-model:value="profileForm.username" maxlength="24" />
                <NText depth="3" class="hint">&nbsp;2-24 位，字母 / 数字 / _ - . ；修改后需用新用户名重新登录</NText>
              </NFormItem>
              <NFormItem label="邮箱">
                <NInput v-model:value="profileForm.email" placeholder="可选" />
              </NFormItem>
              <NFormItem label="头像颜色">
                <NColorPicker
                  v-model:value="profileForm.avatar_color"
                  :show-alpha="false"
                  :modes="['hex']"
                  style="width: 120px"
                />
                <NText depth="3" class="hint">&nbsp;无自传头像时显示</NText>
              </NFormItem>
              <NSpace justify="end">
                <NButton type="primary" :loading="savingProfile" @click="saveProfile">保存资料</NButton>
              </NSpace>
            </NForm>

            <NDivider />
            <div class="row-between">
              <div>
                <b>外观主题</b>
                <div class="tiny muted">当前：{{ theme === 'dark' ? '深色' : '浅色' }}</div>
              </div>
              <NButton size="small" @click="setTheme(theme === 'dark' ? 'light' : 'dark')">
                切换到{{ theme === 'dark' ? '浅色' : '深色' }}
              </NButton>
            </div>
          </NCard>
        </NGridItem>

        <NGridItem>
          <NCard :bordered="true" class="tab-card" title="修改密码">
            <NForm label-placement="left" label-width="100" :model="passwordForm">
              <NFormItem label="当前密码">
                <NInput v-model:value="passwordForm.old_password" type="password" show-password-on="click" />
              </NFormItem>
              <NFormItem label="新密码">
                <NInput v-model:value="passwordForm.new_password" type="password" show-password-on="click" />
                <NText depth="3" class="hint">&nbsp;至少 6 位，建议字母 + 数字混合</NText>
              </NFormItem>
              <NFormItem label="确认新密码">
                <NInput v-model:value="passwordForm.new_password2" type="password" show-password-on="click" />
              </NFormItem>
              <NSpace justify="end">
                <NButton type="primary" :loading="changingPwd" @click="changePassword">修改密码</NButton>
              </NSpace>
            </NForm>
            <NDivider />
            <div class="info"><span class="lbl">注册时间</span><span class="val">{{ fmtDateTime(data?.user?.created_at) }}</span></div>
            <div class="info"><span class="lbl">上次登录</span><span class="val">{{ fmtDateTime(data?.user?.last_login_at) }}</span></div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- ===== AI ===== -->
      <NCard v-if="tab === 'ai'" :bordered="true" class="tab-card">
        <template #header>
          <NSpace align="center">
            <span>🤖 AI 截图记账</span>
            <NTag :type="data?.aiReady ? 'success' : 'default'" size="small" :bordered="false">
              {{ data?.aiReady ? '已配置' : '未配置' }}
            </NTag>
          </NSpace>
        </template>

        <template v-if="!data?.isAdmin">
          <NAlert type="info" :show-icon="true">
            AI 配置属于系统级设置，只有管理员可以修改。当前模型：<b>{{ data?.cfg?.model || '未配置' }}</b>
          </NAlert>
        </template>

        <template v-else>
          <NAlert type="info" :show-icon="true" style="margin-bottom: 16px">
            <b>推荐几个可直接用的接口（均为 OpenAI 兼容），点击即可填入：</b>
            <div v-for="p in AI_PRESETS" :key="p.name" class="preset">
              <b>{{ p.name }}</b><span v-if="p.desc" class="muted">（{{ p.desc }}）</span>：
              <code>{{ p.base_url }}</code> · 模型 <code>{{ p.model }}</code>
              <NButton size="tiny" quaternary type="primary" @click="applyAiPreset(p)">填入</NButton>
            </div>
          </NAlert>

          <NForm label-placement="left" label-width="110" :model="aiForm">
            <NFormItem label="接口地址" class="ai-stack">
              <NInput v-model:value="aiForm.base_url" placeholder="https://open.bigmodel.cn/api/paas/v4" style="width: 480px" />
              <NText depth="3" class="hint block">末尾不要带 /chat/completions，系统会自动补全</NText>
            </NFormItem>
            <NFormItem label="模型名称" class="ai-stack">
              <NSpace :wrap="true" align="center" class="ai-model-row">
                <NInput v-model:value="aiForm.model" placeholder="glm-4v-flash" style="width: 220px" />
                <NButton :loading="aiModelSearching" @click="listAiModels">获取可用模型</NButton>
                <NSelect
                  v-if="aiModelOptions.length"
                  :options="aiModelOptions"
                  placeholder="选择预设"
                  filterable
                  style="width: 220px"
                  @update:value="(v: string) => aiForm.model = v"
                />
              </NSpace>
              <NText depth="3" class="hint block">
                模型名可自由填写；点「获取可用模型」会向该接口读取全部模型（能读图的会标 ✅），选中即填入上方。
              </NText>
            </NFormItem>
            <NFormItem label="API Key" class="ai-stack">
              <NInput
                v-model:value="aiForm.api_key"
                type="password"
                show-password-on="click"
                autocomplete="new-password"
                :placeholder="hasApiKey ? '已保存 API Key —— 留空即保持不变，要更换请直接粘贴新的' : '粘贴你的 API Key（本地 Ollama / 局域网模型可留空）'"
              />
              <template v-if="hasApiKey">
                <NText depth="3" class="hint block">已保存 Key。此输入框故意不回填，留空保存 = 继续使用原 Key；勾选下方可清除。</NText>
                <NCheckbox v-model:checked="aiForm.clear_api_key" class="block">
                  清除已保存的 API Key（改用本地 / 局域网模型时可勾选）
                </NCheckbox>
              </template>
            </NFormItem>
            <NFormItem label="启用 AI 识别">
              <NSwitch v-model:value="aiForm.enabled" />
            </NFormItem>
            <NFormItem label="模型支持图片">
              <NSwitch v-model:value="aiForm.vision" />
              <NText depth="3" class="hint">&nbsp;关闭后只能处理纯文本 / JSON 输入</NText>
            </NFormItem>
            <NFormItem label="识别后自动入库">
              <NSwitch v-model:value="aiForm.auto_save" />
              <NText depth="3" class="hint">&nbsp;识别后自动写入账本（默认仅写入草稿，不推荐）</NText>
            </NFormItem>
            <NFormItem label="超时时间">
              <NInputNumber v-model:value="aiForm.timeout_ms" :min="10000" :max="600000" :step="5000" style="width: 200px" />
              <NText depth="3" class="hint">&nbsp;本地小模型推理较慢，可设为 180000</NText>
            </NFormItem>
            <NAlert v-if="aiTestResult" :type="aiTestResult.ok ? 'success' : 'error'" :show-icon="true" style="margin: 12px 0">
              {{ aiTestResult.msg }}
            </NAlert>
            <NSpace align="center">
              <NButton type="primary" :loading="savingAI" @click="saveAI">保存配置</NButton>
              <NButton :loading="aiTesting" @click="testAI">测试连接</NButton>
              <RouterLink to="/ai" class="more-link">去试试截图记账 →</RouterLink>
            </NSpace>
          </NForm>
        </template>
      </NCard>

      <!-- ===== Site ===== -->
      <NCard v-if="tab === 'site'" :bordered="true" class="tab-card" title="站点与安全设置">
        <NForm label-placement="left" label-width="120" :model="siteForm">
          <NFormItem label="站点名称">
            <NInput v-model:value="siteForm['site.name']" maxlength="20" />
          </NFormItem>
          <NFormItem label="本位币">
            <NSelect v-model:value="siteForm['site.currency']" :options="CURRENCY_OPTIONS" style="width: 160px" />
          </NFormItem>
          <NFormItem label="登录失败上限">
            <NInputNumber v-model:value="siteForm['security.login_max_fail']" :min="3" :max="50" style="width: 160px" />
            <NText depth="3" class="hint">&nbsp;连续失败达到该次数后账号被锁定</NText>
          </NFormItem>
          <NFormItem label="开放自助注册">
            <NSwitch v-model:value="siteForm['site.allow_register']" />
            <NText depth="3" class="hint">&nbsp;家庭使用建议关闭，改由邀请链接加入</NText>
          </NFormItem>
          <NSpace justify="end">
            <NButton type="primary" :loading="savingSite" @click="saveSite">保存设置</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <!-- ===== API（老版 #api） ===== -->
      <NCard v-if="tab === 'api'" :bordered="true" class="tab-card">
        <template #header>
          <NSpace align="center">
            <span>🔑 开放 API（小龙虾 / 自动化）</span>
            <NTag size="small" :bordered="false">{{ (data?.apiTokens || []).length }} 个令牌</NTag>
          </NSpace>
        </template>

        <NAlert v-if="newToken" type="success" :show-icon="true" style="margin-bottom: 12px">
          <div><b>✅ 令牌「{{ newToken.name }}」已创建</b> —— 明文仅本次展示，请立即复制保存：</div>
          <div class="token-row">
            <code class="token-value">{{ tokenVisible ? newToken.token : '••••••••••••••••••••••••' }}</code>
            <NButton size="small" @click="tokenVisible = !tokenVisible">{{ tokenVisible ? '隐藏' : '显示' }}</NButton>
            <NButton size="small" type="primary" @click="copyToClipboard(newToken.token)">复制令牌</NButton>
          </div>
          <NText depth="3" class="hint block">刷新或离开本页后将无法再次查看（库中只存摘要），届时只能吊销后重新生成。</NText>
        </NAlert>

        <NAlert type="info" :show-icon="true" style="margin-bottom: 12px">
          供<b>小龙虾（OpenClaw / PicoClaw）</b>、<b>Hermes Agent</b>、手机快捷指令等外部工具调用。鉴权方式：请求头带
          <code>Authorization: Bearer &lt;令牌&gt;</code>。令牌明文只在创建时展示一次，库中仅存摘要，请妥善保管。
          <div class="block">
            <b>令牌权限</b>（跟随成员关系，被移出账本或禁用即失效；频控 60 次/分，AI 识别 10 次/分）：
            读取 = 本账本所有成员；写入（交易/转账/借贷/账户/分类/标签/预算/目标/订阅/周期账单）= 可写成员；站点与 AI 设置 = 站点管理员。
            <b>不开放</b>：令牌管理、跨账本访问、读取任何密钥明文。
          </div>
          <div class="block">
            <b>AI 助手接入（自动记账技能）</b>：
            <ul class="skill-list">
              <li><b>Hermes Agent</b>：把仓库 <code>skills/homeledger-bookkeeping/</code> 整个目录复制到 <code>~/.hermes/skills/</code> 下（或放进你的技能仓库），在对话里 <code>/homeledger-bookkeeping</code> 或直接发截图 / 说「午饭 35」即可记账；技能读 <code>HOMELEDGER_URL</code> 与 <code>HOMELEDGER_TOKEN</code> 两个环境变量。</li>
              <li><b>OpenClaw / PicoClaw</b>：把 <code>openclaw-skill/homeledger-bookkeeping/</code> 复制到工作区技能目录，配置方式相同。</li>
            </ul>
          </div>
        </NAlert>

        <NForm label-placement="left" label-width="80" :show-feedback="false" style="margin-bottom: 12px">
          <NFormItem label="名称">
            <NSpace>
              <NInput v-model:value="tokenName" placeholder="令牌名称（如：小龙虾）" maxlength="30" style="width: 220px" />
              <NButton type="primary" :loading="creatingToken" @click="createToken">生成新令牌</NButton>
            </NSpace>
          </NFormItem>
        </NForm>

        <NDataTable v-if="(data?.apiTokens || []).length" :columns="tokenColumns" :data="data?.apiTokens || []" :pagination="false" size="small" />
        <div v-else class="muted tiny">还没有令牌。生成一个，然后在小龙虾技能里填入即可。</div>

        <NDivider />
        <div class="tiny muted mono code-block">
          # 连通测试<br />
          curl http://127.0.0.1:5111/api/open/ping -H "Authorization: Bearer hl_xxxx"<br />
          # 发截图 / 文字自动记账（confirm=true 直接入库）<br />
          curl -X POST http://127.0.0.1:5111/api/open/ai/bill -H "Authorization: Bearer hl_xxxx" \<br />
          &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
          &nbsp;&nbsp;-d '{"images":["data:image/png;base64,…"],"confirm":true}'<br />
          # 直接记一笔<br />
          curl -X POST http://127.0.0.1:5111/api/open/transactions -H "Authorization: Bearer hl_xxxx" \<br />
          &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
          &nbsp;&nbsp;-d '{"type":"expense","amount":88,"category":"餐饮","account":"微信零钱","merchant":"肯德基","note":"晚餐"}'
        </div>
      </NCard>

      <!-- ===== Admin（老版 #admin：统计卡 + 用户管理 + 后台任务 + 审计日志） ===== -->
      <div v-if="tab === 'admin' && data?.isAdmin">
        <div class="stat-grid">
          <div class="stat"><div class="label">用户</div><div class="value">{{ stats.users }}</div></div>
          <div class="stat"><div class="label">账本</div><div class="value">{{ stats.ledgers }}</div></div>
          <div class="stat"><div class="label">记账总数</div><div class="value">{{ stats.txns }}</div></div>
          <div class="stat"><div class="label">账单截图</div><div class="value">{{ stats.attachments }}</div></div>
          <div class="stat">
            <div class="label">占用空间</div>
            <div class="value sm">{{ spaceMb }} MB</div>
            <div class="delta">数据库 {{ dbKb }} KB · 附件 {{ uploadsMb }} MB</div>
          </div>
        </div>

        <NCard :bordered="true" class="tab-card">
          <template #header>
            <NSpace align="center">
              <span>🛠️ 用户管理</span>
              <NText depth="3" class="hint">共 {{ (data?.admin?.users || []).length }} 个账号</NText>
            </NSpace>
          </template>

          <NAlert v-if="resetResult" type="warning" :show-icon="true" style="margin-bottom: 12px">
            已重置 <b>{{ resetResult.name }}</b> 的密码为：<code class="mono">{{ resetResult.password }}</code>
            <div class="tiny">其所有登录已失效，请转告本人后尽快修改。</div>
          </NAlert>

          <NDataTable :columns="userColumns" :data="data?.admin?.users || []" :pagination="false" size="small" />
        </NCard>

        <NCard :bordered="true" class="tab-card" title="⏱️ 后台任务">
          <p class="small muted" style="margin: 0 0 12px">
            系统每 30 分钟自动检查一次：生成到期的周期账单、检查预算是否超支、提醒即将到期的借贷与储蓄目标。
            重启服务后也会立即补跑一次。你也可以手动触发：
          </p>
          <NButton type="primary" :loading="runningJobs" @click="runSchedulerNow">立即执行一次检查</NButton>
        </NCard>

        <NCard :bordered="true" class="tab-card" title="📜 操作审计日志">
          <NText depth="3" class="hint" style="display: block; margin-bottom: 12px">最近 60 条</NText>
          <NDataTable
            :columns="auditColumns"
            :data="data?.admin?.audits || []"
            :pagination="{ pageSize: 15 }"
            size="small"
            :max-height="500"
          />
        </NCard>
      </div>

      <!-- ===== Env（老版 #env） ===== -->
      <NCard v-if="tab === 'env'" :bordered="true" class="tab-card" title="运行信息">
        <NGrid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem>
            <div class="info"><span class="lbl">Node 版本</span><span class="val">{{ data?.envInfo?.node }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">运行平台</span><span class="val">{{ data?.envInfo?.platform }}</span></div>
          </NGridItem>
          <NGridItem v-if="data?.isAdmin">
            <div class="info"><span class="lbl">进程 PID</span><span class="val">{{ data?.envInfo?.pid }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">时区</span><span class="val">{{ data?.envInfo?.tz }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">已运行</span><span class="val">{{ uptimeText }}</span></div>
          </NGridItem>
          <NGridItem v-if="data?.isAdmin">
            <div class="info"><span class="lbl">内存占用</span><span class="val">{{ data?.envInfo?.mem }} MB</span></div>
          </NGridItem>
          <NGridItem span="2">
            <div class="info"><span class="lbl">数据目录</span><code class="val">{{ data?.envInfo?.dataDir }}</code></div>
          </NGridItem>
          <NGridItem span="2">
            <div class="info"><span class="lbl">数据库大小</span><span class="val">{{ ((data?.envInfo?.dbSize || 0) / 1024).toFixed(1) }} KB</span></div>
          </NGridItem>
          <NGridItem span="2">
            <div class="info"><span class="lbl">数据库文件</span><code class="val">homeledger.db</code></div>
          </NGridItem>
          <NGridItem span="2">
            <div class="info">
              <span class="lbl">备份方式</span>
              <span class="val">复制 data 目录即可（<RouterLink to="/export">导出备份</RouterLink><template v-if="data?.isAdmin"> 或 <a href="/api/v1/admin/backup/db?download=1" target="_blank" rel="noopener">下载数据库备份</a></template>）</span>
            </div>
          </NGridItem>
        </NGrid>
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.tabs-card { margin-bottom: 12px; }
.tab-card { margin-bottom: 12px; }
.hint { font-size: 12px; }
/* NFormItem 的 blank 容器是 display:flex，提示语要独占一行必须撑满 100% 宽 */
.hint.block { display: block; width: 100%; margin-top: 6px; }

/* AI 表单：输入框与其下方的提示语各占一行（naive 的 blank 默认是横向 flex） */
.ai-stack :deep(.n-form-item-blank) {
  flex-direction: column;
  align-items: flex-start;
}
.ai-stack :deep(.n-form-item-blank > .n-input) { max-width: 100%; }
.ai-model-row { width: 100%; }
.muted { color: var(--hl-muted, #7d8aa3); }
.tiny { font-size: 11.5px; }
.info { padding: 6px 0; }
.info .lbl { display: inline-block; min-width: 80px; color: var(--hl-muted); font-size: 12px; }
.info .val { font-size: 13px; }

/* 个人资料卡底部：外观主题切换行 */
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

/* AI 推荐接口 */
.preset { margin-top: 4px; line-height: 1.8; }
.preset code { background: rgba(0,0,0,.05); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }
.preset .n-button { margin-left: 4px; }

/* API 令牌 */
.token-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.token-value {
  flex: 1; min-width: 260px; padding: 8px 12px;
  background: rgba(0,0,0,.04); border-radius: 6px;
  word-break: break-all; font-size: 12.5px;
}
.code-block { line-height: 1.9; }
.skill-list { margin: 4px 0 0; padding-left: 18px; line-height: 1.9; }
.skill-list code { background: rgba(0,0,0,.05); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }

/* 统计卡 */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
.stat {
  border: 1px solid var(--hl-border, #e6eaf1); border-radius: 11px;
  background: var(--hl-card, #fff); padding: 12px 14px;
}
.stat .label { font-size: 12px; color: var(--hl-muted, #7d8aa3); }
.stat .value { font-size: 22px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stat .value.sm { font-size: 18px; }
.stat .delta { font-size: 11.5px; color: var(--hl-muted, #7d8aa3); margin-top: 4px; }
</style>
