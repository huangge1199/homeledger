<script setup lang="ts">
import { useRoute } from 'vue-router'
import BlankLayout from '@/layouts/BlankLayout.vue'
const route = useRoute()
</script>
<template>
  <BlankLayout title="加入账本">
    <div class="card"><div class="big">🎉</div><div class="title">加入账本</div><div class="desc">邀请码：<code>{{ route.params.token }}</code></div></div>
  </BlankLayout>
</template>
<style scoped>
.card { background:#fff; border:1px solid var(--hl-border,#e6eaf1); border-radius:12px; padding:60px 24px; text-align:center; color:var(--hl-muted,#7d8aa3); }
.big { font-size:48px; opacity:.85; } .title { font-size:16px; margin-top:12px; color:var(--hl-text-2,#45516a); } .desc { font-size:13px; margin-top:6px; } code { background: var(--hl-card-2,#f7f8fb); padding: 2px 6px; border-radius: 4px; }
</style>
