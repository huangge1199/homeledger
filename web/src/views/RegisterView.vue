<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NText, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { register as doRegister } from '@/api/auth'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const message = useMessage()

const username = ref('')
const displayName = ref('')
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const errorText = ref('')
/** 老版 GET /register：未开放自助注册时渲染登录页并提示；这里同样拦截 */
const allowed = ref(true)

onMounted(async () => {
  if (!session.loaded) {
    try { await session.refresh() } catch { /* ignore */ }
  }
  if (session.isAuthed) {
    router.replace('/')
    return
  }
  if (!session.allowRegister) {
    // 对齐老版：未开放注册 → 提示并回登录页（G2 已由 /api/v1/session 下发 allowRegister）
    allowed.value = false
    setTimeout(() => router.replace('/login'), 1500)
    return
  }
  // 老版失败回填：后端 SSR 分支 redirect 带 ?u=&d=（JSON 分支下前端字段本就不会丢，此处兜底）
  const u = route.query.u as string
  const d = route.query.d as string
  if (u) username.value = u
  if (d) displayName.value = d
})

async function onSubmit() {
  errorText.value = ''
  // 老版口径：注册密码至少 6 位（区别于初始化的 8 位）
  if (!/^[A-Za-z0-9_@.\-]{3,32}$/.test(username.value)) {
    errorText.value = '用户名需 3–32 位，仅支持字母、数字、下划线、点、@ 和短横线'
    return
  }
  if (password.value.length < 6) {
    errorText.value = '密码至少 6 位'
    return
  }
  if (password.value !== password2.value) {
    errorText.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const r = await doRegister({
      username: username.value,
      password: password.value,
      display_name: displayName.value || username.value,
    })
    if (!r.ok) {
      errorText.value = r.error || '注册失败'
      return
    }
    // 校验会话真的建立（对齐 G2-A3 / G3-A3：不能只看 HTTP 状态）
    await session.refresh()
    if (!session.isAuthed) {
      errorText.value = '注册异常，请尝试手动登录'
      return
    }
    message.success('注册成功，已为你创建默认账本与账户。')
    router.replace('/')
  } catch (e: any) {
    errorText.value = e?.message || '注册失败'
  } finally {
    loading.value = false
  }
}

function goLogin() { router.push('/login') }
</script>

<template>
  <BlankLayout title="注册">
    <div class="register">
      <NAlert v-if="!allowed" type="info" :show-icon="true" class="alert">
        本站未开放自助注册，请联系管理员邀请你加入账本。正在跳转到登录页…
      </NAlert>

      <template v-else>
        <h1 class="title">创建账号</h1>
        <NText depth="3" class="sub">注册后会自动为你创建一个默认账本</NText>

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
            <NText depth="3" class="help">3–32 位，字母、数字、下划线、点、@ 或短横线</NText>
          </NFormItem>
          <NFormItem label="昵称">
            <NInput
              v-model:value="displayName"
              placeholder="例如：老王"
              size="large"
            />
          </NFormItem>
          <NFormItem label="密码">
            <NInput
              v-model:value="password"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password-on="click"
              :input-props="{ autocomplete: 'new-password' }"
              @keydown.enter="onSubmit"
            />
            <NText depth="3" class="help">至少 6 位</NText>
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
            @click="onSubmit"
          >
            注册并开始记账
          </NButton>
        </NForm>

        <NText depth="3" class="footer">
          已有账号？<a href="javascript:" @click="goLogin">直接登录</a>
        </NText>
      </template>
    </div>
  </BlankLayout>
</template>

<style scoped>
.register { width: 100%; }
.title { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
.sub { font-size: 13px; display: block; margin-bottom: 16px; }
.alert { margin: 12px 0; }
.form { margin-top: 16px; }
.help { font-size: 12px; margin-top: 4px; display: block; width: 100%; }
.footer {
  display: block;
  text-align: center;
  font-size: 12px;
  margin-top: 18px;
}
</style>
