<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NCheckbox, NText, NTag, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { login as doLogin } from '@/api/auth'
import { csrfFetch } from '@/api/csrfFetch'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const message = useMessage()

const username = ref('')
const password = ref('')
const remember = ref(false)
const loading = ref(false)
const errorText = ref('')
const needsSetup = ref(false)

const next = computed(() => (route.query.next as string) || '/')
const allowRegister = ref(false)

onMounted(async () => {
  // 拉一次 /api/v1/session 拿 csrf + 站点信息
  try {
    const s = await session.refresh()
    if (session.isAuthed) return router.replace(next.value)
    if (session.needsSetup) {
      needsSetup.value = true
    }
  } catch { /* ignore */ }
  // 检测是否开放注册（站点设置）
  try {
    const r = await csrfFetch('/api/v1/admin/settings')
    if (r.ok) {
      const j = await r.json()
      allowRegister.value = String(j?.data?.settings?.['site.allow_register']) === 'true'
    }
  } catch { /* 401 时 settings 拿不到，忽略 */ }
})

async function onSubmit() {
  if (!username.value || !password.value) {
    errorText.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const r = await doLogin(username.value, password.value, next.value)
    if (r.ok) {
      // 重新拉一次 session（cookie 已生效）
      await session.refresh()
      message.success('欢迎回来，' + (session.user?.displayName || username.value))
      router.replace(next.value)
    } else {
      errorText.value = r.error || '登录失败'
    }
  } catch (e: any) {
    errorText.value = e?.message || '登录失败'
  } finally {
    loading.value = false
  }
}

function goSetup() { router.push('/setup') }
function goRegister() { router.push('/register') }
</script>

<template>
  <BlankLayout title="登录家账簿">
    <div class="login">
      <NCard :bordered="true" class="login-card" size="large">
        <div class="brand">
          <span class="logo">📒</span>
          <span class="name">{{ session.siteName || '家账簿' }}</span>
        </div>
        <NText depth="3" class="sub">登录到你的家账簿</NText>

        <NAlert v-if="needsSetup" type="info" :show-icon="true" class="alert">
          还没创建管理员账号，<a href="javascript:" @click="goSetup">前往初始化</a>
        </NAlert>

        <NAlert v-if="errorText" type="error" :show-icon="true" class="alert">
          {{ errorText }}
        </NAlert>

        <NForm class="form" @submit.prevent="onSubmit">
          <NFormItem label="用户名">
            <NInput
              v-model:value="username"
              placeholder="请输入用户名"
              size="large"
              :input-props="{ autocomplete: 'username' }"
              @keydown.enter="onSubmit"
            />
          </NFormItem>
          <NFormItem label="密码">
            <NInput
              v-model:value="password"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password-on="click"
              :input-props="{ autocomplete: 'current-password' }"
              @keydown.enter="onSubmit"
            />
          </NFormItem>
          <div class="row">
            <NCheckbox v-model:checked="remember">记住我</NCheckbox>
            <NText depth="3" class="hint">
              {{ allowRegister ? '首次使用？' : '' }}
              <a v-if="allowRegister" href="javascript:" @click="goRegister">注册</a>
            </NText>
          </div>
          <NButton
            type="primary"
            block
            size="large"
            :loading="loading"
            @click="onSubmit"
          >
            登 录
          </NButton>
        </NForm>
      </NCard>

      <NText depth="3" class="footer">家账簿 · 自托管个人/家庭记账</NText>
    </div>
  </BlankLayout>
</template>

<style scoped>
.login {
  width: 100%;
  max-width: 420px;
}
.login-card {
  border-radius: 12px;
}
.brand {
  display: flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 600;
  margin-bottom: 4px;
}
.brand .logo { font-size: 22px; }
.sub { font-size: 13px; }
.alert { margin: 12px 0; }
.form { margin-top: 16px; }
.row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.hint { font-size: 12px; }
.footer {
  display: block;
  text-align: center;
  font-size: 12px;
  margin-top: 18px;
}
</style>
