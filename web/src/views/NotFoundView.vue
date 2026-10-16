<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue'
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<template>
  <AppShell>
    <div class="card">
      <div class="big">🧭</div>
      <div class="title">页面未找到</div>
      <div class="desc">你访问的链接可能已失效或不存在。</div>
      <button class="btn" @click="router.replace('/')">返回总览</button>
    </div>
  </AppShell>
</template>
<style scoped>
.card { background:#fff; border:1px solid var(--hl-border,#e6eaf1); border-radius:12px; padding:60px 24px; text-align:center; color:var(--hl-muted,#7d8aa3); }
.big { font-size:48px; opacity:.85; } .title { font-size:16px; margin-top:12px; color:var(--hl-text-2,#45516a); } .desc { font-size:13px; margin-top:6px; }
.btn { margin-top: 16px; padding: 8px 16px; background: var(--hl-primary,#3d6df5); color:#fff; border:0; border-radius: 6px; cursor: pointer; }
</style>
