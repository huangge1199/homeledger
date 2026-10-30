<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NCheckbox, NText, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { login as doLogin } from '@/api/auth'
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

onMounted(async () => {
  // 拉一次 /api/v1/session：拿 csrf + 站点信息 + 是否开放注册（该端点未登录也可访问）
  try {
    await session.refresh()
    if (session.isAuthed) return router.replace(next.value)
    if (session.needsSetup) {
      needsSetup.value = true
    }
  } catch { /* ignore */ }
  // 老版登录失败后回填用户名（后端 redirect 时带 ?u=username）
  const u = route.query.u as string
  if (u) username.value = u
})

async function onSubmit() {
  if (!username.value || !password.value) {
    errorText.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const r = await doLogin(username.value, password.value, next.value, remember.value)
    if (!r.ok) {
      errorText.value = r.error || '登录失败'
      return
    }
    // 重新拉一次 session（cookie 已生效）；顺带校验是否真的登录成功 ——
    // 后端 302 到 /login 也算「看起来成功」，但会话其实没建立
    await session.refresh()
    if (!session.isAuthed) {
      errorText.value = '登录失败，请重试'
      return
    }
    message.success('欢迎回来，' + (session.user?.displayName || username.value))
    router.replace(next.value)
  } catch (e: any) {
    errorText.value = e?.message || '登录失败'
  } finally {
    loading.value = false
  }
}

function goSetup() { router.push('/setup') }

/**
 * 「注册一个」入口（老版 login.ejs 底部无条件显示）。
 * 老版由后端 GET /register 判断：未开放注册就回到登录页并提示
 * 「本站未开放自助注册，请联系管理员邀请你加入账本。」；
 * 这里前端做同样判断，避免跳到占位页。
 */
function goRegister() {
  if (!session.allowRegister) {
    errorText.value = '本站未开放自助注册，请联系管理员邀请你加入账本。'
    return
  }
  router.push('/register')
}
</script>

<template>
  <BlankLayout title="登录">
    <div class="login">
      <h1 class="title">欢迎回来</h1>
      <NText depth="3" class="sub">请使用你的账号密码登录</NText>

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
            :input-props="{ autocomplete: 'username', autofocus: true }"
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

      <NText depth="3" class="footer">
        还没有账号？<a href="javascript:" @click="goRegister">注册一个</a>
      </NText>
    </div>
  </BlankLayout>
</template>

<style scoped>
.login {
  width: 100%;
}
.title { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
.sub { font-size: 13px; display: block; margin-bottom: 16px; }
.alert { margin: 12px 0; }
.form { margin-top: 16px; }
.row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.footer {
  display: block;
  text-align: center;
  font-size: 12px;
  margin-top: 18px;
}
</style>
