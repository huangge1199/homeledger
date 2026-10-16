<script setup lang="ts">
import { computed, h } from 'vue'
import { NSelect } from 'naive-ui'

export interface CategoryOption {
  id: number
  name: string
  icon?: string
  color?: string
  path?: string
  parent_id?: number | null
  kind: 'expense' | 'income'
  is_system?: number | boolean
  is_archived?: number | boolean
}

interface Props {
  modelValue: number | null | undefined
  list: CategoryOption[]
  /** 'expense' | 'income' | 'all' */
  kind?: 'expense' | 'income' | 'all'
  /** 允许选归档分类 */
  includeArchived?: boolean
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  kind: 'all',
  includeArchived: false,
  placeholder: '请选择分类',
  clearable: true,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [v: number | null] }>()

const value = computed<number | null>({
  get: () => props.modelValue ?? null,
  set: (v) => emit('update:modelValue', v ?? null),
})

const options = computed(() => {
  return (props.list || [])
    .filter((c) => props.includeArchived || !c.is_archived)
    .filter((c) => props.kind === 'all' || c.kind === props.kind)
    .map((c) => ({
      label: () =>
        h('span', { class: 'cat-opt' }, [
          h('span', { class: 'cat-ico', style: { color: c.color || '#888' } }, c.icon || '🏷️'),
          h('span', { class: 'cat-name' }, c.path || c.name),
        ]),
      value: c.id,
    }))
})
</script>

<template>
  <NSelect
    v-model:value="value"
    :options="options"
    :placeholder="placeholder"
    :clearable="clearable"
    :disabled="disabled"
    filterable
    class="hl-cat-select"
  />
</template>

<style scoped>
.cat-opt { display:inline-flex; align-items:center; gap:6px; }
.cat-ico { width: 18px; text-align: center; }
</style>
