<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect, NInputNumber,
  NSwitch, NSpin, NTabs, NTabPane, NAlert, NDivider, NDataTable, useMessage,
  NAvatar, NRadioGroup, NRadio, type DataTableColumns, NCode, NPopconfirm, NTag as NTagRaw,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import { AdminApi, AiApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const tab = ref<string>((route.query.tab as string) || 'profile')
const loading = ref(true)
const data = ref<any>(null)

watch(() => route.query.tab, (v) => { if (v) tab.value = String(v) })
watch(tab, (v) => { router.replace({ query: { ...route.query, tab: v } }) })

// --- profile form ---
const profileForm = ref({
  username: '',
  display_name: '',
  email: '',
  avatar_color: '#3d6df5',
})

// --- password form ---
const passwordForm = ref({
  old_password: '',
  new_password: '',
  new_password2: '',
})
const changingPwd = ref(false)

// --- theme ---
const theme = ref<'light' | 'dark'>('light')

// --- site form ---
const siteForm = ref({
  'site.name': '',
  'site.currency': 'CNY',
  'site.allow_register': false,
  'security.login_max_fail': 10,
})

// --- AI form ---
const aiForm = ref({
  enabled: false,
  vision: false,
  auto_save: false,
  base_url: '',
  api_key: '',
  model: '',
  timeout_ms: 90000,
})
const aiTesting = ref(false)
const aiTestResult = ref<{ ok: boolean; msg: string } | null>(null)
const aiModelSearch = ref('')
const aiModelOptions = ref<{ label: string; value: string }[]>([])
const aiModelSearching = ref(false)

// --- API tokens ---
const newToken = ref<{ name: string; token: string } | null>(null)
const tokenName = ref('')
const creatingToken = ref(false)

// --- Backup ---
const restoreInput = ref<HTMLInputElement | null>(null)
function pickRestore() { restoreInput.value?.click() }
function downloadDbBackup() { window.open('/api/v1/admin/backup/db?download=1', '_blank') }
async function onRestoreFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  if (!confirm('确定覆盖当前数据库？')) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await AdminApi.restore(String(reader.result))
      success('已恢复，请重新登录')
    } catch (err: any) {
      toastError(err?.message || '恢复失败')
    }
  }
  reader.readAsDataURL(f)
}
async function runSchedulerNow() {
  try {
    await AdminApi.runScheduler()
    success('已执行')
    load()
  } catch (e: any) {
    toastError(e?.message || '失败')
  }
}

async function load() {
  loading.value = true
  try {
    const d = await AdminApi.settings()
    data.value = d
    profileForm.value.username = d.user?.username || ''
    profileForm.value.display_name = d.user?.display_name || ''
    profileForm.value.email = d.user?.email || ''
    profileForm.value.avatar_color = d.user?.avatar_color || '#3d6df5'
    theme.value = d.user?.theme || 'light'
    siteForm.value['site.name'] = d.settings?.['site.name'] || '家账簿'
    siteForm.value['site.currency'] = d.settings?.['site.currency'] || 'CNY'
    siteForm.value['site.allow_register'] = d.settings?.['site.allow_register'] === 'true'
    siteForm.value['security.login_max_fail'] = Number(d.settings?.['security.login_max_fail'] || 10)
    const cfg = d.cfg || {}
    aiForm.value = {
      enabled: cfg.enabled !== false,
      vision: cfg.vision !== false,
      auto_save: !!cfg.autoSave,
      base_url: cfg.baseUrl || '',
      api_key: cfg.apiKey || '',
      model: cfg.model || '',
      timeout_ms: cfg.timeoutMs || 90000,
    }
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

// --- profile save ---
const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    await AdminApi.updateProfile(profileForm.value)
    success('已更新')
    await session.refresh()
  } catch (e: any) { toastError(e?.response?.data?.error || e?.message || '保存失败') }
  finally { savingProfile.value = false }
}

// --- avatar upload ---
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
  } catch (e: any) { toastError(e?.response?.data?.error || '清除失败') }
}

// --- password ---
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
    success(r?.message || '密码已修改')
    passwordForm.value = { old_password: '', new_password: '', new_password2: '' }
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '修改失败')
  } finally {
    changingPwd.value = false
  }
}

// --- theme ---
async function setTheme(mode: 'light' | 'dark') {
  theme.value = mode
  session.setTheme(mode)
  try {
    await AdminApi.setTheme(mode)
  } catch (e) { /* ignore */ }
}

// --- site ---
const savingSite = ref(false)
async function saveSite() {
  if (!session.user?.isAdmin) { message.warning('需要管理员权限'); return }
  savingSite.value = true
  try {
    await AdminApi.updateSite(siteForm.value)
    success('已保存')
    load()
  } catch (e: any) { toastError(e?.response?.data?.error || '保存失败') }
  finally { savingSite.value = false }
}

// --- AI ---
const savingAI = ref(false)
async function saveAI() {
  if (!session.user?.isAdmin) { message.warning('需要管理员权限'); return }
  savingAI.value = true
  try {
    await AdminApi.updateAi(aiForm.value)
    success('已保存')
  } catch (e: any) { toastError(e?.response?.data?.error || '保存失败') }
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
    aiModelOptions.value = (r.models || []).map((m: any) => ({ label: m.id || m.name, value: m.id || m.name }))
    success(`找到 ${aiModelOptions.value.length} 个模型`)
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '获取模型失败')
  } finally {
    aiModelSearching.value = false
  }
}

// --- API tokens ---
const tokenColumns = computed<DataTableColumns>(() => [
  { title: '名称', key: 'name' },
  { title: '尾号', key: 'token_tail', width: 100, render: (t: any) => h(NCode, { code: t.token_tail || '', style: 'background: transparent; padding: 0' }, { default: () => t.token_tail || '' }) },
  { title: '最后使用', key: 'last_used_at', width: 160, render: (t: any) => t.last_used_at || '—' },
  { title: '创建时间', key: 'created_at', width: 160 },
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

const auditColumns = computed<DataTableColumns>(() => [
  { title: '时间', key: 'created_at', width: 160 },
  { title: '操作人', key: 'display_name', width: 100 },
  { title: '动作', key: 'action', width: 200, render: (a: any) => h(NTag, { type: 'default', size: 'small', bordered: false }, { default: () => a.action }) },
  { title: '详情', key: 'detail', ellipsis: true },
])

const userColumns = computed<DataTableColumns>(() => [
  { title: '用户名', key: 'username' },
  { title: '显示名', key: 'display_name' },
  { title: '邮箱', key: 'email', render: (u: any) => u.email || '-' },
  { title: '账本数', key: 'ledger_count', width: 80, align: 'right' },
  { title: '交易数', key: 'txn_count', width: 100, align: 'right' },
  { title: '管理员', key: 'is_admin', width: 80, render: (u: any) => u.is_admin ? '✅' : '—' },
])
</script>

<template>
  <AppShell>
    <PageHead title="设置" sub="个人资料、AI、站点、安全、API 令牌、备份、审计">
      <template #actions>
        <NSpin v-if="loading" size="small" />
        <NButton @click="load">刷新</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <NCard :bordered="true" size="small" class="tabs-card">
        <NTabs v-model:value="tab" type="line" animated>
          <NTabPane name="profile" tab="个人资料" />
          <NTabPane name="security" tab="安全" />
          <NTabPane name="theme" tab="主题外观" />
          <NTabPane v-if="data?.isAdmin" name="ai" tab="AI 设置" />
          <NTabPane v-if="data?.isAdmin" name="site" tab="站点" />
          <NTabPane name="tokens" tab="API 令牌" />
          <NTabPane v-if="data?.isAdmin" name="users" tab="用户管理" />
          <NTabPane v-if="data?.isAdmin" name="backup" tab="备份" />
          <NTabPane v-if="data?.isAdmin" name="audit" tab="审计日志" />
          <NTabPane name="about" tab="系统信息" />
        </NTabs>
      </NCard>

      <!-- ===== Profile ===== -->
      <NCard v-if="tab === 'profile'" :bordered="true" class="tab-card">
        <NForm label-placement="left" label-width="100" :model="profileForm">
          <NFormItem label="头像">
            <NSpace align="center">
              <NAvatar round :size="56" :src="data?.user?.avatar_path ? `/uploads/avatars/${data.user.avatar_path}?v=${data.user.avatar_ver || 1}` : undefined" :color="profileForm.avatar_color">
                {{ (session.user?.displayName || '?').slice(0, 1) }}
              </NAvatar>
              <NButton size="small" @click="pickAvatar">上传新头像</NButton>
              <NButton v-if="data?.user?.avatar_path" size="small" quaternary @click="clearAvatar">清除</NButton>
              <input ref="avatarInput" type="file" accept="image/*" style="display: none" @change="onAvatarFile" />
            </NSpace>
          </NFormItem>
          <NFormItem label="显示名" required>
            <NInput v-model:value="profileForm.display_name" maxlength="30" />
          </NFormItem>
          <NFormItem label="用户名">
            <NInput v-model:value="profileForm.username" maxlength="24" />
            <NText depth="3" class="hint">&nbsp;仅支持字母、数字、_ - . 组合</NText>
          </NFormItem>
          <NFormItem label="邮箱">
            <NInput v-model:value="profileForm.email" placeholder="可选" />
          </NFormItem>
          <NFormItem label="头像颜色">
            <NInput v-model:value="profileForm.avatar_color" placeholder="#3d6df5" style="width: 120px" />
          </NFormItem>
          <NSpace justify="end">
            <NButton type="primary" :loading="savingProfile" @click="saveProfile">保存</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <!-- ===== Security ===== -->
      <NCard v-if="tab === 'security'" :bordered="true" class="tab-card" title="修改密码">
        <NForm label-placement="left" label-width="100" :model="passwordForm">
          <NFormItem label="当前密码">
            <NInput v-model:value="passwordForm.old_password" type="password" show-password-on="click" />
          </NFormItem>
          <NFormItem label="新密码">
            <NInput v-model:value="passwordForm.new_password" type="password" show-password-on="click" />
          </NFormItem>
          <NFormItem label="确认新密码">
            <NInput v-model:value="passwordForm.new_password2" type="password" show-password-on="click" />
          </NFormItem>
          <NAlert type="warning" :show-icon="true" style="margin-bottom: 12px">
            修改密码后其他设备会强制退出登录。
          </NAlert>
          <NSpace justify="end">
            <NButton type="primary" :loading="changingPwd" @click="changePassword">修改密码</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <!-- ===== Theme ===== -->
      <NCard v-if="tab === 'theme'" :bordered="true" class="tab-card" title="主题外观">
        <NText depth="3" class="hint" style="margin-bottom: 12px; display: block">选择你偏好的界面主题，会立即切换并保存</NText>
        <NRadioGroup :value="theme" @update:value="(v: 'light' | 'dark') => setTheme(v)">
          <NSpace size="large">
            <NRadio value="light">☀️ 亮色</NRadio>
            <NRadio value="dark">🌙 暗色</NRadio>
          </NSpace>
        </NRadioGroup>
      </NCard>

      <!-- ===== AI ===== -->
      <NCard v-if="tab === 'ai'" :bordered="true" class="tab-card" title="AI 设置">
        <NAlert v-if="!data?.aiReady" type="info" :show-icon="true" style="margin-bottom: 12px">
          AI 助手默认使用 OpenAI 兼容 API（如 OpenAI / DeepSeek / 通义千问）。填好 Base URL 和 API Key 即可。
        </NAlert>
        <NForm label-placement="left" label-width="100" :model="aiForm">
          <NFormItem label="启用">
            <NSwitch v-model:value="aiForm.enabled" />
          </NFormItem>
          <NFormItem label="识图">
            <NSwitch v-model:value="aiForm.vision" />
            <NText depth="3" class="hint">&nbsp;关闭后只能处理纯文本/JSON 输入</NText>
          </NFormItem>
          <NFormItem label="自动入库">
            <NSwitch v-model:value="aiForm.auto_save" />
            <NText depth="3" class="hint">&nbsp;识别后自动写入账本（默认仅写入草稿）</NText>
          </NFormItem>
          <NFormItem label="Base URL">
            <NInput v-model:value="aiForm.base_url" placeholder="如 https://api.openai.com/v1" />
          </NFormItem>
          <NFormItem label="API Key">
            <NInput v-model:value="aiForm.api_key" type="password" show-password-on="click" placeholder="sk-..." />
          </NFormItem>
          <NFormItem label="模型">
            <NSpace :wrap="true">
              <NInput v-model:value="aiForm.model" placeholder="如 gpt-4o-mini" style="width: 240px" />
              <NButton @click="listAiModels" :loading="aiModelSearching">拉取模型列表</NButton>
              <NSelect
                v-if="aiModelOptions.length"
                :options="aiModelOptions"
                placeholder="选择预设"
                filterable
                style="width: 200px"
                @update:value="(v: string) => aiForm.model = v"
              />
            </NSpace>
          </NFormItem>
          <NFormItem label="超时（毫秒）">
            <NInputNumber v-model:value="aiForm.timeout_ms" :min="10000" :max="600000" :step="5000" style="width: 200px" />
          </NFormItem>
          <NAlert v-if="aiTestResult" :type="aiTestResult.ok ? 'success' : 'error'" :show-icon="true" style="margin: 12px 0">
            {{ aiTestResult.msg }}
          </NAlert>
          <NSpace>
            <NButton @click="testAI" :loading="aiTesting">测试连接</NButton>
            <NButton type="primary" :loading="savingAI" @click="saveAI">保存</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <!-- ===== Site ===== -->
      <NCard v-if="tab === 'site'" :bordered="true" class="tab-card" title="站点设置">
        <NForm label-placement="left" label-width="120" :model="siteForm">
          <NFormItem label="站点名">
            <NInput v-model:value="siteForm['site.name']" maxlength="20" />
          </NFormItem>
          <NFormItem label="默认币种">
            <NInput v-model:value="siteForm['site.currency']" maxlength="8" />
          </NFormItem>
          <NFormItem label="开放注册">
            <NSwitch v-model:value="siteForm['site.allow_register']" />
            <NText depth="3" class="hint">&nbsp;关闭后只能邀请加入</NText>
          </NFormItem>
          <NFormItem label="登录失败上限">
            <NInputNumber v-model:value="siteForm['security.login_max_fail']" :min="3" :max="100" />
          </NFormItem>
          <NSpace justify="end">
            <NButton type="primary" :loading="savingSite" @click="saveSite">保存</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <!-- ===== Tokens ===== -->
      <NCard v-if="tab === 'tokens'" :bordered="true" class="tab-card" title="API 令牌">
        <NText depth="3" class="hint" style="display: block; margin-bottom: 12px">
          API 令牌用于通过 <code>/api/open/*</code> 接口从外部系统读取家账簿数据。<strong>只显示一次</strong>，请妥善保管。
        </NText>
        <NForm label-placement="left" label-width="80" :show-feedback="false" :model="{ name: tokenName }" style="margin-bottom: 12px">
          <NFormItem label="名称">
            <NSpace>
              <NInput v-model:value="tokenName" placeholder="如：手机 App" maxlength="30" style="width: 200px" />
              <NButton type="primary" :loading="creatingToken" @click="createToken">创建</NButton>
            </NSpace>
          </NFormItem>
        </NForm>
        <NAlert v-if="newToken" type="success" :show-icon="true" style="margin-bottom: 12px">
          <div><strong>新令牌「{{ newToken.name }}」已生成</strong></div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px">
            <code style="flex: 1; background: #fff; padding: 6px 8px; border-radius: 4px; word-break: break-all; font-size: 12px">{{ newToken.token }}</code>
            <NButton size="small" @click="copyToClipboard(newToken.token)">复制</NButton>
          </div>
          <NText depth="3" style="display: block; margin-top: 6px">⚠️ 关掉这个提示后就再也看不到完整令牌了</NText>
        </NAlert>
        <NDataTable :columns="tokenColumns" :data="data?.apiTokens || []" :pagination="false" size="small" />
      </NCard>

      <!-- ===== Users (admin) ===== -->
      <NCard v-if="tab === 'users' && data?.isAdmin" :bordered="true" class="tab-card" title="用户管理">
        <NText depth="3" class="hint" style="display: block; margin-bottom: 12px">系统所有用户。{{ data?.admin?.stats?.users }} 用户 / {{ data?.admin?.stats?.ledgers }} 账本 / {{ data?.admin?.stats?.txns }} 交易</NText>
        <NDataTable :columns="userColumns" :data="data?.admin?.users || []" :pagination="false" size="small" />
      </NCard>

      <!-- ===== Backup (admin) ===== -->
      <NCard v-if="tab === 'backup' && data?.isAdmin" :bordered="true" class="tab-card" title="备份与恢复">
        <NText depth="3" class="hint" style="display: block; margin-bottom: 12px">
          数据库大小：<strong>{{ Math.round((data?.admin?.stats?.dbSize || 0) / 1024) }} KB</strong>　附件：<strong>{{ Math.round((data?.admin?.stats?.uploadsSize || 0) / 1024 / 1024) }} MB</strong>
        </NText>
        <NSpace>
          <NButton type="primary" @click="downloadDbBackup">下载数据库备份</NButton>
          <NPopconfirm positive-text="立即运行" negative-text="取消" @positive-click="runSchedulerNow">
            <template #trigger><NButton ghost>立即运行定时任务</NButton></template>
            立即执行预算/订阅/周期/借贷检测？可能生成通知或自动入账。
          </NPopconfirm>
        </NSpace>
        <NDivider />
        <NAlert type="warning" :show-icon="true" style="margin-bottom: 12px">
          <strong>恢复备份</strong> 会覆盖当前数据库，谨慎操作！
        </NAlert>
        <NButton @click="pickRestore">选择 .db 文件恢复</NButton>
        <input ref="restoreInput" type="file" accept=".db" style="display: none" @change="onRestoreFile" />
      </NCard>

      <!-- ===== Audit (admin) ===== -->
      <NCard v-if="tab === 'audit' && data?.isAdmin" :bordered="true" class="tab-card" title="审计日志">
        <NText depth="3" class="hint" style="display: block; margin-bottom: 12px">最近 60 条操作记录</NText>
        <NDataTable :columns="auditColumns" :data="data?.admin?.audits || []" :pagination="{ pageSize: 15 }" size="small" :max-height="500" />
      </NCard>

      <!-- ===== About ===== -->
      <NCard v-if="tab === 'about'" :bordered="true" class="tab-card" title="系统信息">
        <NGrid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
          <NGridItem>
            <div class="info"><span class="lbl">Node.js</span><span class="val">{{ data?.envInfo?.node }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">平台</span><span class="val">{{ data?.envInfo?.platform }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">进程 PID</span><span class="val">{{ data?.envInfo?.pid }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">内存</span><span class="val">{{ data?.envInfo?.mem }} MB</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">时区</span><span class="val">{{ data?.envInfo?.tz }}</span></div>
          </NGridItem>
          <NGridItem>
            <div class="info"><span class="lbl">运行时长</span><span class="val">{{ data?.envInfo?.uptime }} 秒</span></div>
          </NGridItem>
          <NGridItem span="2">
            <div class="info"><span class="lbl">数据目录</span><code class="val">{{ data?.envInfo?.dataDir }}</code></div>
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
.info { padding: 6px 0; }
.info .lbl { display: inline-block; min-width: 80px; color: var(--hl-muted); font-size: 12px; }
.info .val { font-size: 13px; }
</style>
