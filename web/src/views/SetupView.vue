<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NText, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const message = useMessage()

const username = ref('')
const displayName = ref('')
const siteName = ref('家账簿')
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const errorText = ref('')
const allowed = ref(true)

onMounted(async () => {
  // 已初始化则跳登录
  if (!session.loaded) {
    try { await session.refresh() } catch { /* ignore */ }
  }
  if (session.isAuthed) {
    router.replace('/')
    return
  }
  if (!session.needsSetup) {
    // 已经创建过账号
    allowed.value = false
    setTimeout(() => router.replace('/login'), 1500)
    return
  }
  // 老版失败回填：后端 SSR 分支 redirect 带 ?u=&d=&s=（JSON 分支下前端字段本就不会丢，
  // 这里兜底 SSR 分支 —— 浏览器跟随 redirect 重新加载页面后回填）
  const u = route.query.u as string
  const d = route.query.d as string
  const s = route.query.s as string
  if (u) username.value = u
  if (d) displayName.value = d
  if (s) siteName.value = s
})

function getCsrf(): string {
  return session.csrf
    || (document.querySelector('meta[name="csrf"]') as HTMLMetaElement | null)?.content || ''
}

async function onSubmit() {
  errorText.value = ''
  if (!/^[A-Za-z0-9_@.\-]{3,32}$/.test(username.value)) {
    errorText.value = '用户名需 3-32 位，仅支持字母、数字、下划线、点、@ 和短横线'
    return
  }
  if (password.value.length < 8) {
    errorText.value = '管理员密码至少 8 位，建议包含字母与数字'
    return
  }
  if (password.value !== password2.value) {
    errorText.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const body = new URLSearchParams()
    body.set('username', username.value)
    body.set('password', password.value)
    body.set('password2', password2.value)
    body.set('display_name', displayName.value || username.value)
    body.set('site_name', siteName.value || '家账簿')
    body.set('_csrf', getCsrf())
    const res = await api.post('/setup', body, {
      baseURL: '/',
      maxRedirects: 0,
      // 后端 JSON 分支失败时返 400/409/500，也要进成功路径由下面的 ok 字段统一处理
      validateStatus: (s) => s >= 200 && s < 500,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    })
    // 后端 JSON 分支：{ ok: true } 或 { ok: false, error }
    const j = res.data
    if (j && typeof j.ok === 'boolean') {
      if (!j.ok) {
        errorText.value = j.error || '初始化失败'
        return
      }
    } else if (res.status === 302) {
      // SSR 兜底：hasUser 时后端 redirect /login
      errorText.value = '系统已存在管理员账号，请直接登录。'
      return
    }
    // 校验会话真的建立（对齐 G2-A3：不能只看 HTTP 状态）
    await session.refresh()
    if (!session.isAuthed) {
      errorText.value = '初始化异常，请尝试手动登录'
      return
    }
    message.success('初始化完成，正在进入...')
    router.replace('/')
  } catch (e: any) {
    errorText.value = e?.response?.data?.error || e?.message || '初始化失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BlankLayout title="初始化" width="480px">
    <div class="setup">
      <h1 class="title">初始化你的账本</h1>
      <NText depth="3" class="sub">这是第一次启动，请创建管理员账号</NText>

      <NAlert v-if="!allowed" type="info" :show-icon="true" class="alert">
        系统已存在管理员账号，正在跳转到登录页…
      </NAlert>

      <NAlert v-if="errorText" type="error" :show-icon="true" class="alert">
        {{ errorText }}
      </NAlert>

      <NForm class="form" @submit.prevent="onSubmit">
        <NFormItem label="站点名称">
          <NInput v-model:value="siteName" placeholder="如：家账簿" size="large" :maxlength="20" />
        </NFormItem>
        <NFormItem label="管理员用户名">
          <NInput
            v-model:value="username"
            placeholder="3-32 位字母 / 数字 / _"
            size="large"
            :input-props="{ autocomplete: 'username' }"
            @keydown.enter="onSubmit"
          />
        </NFormItem>
        <NFormItem label="昵称">
          <NInput
            v-model:value="displayName"
            placeholder="例如：老王"
            size="large"
          />
        </NFormItem>
        <NFormItem label="管理员密码">
          <NInput
            v-model:value="password"
            type="password"
            placeholder="至少 8 位"
            size="large"
            show-password-on="click"
            :input-props="{ autocomplete: 'new-password' }"
            @keydown.enter="onSubmit"
          />
          <NText depth="3" class="help">至少 8 位，建议同时包含字母与数字</NText>
        </NFormItem>
        <NFormItem label="确认密码">
          <NInput
            v-model:value="password2"
            type="password"
            placeholder="再次输入密码"
            size="large"
            show-password-on="click"
            :input-props="{ autocomplete: 'new-password' }"
            @keydown.enter="onSubmit"
          />
        </NFormItem>
        <NButton
          type="primary"
          block
          size="large"
          :loading="loading"
          :disabled="!allowed"
          @click="onSubmit"
        >
          创 建 并 进 入
        </NButton>
      </NForm>
    </div>
  </BlankLayout>
</template>

<style scoped>
.setup { width: 100%; }
.title { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
.sub { font-size: 13px; display: block; margin-bottom: 16px; }
.alert { margin: 12px 0; }
.form { margin-top: 16px; }
.help { font-size: 12px; margin-top: 4px; display: block; width: 100%; }
</style>
