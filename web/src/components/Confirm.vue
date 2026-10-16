<script setup lang="ts">
import { NPopconfirm, NButton } from 'naive-ui'

interface Props {
  content: string
  okText?: string
  cancelText?: string
  positiveText?: string
  negativeText?: string
  /** "danger" 模式：确认按钮用红色 */
  danger?: boolean
}
withDefaults(defineProps<Props>(), {
  okText: '确定',
  cancelText: '取消',
  positiveText: '确定',
  negativeText: '取消',
  danger: false,
})
</script>

<template>
  <NPopconfirm
    :positive-text="positiveText"
    :negative-text="negativeText"
    @positive-click="$emit('ok')"
  >
    <template #trigger>
      <slot />
    </template>
    {{ content }}
  </NPopconfirm>
</template>

<style scoped>
</style>
