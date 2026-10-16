<script setup lang="ts">
interface Props {
  title: string
  sub?: string
}
defineProps<Props>()
</script>

<template>
  <div class="hl-page-head">
    <div class="meta">
      <h1 class="title">{{ title }}</h1>
      <div v-if="sub" class="sub">{{ sub }}</div>
    </div>
    <div class="actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.hl-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 4px 0 16px;
  gap: 16px;
}
.title { font-size: 22px; font-weight: 600; margin: 0; line-height: 1.2; }
.sub   { font-size: 13px; color: var(--hl-muted, #7d8aa3); margin-top: 2px; }
.actions { display: flex; gap: 8px; }
</style>
