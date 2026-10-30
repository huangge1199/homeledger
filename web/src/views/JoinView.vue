<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NText, NAlert } from 'naive-ui'
import { useMessage } from 'naive-ui'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { joinLedger } from '@/api/auth'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const message = useMessage()

// 邀请码来自路径参数 /join/:token（后端 GET /join/:code 校验后 redirect 到同一路由并带 query）
const code = String(route.params.token || '')
const ledgerName = String(route.query.ledger || '')
const roleLabel = String(route.query.role || '成员')
const creator = String(route.query.creator || '—')
const expires = String(route.query.expires || '')

const errorText = ref(String(route.query.error || ''))
const already = ref(String(route.query.already || '') === '1')
const ready = ref(false)
const loading = ref(false)

onMounted(async () => {
  // 老版 GET/POST 都挂 auth.requireLogin：未登录先去登录，登录后回来继续
  if (!session.loaded) {
    try { await session.refresh() } catch { /* ignore */ }
  }
  if (!session.isAuthed) {
    router.replace(`/login?next=${encodeURIComponent(route.fullPath)}`)
    return
  }
  if (!errorText.value && !already.value && !code) {
    errorText.value = '邀请链接无效：缺少邀请码。'
  }
  ready.value = true
})

async function onConfirm() {
  errorText.value = ''
  loading.value = true
  try {
    const r = await joinLedger(code)
    if (!r.ok) {
      errorText.value = r.error || '加入失败'
      return
    }
    // 刷新会话：后端已把 ledgerId 切到受邀账本（或保留原账本），同步侧栏/顶栏账本上下文
    await session.refresh()
    if (r.alreadyMember) {
      message.info(r.message || `你已是账本「${r.ledgerName}」的成员`)
    } else {
      message.success(r.message || `已加入账本「${r.ledgerName}」，可随时在右上角切换账本`)
    }
    router.replace('/')
  } catch (e: any) {
    errorText.value = e?.message || '加入失败'
  } finally {
    loading.value = false
  }
}

function goHome() { router.replace('/') }
</script>

<template>
  <BlankLayout title="加入账本">
    <div class="join">
      <template v-if="ready">
        <!-- 错误态：邀请无效/过期/已用等（后端 resolveInvite 失败经 ?error= 回传）或提交失败 -->
        <template v-if="errorText">
          <h1 class="title">加入账本确认</h1>
          <NAlert type="error" :show-icon="true" class="alert">{{ errorText }}</NAlert>
          <NText depth="3" class="footer">不想加入？直接关闭本页即可，邀请不会被使用。</NText>
        </template>

        <!-- 已是成员：后端 GET 检测到成员身份后带 ?already=1 回跳 -->
        <template v-else-if="already">
          <h1 class="title">加入账本确认</h1>
          <NAlert type="info" :show-icon="true" class="alert">
            你已是账本「{{ ledgerName }}」的成员，无需重复加入。
          </NAlert>
          <NButton type="primary" block size="large" @click="goHome">进入首页</NButton>
          <NText depth="3" class="footer">不想加入？直接关闭本页即可，邀请不会被使用。</NText>
        </template>

        <!-- 正常态：邀请信息 + 确认加入（对齐老版 join.ejs） -->
        <template v-else>
          <h1 class="title">加入账本确认</h1>
          <div class="notice">
            你被邀请以 <b>{{ roleLabel }}</b> 身份加入账本「<b>{{ ledgerName }}</b>」。
            <span class="tiny">邀请由 {{ creator }} 创建<template v-if="expires"> · 有效期至 {{ expires }}</template>。</span>
          </div>
          <NButton
            type="primary"
            block
            size="large"
            :loading="loading"
            @click="onConfirm"
          >
            确认加入
          </NButton>
          <NText depth="3" class="footer">不想加入？直接关闭本页即可，邀请不会被使用。</NText>
        </template>
      </template>
    </div>
  </BlankLayout>
</template>

<style scoped>
.join { width: 100%; }
.title { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
.notice {
  font-size: 13px;
  line-height: 1.7;
  background: var(--hl-card-2, #f7f8fb);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.tiny { display: block; font-size: 12px; color: var(--hl-muted, #7d8aa3); margin-top: 2px; }
.alert { margin: 12px 0 16px; }
.footer {
  display: block;
  text-align: center;
  font-size: 12px;
  margin-top: 18px;
}
</style>
