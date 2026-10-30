<script setup lang="ts">
import { useRoute } from 'vue-router'
import BlankLayout from '@/layouts/BlankLayout.vue'
const route = useRoute()
</script>
<template>
  <BlankLayout title="加入账本">
    <div class="card">
      <div class="big">🎉</div>
      <div class="title">加入账本确认</div>
      <div class="desc">邀请码：<code>{{ route.params.token }}</code></div>
      <div class="desc muted">确认加入表单待补。</div>
    </div>
  </BlankLayout>
</template>
<style scoped>
.card { text-align: center; color: var(--hl-text-2, #45516a); }
.big { font-size: 48px; opacity: .85; }
.title { font-size: 16px; margin-top: 12px; color: var(--hl-text-2, #45516a); }
.desc { font-size: 13px; margin-top: 6px; }
.desc.muted { color: var(--hl-muted, #7d8aa3); font-size: 12px; }
code { background: var(--hl-card-2, #f7f8fb); padding: 2px 6px; border-radius: 4px; }
</style>
