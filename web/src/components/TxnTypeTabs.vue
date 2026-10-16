<script setup lang="ts">
import { computed } from 'vue'
import { NTag, NSpace } from 'naive-ui'
import { TXN_TYPES, PRIMARY_TXN_TYPES, TXN_TYPE_MAP, type TxnType } from '@/utils/txnTypes'

interface Props {
  modelValue: string
  primary?: string[]
  more?: TxnType[]
  /** 是否在选择中禁用某些类型（如转账时不选 lend） */
  hidden?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  primary: () => PRIMARY_TXN_TYPES,
  more: () => TXN_TYPES,
  hidden: () => [],
})
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const current = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const primaryList = computed(() => props.primary.map((k) => TXN_TYPE_MAP[k]).filter(Boolean))
const moreList = computed(() => props.more.filter((t) => !props.primary.includes(t.key) && !props.hidden.includes(t.key)))
</script>

<template>
  <div class="hl-ttabs">
    <div class="primary">
      <button
        v-for="t in primaryList"
        :key="t.key"
        type="button"
        class="tab"
        :class="{ active: current === t.key }"
        :style="current === t.key ? { background: t.color, borderColor: t.color, color: '#fff' } : undefined"
        @click="current = t.key"
      >
        <span class="icon">{{ t.icon }}</span>
        <span class="label">{{ t.label }}</span>
      </button>
    </div>
    <div class="more">
      <span class="hint">更多类型：</span>
      <NSpace size="small" :wrap="true">
        <NTag
          v-for="t in moreList"
          :key="t.key"
          :type="current === t.key ? 'primary' : 'default'"
          checkable
          :checked="current === t.key"
          @update:checked="(c: boolean) => c && (current = t.key)"
        >
          {{ t.icon }} {{ t.label }}
        </NTag>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.hl-ttabs { display:flex; flex-direction:column; gap:8px; }
.primary { display:flex; gap:6px; }
.primary .tab {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--hl-border, #e6eaf1);
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--hl-text-2, #45516a);
  display:flex; align-items:center; justify-content:center; gap:4px;
  transition: all .15s;
}
.primary .tab:hover { background: var(--hl-card-2, #f7f8fb); }
.more { display:flex; gap:8px; align-items:flex-start; flex-wrap: wrap; }
.hint { font-size:12px; line-height: 24px; color: var(--hl-muted); }
</style>
