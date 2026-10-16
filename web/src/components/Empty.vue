<script setup lang="ts">
interface Props {
  icon?: string
  title?: string
  description?: string
}
withDefaults(defineProps<Props>(), {
  icon: '🗒️',
  title: '暂无数据',
})
</script>

<template>
  <div class="hl-empty">
    <div class="big">{{ icon }}</div>
    <div class="title">{{ title }}</div>
    <div v-if="description" class="desc">{{ description }}</div>
    <slot />
  </div>
</template>

<style scoped>
.hl-empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--hl-muted, #7d8aa3);
}
.big   { font-size: 42px; line-height: 1; opacity: .8; }
.title { font-size: 14px; margin-top: 12px; color: var(--hl-text-2, #45516a); }
.desc  { font-size: 12px; margin-top: 6px; }
</style>
