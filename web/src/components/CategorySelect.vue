<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NSelect, NPopover } from 'naive-ui'

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
  /** 级联模式：父级 chip + 子级网格，单选（与老版 txn-form.ejs 分类卡一致） */
  cascader?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  kind: 'all',
  includeArchived: false,
  placeholder: '请选择分类',
  clearable: true,
  disabled: false,
  cascader: false,
})
const emit = defineEmits<{ 'update:modelValue': [v: number | null] }>()

const value = computed<number | null>({
  get: () => props.modelValue ?? null,
  set: (v) => emit('update:modelValue', v ?? null),
})

/** 过滤出当前 kind 下未归档的分类，并按父级归组 */
const rows = computed(() =>
  (props.list || [])
    .filter((c) => props.includeArchived || !c.is_archived)
    .filter((c) => props.kind === 'all' || c.kind === props.kind)
)

const grouped = computed(() => {
  const list = rows.value
  return list
    .filter((c) => !c.parent_id)
    .map((r) => ({
      root: r,
      children: list.filter((c) => Number(c.parent_id) === Number(r.id)),
    }))
})

// 下拉模式：扁平选项
const options = computed(() =>
  rows.value.map((c) => ({
    label: c.path || c.name,
    value: c.id,
  }))
)

// 级联模式：当前激活的父级；默认取已选分类的父级，否则第一个根
const activeRootId = ref<number | null>(null)

const activeGroup = computed(
  () => grouped.value.find((g) => Number(g.root.id) === Number(activeRootId.value)) || grouped.value[0]
)

watch(
  () => [props.kind, props.modelValue, grouped.value.length],
  () => {
    const sel = rows.value.find((c) => Number(c.id) === Number(props.modelValue))
    if (sel) {
      activeRootId.value = sel.parent_id ? Number(sel.parent_id) : sel.id
      return
    }
    // 未选中时，若当前激活父级已失效则回落到第一个
    if (!grouped.value.some((g) => Number(g.root.id) === Number(activeRootId.value))) {
      activeRootId.value = grouped.value.length ? grouped.value[0].root.id : null
    }
  },
  { immediate: true }
)

/** 已选分类的展示路径，如「餐饮 / 早餐」 */
const selectedPath = computed(() => {
  const id = props.modelValue
  if (id == null) return ''
  for (const g of grouped.value) {
    if (Number(g.root.id) === Number(id)) return g.root.name
    const hit = g.children.find((c) => Number(c.id) === Number(id))
    if (hit) return `${g.root.name} / ${hit.name}`
  }
  const flat = rows.value.find((c) => Number(c.id) === Number(id))
  return flat ? flat.name : ''
})

const selectedIcon = computed(() => {
  const id = props.modelValue
  if (id == null) return ''
  const hit = rows.value.find((c) => Number(c.id) === Number(id))
  return hit?.icon || ''
})

function pick(id: number) {
  emit('update:modelValue', id)
}
function pickRoot(id: number) {
  activeRootId.value = id
}
function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <NPopover
    v-if="cascader"
    trigger="click"
    placement="bottom-start"
    :show-arrow="false"
    :disabled="disabled"
    raw
    class="cat-pop"
  >
    <template #trigger>
      <button type="button" class="cat-trigger" :disabled="disabled">
        <span v-if="selectedIcon" class="cat-trigger-ico">{{ selectedIcon }}</span>
        <span v-if="selectedPath" class="cat-trigger-text">{{ selectedPath }}</span>
        <span v-else class="cat-trigger-empty">{{ placeholder }}</span>
        <span v-if="clearable && modelValue != null" class="cat-clear" title="清除" @click.stop="clear">✕</span>
        <span class="cat-caret">▾</span>
      </button>
    </template>

    <div class="cat-panel">
      <!-- 父级 chip 横排：老版 .cat-parent -->
      <div class="cat-parents">
        <button
          v-for="g in grouped"
          :key="g.root.id"
          type="button"
          class="cat-chip"
          :class="{ active: Number(g.root.id) === Number(activeGroup?.root.id) }"
          @click="pickRoot(g.root.id)"
        >
          <span class="ci">{{ g.root.icon || '📁' }}</span>{{ g.root.name }}
        </button>
      </div>

      <!-- 子级网格：老版 .cat-grid -->
      <div v-if="activeGroup" class="cat-grid">
        <button
          v-for="c in activeGroup.children"
          :key="c.id"
          type="button"
          class="cat-item"
          :class="{ selected: Number(c.id) === Number(modelValue) }"
          @click="pick(c.id)"
        >
          <span class="ci">{{ c.icon || '🏷️' }}</span>
          <span class="cn">{{ c.name }}</span>
        </button>
        <button
          type="button"
          class="cat-item"
          :class="{ selected: Number(activeGroup.root.id) === Number(modelValue) }"
          @click="pick(activeGroup.root.id)"
        >
          <span class="ci">📁</span>
          <span class="cn">不细分</span>
        </button>
      </div>
      <div v-else class="cat-empty">暂无分类</div>
    </div>
  </NPopover>

  <NSelect
    v-else
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
/* 触发按钮：视觉对齐 NSelect */
.cat-trigger {
  width: 100%; min-width: 200px; height: 34px;
  display: flex; align-items: center; gap: 6px;
  padding: 0 10px 0 11px;
  border: 1px solid rgba(224, 224, 230, 1);
  border-radius: 3px; background: #fff;
  cursor: pointer; font-size: 14px; color: var(--hl-text, rgb(51, 54, 57));
  transition: border-color .15s;
}
.cat-trigger:hover:not(:disabled) { border-color: #36ad6a; }
.cat-trigger:disabled { opacity: .6; cursor: not-allowed; }
.cat-trigger-ico { flex: 0 0 auto; }
.cat-trigger-text { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-trigger-empty { flex: 1; text-align: left; color: #b8bfc9; }
.cat-clear {
  flex: 0 0 auto; font-size: 11px; color: #b8bfc9;
  padding: 0 4px; border-radius: 50%;
}
.cat-clear:hover { background: rgba(0, 0, 0, .06); color: #666; }
.cat-caret { flex: 0 0 auto; font-size: 11px; color: #b8bfc9; }

/* NPopover 开了 raw，naive 不渲染自带外壳与背景，须自行补浮层底色，
   否则面板透明会透出页面下方内容 */
.cat-panel {
  width: 340px; max-width: 78vw; padding: 12px;
  background: var(--hl-card, #fff);
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .12);
}
/* 父级 chip：老版 .cat-parent */
.cat-parents { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.cat-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--hl-border, #e6eaf1);
  background: #fff; cursor: pointer;
  font-size: 12.5px; color: var(--hl-text-2, #45516a);
  transition: all .15s;
}
.cat-chip:hover { background: var(--hl-card-2, #f7f8fb); }
.cat-chip.active {
  border-color: var(--hl-primary, #18a058);
  color: var(--hl-primary, #18a058);
  background: rgba(24, 160, 88, .08);
}
.cat-chip .ci { font-size: 13px; }
/* 子级网格：老版 .cat-grid */
.cat-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 6px; max-height: 260px; overflow-y: auto;
}
.cat-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border-radius: 8px;
  border: 1px solid transparent; background: var(--hl-card-2, #f7f8fb);
  cursor: pointer; font-size: 12px; color: var(--hl-text-2, #45516a);
  transition: all .15s;
}
.cat-item:hover { background: #eef0f4; }
.cat-item.selected {
  border-color: var(--hl-primary, #18a058);
  background: rgba(24, 160, 88, .1);
  color: var(--hl-primary, #18a058);
}
.cat-item .ci { font-size: 18px; line-height: 1; }
.cat-item .cn { line-height: 1.3; text-align: center; }
.cat-empty { padding: 20px; text-align: center; font-size: 13px; color: #b8bfc9; }
</style>
