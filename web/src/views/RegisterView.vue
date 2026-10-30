<script setup lang="ts">
import BlankLayout from '@/layouts/BlankLayout.vue'
</script>
<template>
  <BlankLayout title="注册">
    <div class="card">
      <div class="big">📝</div>
      <div class="title">创建账号</div>
      <div class="desc">注册后会自动为你创建一个默认账本。</div>
      <div class="desc muted">仅在管理员开启「允许注册」时可用（表单待补）。</div>
    </div>
  </BlankLayout>
</template>
<style scoped>
.card { text-align: center; color: var(--hl-text-2, #45516a); }
.big { font-size: 48px; opacity: .85; }
.title { font-size: 16px; margin-top: 12px; color: var(--hl-text-2, #45516a); }
.desc { font-size: 13px; margin-top: 6px; }
.desc.muted { color: var(--hl-muted, #7d8aa3); font-size: 12px; }
</style>
