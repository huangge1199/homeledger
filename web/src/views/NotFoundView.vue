<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute()
const router = useRouter()

function goBack() {
  // 对齐老版 history.back()；无历史可退（新标签直开）时兜底回总览
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>
<template>
  <AppShell>
    <div class="card">
      <div class="big">😵</div>
      <div class="title">页面不存在</div>
      <div class="desc">找不到 <code>{{ route.path }}</code>，可能是链接已失效。</div>
      <div class="actions">
        <button class="btn ghost" @click="goBack">返回上一页</button>
        <button class="btn" @click="router.replace('/')">回到总览</button>
      </div>
    </div>
  </AppShell>
</template>
<style scoped>
.card {
  background: #fff;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 12px;
  padding: 60px 24px;
  text-align: center;
  color: var(--hl-muted, #7d8aa3);
  max-width: 520px;
  margin: 40px auto;
}
.big { font-size: 48px; opacity: .85; }
.title { font-size: 16px; margin-top: 12px; color: var(--hl-text-2, #45516a); }
.desc { font-size: 13px; margin-top: 6px; }
.desc code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  background: var(--hl-card-2, #f7f8fb);
  padding: 1px 6px;
  border-radius: 4px;
}
.actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.btn {
  padding: 8px 16px;
  background: var(--hl-primary, #3d6df5);
  color: #fff;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.btn.ghost {
  background: transparent;
  color: var(--hl-text-2, #45516a);
  border: 1px solid var(--hl-border, #d8deea);
}
.btn.ghost:hover { background: var(--hl-card-2, #f7f8fb); }
</style>
