<script setup lang="ts">
import { computed, h } from 'vue'
import { NSelect } from 'naive-ui'

export interface AccountOption {
  id: number
  name: string
  icon?: string
  type: string  // cash/bank/credit/...
  is_archived?: number | boolean
  balance_cents?: number
  isLiability?: boolean
}

interface Props {
  modelValue: number | null | undefined
  list: AccountOption[]
  includeArchived?: boolean
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  /** 隐藏某些 type（如隐藏 credit） */
  excludeTypes?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  includeArchived: false,
  placeholder: '请选择账户',
  clearable: true,
  disabled: false,
  excludeTypes: () => [],
})
const emit = defineEmits<{ 'update:modelValue': [v: number | null] }>()

const value = computed<number | null>({
  get: () => props.modelValue ?? null,
  set: (v) => emit('update:modelValue', v ?? null),
})

const options = computed(() => {
  return (props.list || [])
    .filter((a) => props.includeArchived || !a.is_archived)
    .filter((a) => !props.excludeTypes.includes(a.type))
    .map((a) => ({
      label: () =>
        h('span', { class: 'acc-opt' }, [
          h('span', { class: 'acc-ico' }, a.icon || '💳'),
          h('span', { class: 'acc-name' }, a.name),
          a.isLiability
            ? h('span', { class: 'acc-tag' }, '负债')
            : null,
        ]),
      value: a.id,
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
    class="hl-acc-select"
  />
</template>

<style scoped>
.acc-opt { display:inline-flex; align-items:center; gap:6px; }
.acc-ico { width: 18px; text-align: center; }
.acc-tag {
  font-size: 10px;
  padding: 0 4px;
  background: var(--hl-expense-soft, #feefef);
  color: var(--hl-expense, #e5484d);
  border-radius: 3px;
  margin-left: 4px;
}
</style>
