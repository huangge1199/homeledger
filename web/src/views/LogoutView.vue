<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

onMounted(async () => {
  await session.logout()
  router.replace('/login')
})
</script>
<template>
  <div class="logout">
    <div class="text">正在退出登录…</div>
  </div>
</template>
<style scoped>
.logout { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: var(--hl-muted); font-size: 14px; }
</style>
