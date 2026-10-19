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
  /* 窄屏时操作区换行，避免按钮溢出容器 */
  flex-wrap: wrap;
  /* 右侧留出与卡片内边距一致的视觉留白，避免操作控件紧贴内容区边缘 */
  padding-right: 16px;
}
.title { font-size: 22px; font-weight: 600; margin: 0; line-height: 1.2; }
.sub   { font-size: 13px; color: var(--hl-muted, #7d8aa3); margin-top: 2px; }
/* 居中对齐各控件的高度，并允许收缩，避免超出内容区 */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}
</style>
