<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NInputNumber, NForm, NFormItem, NSelect,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin, NGrid, NGridItem,
  NScrollbar, NIcon, NCollapse, NCollapseItem, useMessage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { CategoriesApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtAmount } from '@/utils/money'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const data = ref<{ expense: any[]; income: any[]; flat: any[] }>({ expense: [], income: [], flat: [] })

// 表单
const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref({
  name: '',
  kind: 'expense',
  parent_id: 0,
  icon: '🏷️',
  color: '#8c8c8c',
})

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    data.value = await CategoriesApi.list()
  } catch (e) {
    toastError(errorMessage(e, '加载分类失败'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => session.currentLedger?.id, load)

// 父级候选（仅同 kind）
const parentOptions = computed(() => {
  const k = form.value.kind
  const top = data.value[k === 'expense' ? 'expense' : 'income'] || []
  return [{ label: '（顶级分类）', value: 0 }, ...top.map((c: any) => ({ label: `${c.icon} ${c.name}`, value: c.id }))]
})

function openCreate(kind: 'expense' | 'income', parentId: number = 0) {
  editing.value = null
  form.value = { name: '', kind, parent_id: parentId, icon: kind === 'expense' ? '🏷️' : '💰', color: kind === 'expense' ? '#fa8c16' : '#52c41a' }
  drawerOpen.value = true
}

function openEdit(c: any) {
  editing.value = c
  form.value = {
    name: c.name,
    kind: c.kind,
    parent_id: c.parent_id || 0,
    icon: c.icon || '🏷️',
    color: c.color || '#8c8c8c',
  }
  drawerOpen.value = true
}

async function onSubmit() {
  if (!form.value.name?.trim()) {
    message.warning('请填写名称')
    return
  }
  submitting.value = true
  // 兜底：自定义颜色不是合法 hex 时回落默认灰
  const color = /^#[0-9a-fA-F]{6}$/.test(form.value.color) ? form.value.color : '#8c8c8c'
  try {
    if (editing.value) {
      await CategoriesApi.update(Number(editing.value.id), {
        name: form.value.name.trim(),
        icon: form.value.icon,
        color,
      })
      success('已更新')
    } else {
      await CategoriesApi.create({
        name: form.value.name.trim(),
        kind: form.value.kind,
        parent_id: form.value.parent_id || null,
        icon: form.value.icon,
        color,
      })
      success('已创建')
    }
    drawerOpen.value = false
    load()
  } catch (e) {
    toastError(errorMessage(e, '保存失败'))
  } finally {
    submitting.value = false
  }
}

async function onDelete(c: any) {
  try {
    const r = await CategoriesApi.remove(Number(c.id))
    if (r?.data?.archived) {
      success('该分类下已有记录，已改为归档')
    } else {
      success('已删除')
    }
    load()
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '删除失败'
    toastError(msg)
  }
}

const CUSTOM_COLOR = '__custom'
const colorOptions = [
  { label: '🟠 橙', value: '#fa8c16' },
  { label: '🟢 绿', value: '#52c41a' },
  { label: '🔵 蓝', value: '#1677ff' },
  { label: '🟣 紫', value: '#722ed1' },
  { label: '🩷 粉', value: '#eb2f96' },
  { label: '🔴 红', value: '#f5222d' },
  { label: '🟡 黄', value: '#faad14' },
  { label: '🟦 青', value: '#13c2c2' },
  { label: '⚪ 灰', value: '#8c8c8c' },
  { label: '🎨 自定义', value: CUSTOM_COLOR },
]

// 预设色下拉 + 自定义输入兜底：选中「自定义」时展示 hex 输入框
const isPresetColor = computed(() => colorOptions.some((o) => o.value === form.value.color))
const colorValue = computed({
  get: () => (isPresetColor.value ? form.value.color : CUSTOM_COLOR),
  set: (v: string) => {
    if (v !== CUSTOM_COLOR) form.value.color = v
  },
})

// 顶部提示卡统计 + 一级分类合计（含子分类）
const topCount = computed(() => data.value.expense.length + data.value.income.length)
const subCount = computed(() => data.value.flat.filter((c: any) => c.parent_id).length)
const catTotal = (c: any) =>
  Number(c.stat?.total || 0) + (c.children || []).reduce((s: number, cc: any) => s + Number(cc.stat?.total || 0), 0)
</script>

<template>
  <AppShell>
    <PageHead title="分类管理" sub="支出 / 收入分类树。系统分类不可改，可自建专属分类">
      <template #actions>
        <NButton @click="openCreate('expense')" type="primary" ghost>＋ 新建支出分类</NButton>
        <NButton @click="openCreate('income')" type="success" ghost>＋ 新建收入分类</NButton>
      </template>
    </PageHead>

    <NAlert type="info" :bordered="false" class="notice">
      系统内置了 {{ topCount }} 个一级分类、{{ subCount }} 个二级分类，覆盖市面主流记账场景。你可以自由新建自己的分类；内置分类不可修改，但可以归档掉不用的。
    </NAlert>

    <NSpin :show="loading">
      <NGrid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
        <!-- 支出分类 -->
        <NGridItem>
          <NCard :bordered="true" size="small" class="cat-card">
            <template #header>
              <span class="cat-header">
                <span class="ico">💸</span>
                <span class="name">支出分类</span>
                <NTag :bordered="false" size="small" type="default">{{ data.expense.length }} 大类</NTag>
              </span>
            </template>
            <Empty v-if="!loading && data.expense.length === 0" icon="🏷️" title="还没有支出分类" />
            <NScrollbar v-else style="max-height: 70vh">
              <NCollapse :default-expanded-names="data.expense.slice(0, 5).map((c: any) => `e${c.id}`)">
                <NCollapseItem
                  v-for="c in data.expense"
                  :key="`e${c.id}`"
                  :name="`e${c.id}`"
                >
                  <template #header>
                    <div class="cat-row">
                      <span class="ico" :style="{ color: c.color }">{{ c.icon || '🏷️' }}</span>
                      <span class="name">{{ c.name }}</span>
                      <NTag v-if="c.is_system" :bordered="false" size="tiny" type="info">系统</NTag>
                      <NTag v-if="c.is_archived" :bordered="false" size="tiny" type="warning">归档</NTag>
                      <NText depth="3" class="cnt">{{ c.stat?.cnt || 0 }} 笔</NText>
                      <NText depth="2" class="total">合计 {{ fmtAmount(catTotal(c)) }}</NText>
                    </div>
                  </template>
                  <template #header-extra>
                    <NSpace size="small" @click.stop>
                      <NButton v-if="!c.is_system" size="tiny" quaternary @click.stop="openCreate('expense', c.id)">＋ 子类</NButton>
                      <NButton v-if="!c.is_system" size="tiny" quaternary @click.stop="openEdit(c)">编辑</NButton>
                      <NPopconfirm
                        v-if="!c.is_system"
                        @positive-click="onDelete(c)"
                        positive-text="删除"
                        negative-text="取消"
                      >
                        <template #trigger>
                          <NButton size="tiny" quaternary type="error" @click.stop>删除</NButton>
                        </template>
                        确定删除「{{ c.name }}」？若有交易将自动归档。
                      </NPopconfirm>
                      <NText v-else depth="3" class="hint">系统内置</NText>
                    </NSpace>
                  </template>
                  <div v-if="c.children?.length" class="children">
                    <div v-for="cc in c.children" :key="cc.id" class="cat-row sub">
                      <span class="ico" :style="{ color: cc.color }">{{ cc.icon || '🏷️' }}</span>
                      <span class="name">{{ cc.name }}</span>
                      <NText depth="3" class="cnt">{{ cc.stat?.cnt || 0 }} 笔</NText>
                      <NText depth="2" class="total">{{ fmtAmount(cc.stat?.total || 0) }}</NText>
                      <NSpace size="small" @click.stop>
                        <NButton size="tiny" quaternary @click.stop="openEdit(cc)">编辑</NButton>
                        <NPopconfirm
                          @positive-click="onDelete(cc)"
                          positive-text="删除"
                          negative-text="取消"
                        >
                          <template #trigger>
                            <NButton size="tiny" quaternary type="error" @click.stop>删除</NButton>
                          </template>
                          确定删除「{{ cc.name }}」？若有交易将自动归档。
                        </NPopconfirm>
                      </NSpace>
                    </div>
                  </div>
                  <div v-else class="empty-sub">— 暂无子分类 —</div>
                </NCollapseItem>
              </NCollapse>
            </NScrollbar>
          </NCard>
        </NGridItem>

        <!-- 收入分类 -->
        <NGridItem>
          <NCard :bordered="true" size="small" class="cat-card">
            <template #header>
              <span class="cat-header">
                <span class="ico">💰</span>
                <span class="name">收入分类</span>
                <NTag :bordered="false" size="small" type="default">{{ data.income.length }} 大类</NTag>
              </span>
            </template>
            <Empty v-if="!loading && data.income.length === 0" icon="🏷️" title="还没有收入分类" />
            <NScrollbar v-else style="max-height: 70vh">
              <NCollapse :default-expanded-names="data.income.slice(0, 5).map((c: any) => `i${c.id}`)">
                <NCollapseItem
                  v-for="c in data.income"
                  :key="`i${c.id}`"
                  :name="`i${c.id}`"
                >
                  <template #header>
                    <div class="cat-row">
                      <span class="ico" :style="{ color: c.color }">{{ c.icon || '🏷️' }}</span>
                      <span class="name">{{ c.name }}</span>
                      <NTag v-if="c.is_system" :bordered="false" size="tiny" type="info">系统</NTag>
                      <NText depth="3" class="cnt">{{ c.stat?.cnt || 0 }} 笔</NText>
                      <NText depth="2" class="total">合计 {{ fmtAmount(catTotal(c)) }}</NText>
                    </div>
                  </template>
                  <template #header-extra>
                    <NSpace size="small">
                      <NButton v-if="!c.is_system" size="tiny" quaternary @click="openCreate('income', c.id)">＋ 子类</NButton>
                      <NButton v-if="!c.is_system" size="tiny" quaternary @click="openEdit(c)">编辑</NButton>
                      <NPopconfirm
                        v-if="!c.is_system"
                        @positive-click="onDelete(c)"
                        positive-text="删除"
                        negative-text="取消"
                      >
                        <template #trigger>
                          <NButton size="tiny" quaternary type="error">删除</NButton>
                        </template>
                        确定删除「{{ c.name }}」？
                      </NPopconfirm>
                    </NSpace>
                  </template>
                  <div v-if="c.children?.length" class="children">
                    <div v-for="cc in c.children" :key="cc.id" class="cat-row sub">
                      <span class="ico" :style="{ color: cc.color }">{{ cc.icon || '🏷️' }}</span>
                      <span class="name">{{ cc.name }}</span>
                      <NText depth="3" class="cnt">{{ cc.stat?.cnt || 0 }} 笔</NText>
                      <NText depth="2" class="total">{{ fmtAmount(cc.stat?.total || 0) }}</NText>
                      <NSpace size="small">
                        <NButton size="tiny" quaternary @click="openEdit(cc)">编辑</NButton>
                        <NPopconfirm
                          @positive-click="onDelete(cc)"
                          positive-text="删除"
                          negative-text="取消"
                        >
                          <template #trigger>
                            <NButton size="tiny" quaternary type="error">删除</NButton>
                          </template>
                          确定删除？
                        </NPopconfirm>
                      </NSpace>
                    </div>
                  </div>
                </NCollapseItem>
              </NCollapse>
            </NScrollbar>
          </NCard>
        </NGridItem>
      </NGrid>
    </NSpin>

    <!-- 新建/编辑抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="420" placement="right">
      <NDrawerContent :title="editing ? '编辑分类' : '新建分类'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem v-if="!editing" label="类型">
            <NSelect
              v-model:value="form.kind"
              :options="[
                { label: '💸 支出', value: 'expense' },
                { label: '💰 收入', value: 'income' },
              ]"
              :disabled="!!editing"
            />
          </NFormItem>
          <NFormItem v-if="!editing" label="父级分类">
            <NSelect
              v-model:value="form.parent_id"
              :options="parentOptions"
              :disabled="!!editing"
            />
          </NFormItem>
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="20" show-count placeholder="如：宠物" />
          </NFormItem>
          <NFormItem label="图标">
            <NInput v-model:value="form.icon" maxlength="4" placeholder="🏷️" />
          </NFormItem>
          <NFormItem label="颜色">
            <div class="color-field">
              <NSelect v-model:value="colorValue" :options="colorOptions" />
              <NInput
                v-if="!isPresetColor"
                v-model:value="form.color"
                maxlength="7"
                placeholder="#4f7cff"
                class="color-input"
              />
              <span class="color-preview" :style="{ background: form.color }"></span>
            </div>
          </NFormItem>
          <NAlert v-if="editing?.is_system" type="warning" :show-icon="true" class="tip">
            系统内置分类只能改名称、图标、颜色，不能删除。
          </NAlert>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="drawerOpen = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="onSubmit">
              {{ editing ? '保 存' : '创 建' }}
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.cat-header { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.cat-header .ico { font-size: 16px; }
.cat-card { height: 100%; }
.cat-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px;
  width: 100%;
}
.cat-row .ico { font-size: 18px; width: 20px; text-align: center; }
.cat-row .name { flex: 1; }
.cat-row .cnt { font-size: 12px; color: var(--hl-muted); }
.cat-row .total { font-size: 13px; font-weight: 500; min-width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
.cat-row.sub { padding: 4px 0 4px 18px; font-size: 13px; border-bottom: 1px dashed var(--hl-border, #e6eaf1); }
.cat-row.sub:last-child { border-bottom: 0; }
.children { padding: 4px 0; }
.empty-sub { color: var(--hl-muted); font-size: 12px; text-align: center; padding: 8px 0; }
.hint { font-size: 12px; }
.color-preview { display: inline-block; width: 20px; height: 20px; border-radius: 4px; margin-left: 8px; vertical-align: middle; border: 1px solid var(--hl-border); }
.tip { margin-top: 12px; }
.notice { margin-bottom: 12px; }
.color-field { display: flex; align-items: center; gap: 8px; width: 100%; }
.color-field .n-select { flex: 1; }
.color-input { width: 120px; }
</style>
