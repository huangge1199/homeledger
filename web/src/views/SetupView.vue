<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NText, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
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
  }
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
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (res.status === 302 || res.status === 200) {
      message.success('初始化完成，正在进入...')
      await session.refresh()
      router.replace('/')
    } else {
      errorText.value = res.data?.error || '初始化失败'
    }
  } catch (e: any) {
    // 解析 HTML 中的错误信息（粗略）
    const html = e?.response?.data
    if (typeof html === 'string' && html.length < 500) errorText.value = html
    else errorText.value = e?.message || '初始化失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BlankLayout title="初始化" width="480px">
    <div class="setup">
      <NText depth="3" class="sub">创建你的第一个管理员账号</NText>

      <NAlert v-if="!allowed" type="info" :show-icon="true" class="alert">
        系统已存在管理员账号，正在跳转到登录页…
      </NAlert>

      <NAlert v-if="errorText" type="error" :show-icon="true" class="alert">
        {{ errorText }}
      </NAlert>

      <NForm class="form" @submit.prevent="onSubmit">
        <NFormItem label="站点名称">
          <NInput v-model:value="siteName" placeholder="如：家账簿" size="large" />
        </NFormItem>
        <NFormItem label="用户名">
          <NInput
            v-model:value="username"
            placeholder="3-32 位字母 / 数字 / _"
            size="large"
            :input-props="{ autocomplete: 'username' }"
            @keydown.enter="onSubmit"
          />
        </NFormItem>
        <NFormItem label="显示名称">
          <NInput
            v-model:value="displayName"
            placeholder="如：张三"
            size="large"
          />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="password"
            type="password"
            placeholder="至少 8 位"
            size="large"
            show-password-on="click"
            :input-props="{ autocomplete: 'new-password' }"
            @keydown.enter="onSubmit"
          />
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
.sub { font-size: 13px; display: block; margin-bottom: 4px; }
.alert { margin: 12px 0; }
.form { margin-top: 16px; }
</style>
