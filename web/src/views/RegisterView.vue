<script setup lang="ts">
import BlankLayout from '@/layouts/BlankLayout.vue'
defineProps<{ title?: string }>()
</script>
<template>
  <BlankLayout title="注册账号">
    <div class="card"><div class="big">📝</div><div class="title">注册</div><div class="desc">仅在管理员开启「允许注册」时可用。</div></div>
  </BlankLayout>
</template>
<style scoped>
.card { background:#fff; border:1px solid var(--hl-border,#e6eaf1); border-radius:12px; padding:60px 24px; text-align:center; color:var(--hl-muted,#7d8aa3); }
.big { font-size:48px; opacity:.85; } .title { font-size:16px; margin-top:12px; color:var(--hl-text-2,#45516a); } .desc { font-size:13px; margin-top:6px; }
</style>
