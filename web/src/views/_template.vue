<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'

interface Props {
  title: string
  sub?: string
  primary?: string
  primaryTarget?: string
}
withDefaults(defineProps<Props>(), {
  title: '即将上线',
})
</script>

<template>
  <AppShell>
    <PageHead :title="title" :sub="sub">
      <template #actions>
        <slot name="actions" />
      </template>
    </PageHead>

    <div class="card">
      <div class="big">🛠️</div>
      <div class="title">阶段 3 实现中</div>
      <div class="desc">本页面已纳入迁移计划，将在阶段 3（业务页面迁移）中完整实现。</div>
      <slot />
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
}
.big   { font-size: 48px; opacity: .85; }
.title { font-size: 16px; margin-top: 12px; color: var(--hl-text-2, #45516a); }
.desc  { font-size: 13px; margin-top: 6px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.5; }
</style>
