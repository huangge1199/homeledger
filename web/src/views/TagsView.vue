<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NPopconfirm,
  NDrawer, NDrawerContent, NSelect, NSpin, NGrid, NGridItem, useMessage,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { TagsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { fmtAmount } from '@/utils/money'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const tags = ref<{ id: number; name: string; color: string; cnt: number; total: number }[]>([])

// 抽屉
const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref({ name: '', color: '#4f7cff' })

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await TagsApi.list()
    tags.value = d.tags || []
  } catch (e) {
    toastError(errorMessage(e, '加载标签失败'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => session.currentLedger?.id, load)

const sorted = computed(() => [...tags.value].sort((a, b) => b.cnt - a.cnt))
const totalCount = computed(() => tags.value.reduce((s, t) => s + (t.cnt || 0), 0))

const colorOptions = [
  { label: '🔵 蓝', value: '#4f7cff' },
  { label: '🟠 橙', value: '#fa8c16' },
  { label: '🟢 绿', value: '#52c41a' },
  { label: '🩷 粉', value: '#eb2f96' },
  { label: '🟣 紫', value: '#722ed1' },
  { label: '🟡 黄', value: '#faad14' },
  { label: '🔴 红', value: '#f5222d' },
  { label: '⚪ 灰', value: '#8c8c8c' },
]

function openCreate() {
  editing.value = null
  form.value = { name: '', color: '#4f7cff' }
  drawerOpen.value = true
}

function openEdit(t: any) {
  editing.value = t
  form.value = { name: t.name, color: t.color || '#4f7cff' }
  drawerOpen.value = true
}

async function onSubmit() {
  if (!form.value.name?.trim()) {
    message.warning('请填写标签名')
    return
  }
  submitting.value = true
  try {
    if (editing.value) {
      await TagsApi.update(Number(editing.value.id), form.value)
      success('已更新')
    } else {
      await TagsApi.create(form.value)
      success('已创建')
    }
    drawerOpen.value = false
    load()
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '保存失败'
    toastError(msg)
  } finally {
    submitting.value = false
  }
}

async function onDelete(t: any) {
  try {
    await TagsApi.remove(Number(t.id))
    success('已删除')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '删除失败')
  }
}
</script>

<template>
  <AppShell>
    <PageHead title="标签管理" sub="为你的交易打标签，按标签筛选回顾">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建标签</NButton>
      </template>
    </PageHead>

    <NCard :bordered="true" size="small" class="summary-card">
      <NGrid :cols="3" :x-gap="12">
        <NGridItem>
          <div class="stat">
            <div class="num">{{ tags.length }}</div>
            <div class="label">标签总数</div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat">
            <div class="num">{{ totalCount }}</div>
            <div class="label">使用次数</div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat">
            <div class="num">{{ sorted.filter(t => t.cnt > 0).length }}</div>
            <div class="label">已使用</div>
          </div>
        </NGridItem>
      </NGrid>
    </NCard>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !tags.length"
        icon="🏷️"
        title="还没有标签"
        description="在记一笔时为交易打标签，方便后续按标签筛选"
      >
        <NButton type="primary" @click="openCreate">＋ 新建标签</NButton>
      </Empty>

      <NCard v-else :bordered="true" class="tags-card">
        <div class="tag-grid">
          <div
            v-for="t in sorted"
            :key="t.id"
            class="tag-item"
            :class="{ empty: t.cnt === 0 }"
          >
            <div class="tag-ico" :style="{ background: t.color }">#</div>
            <div class="tag-info">
              <div class="name">{{ t.name }}</div>
              <div class="meta">
                <span class="cnt">{{ t.cnt }} 笔</span>
                <span class="dot">·</span>
                <span class="total">{{ fmtAmount(t.total || 0) }}</span>
              </div>
            </div>
            <NSpace size="small" class="actions">
              <NButton size="tiny" quaternary @click="openEdit(t)">编辑</NButton>
              <NPopconfirm
                @positive-click="onDelete(t)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">删除</NButton>
                </template>
                确定删除「#{{ t.name }}」？关联的交易只会取消标签，不会删除交易本身。
              </NPopconfirm>
            </NSpace>
          </div>
        </div>
      </NCard>
    </NSpin>

    <NDrawer v-model:show="drawerOpen" :width="380" placement="right">
      <NDrawerContent :title="editing ? '编辑标签' : '新建标签'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" maxlength="20" show-count placeholder="如：工作日、报销" />
          </NFormItem>
          <NFormItem label="颜色">
            <NSelect v-model:value="form.color" :options="colorOptions" />
            <span class="color-preview" :style="{ background: form.color }"></span>
          </NFormItem>
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
.summary-card { margin-bottom: 12px; }
.stat { text-align: center; }
.stat .num { font-size: 22px; font-weight: 600; }
.stat .label { font-size: 12px; color: var(--hl-muted); }

.tag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.tag-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--hl-card-2, #f7f8fb);
  border-radius: 8px;
  transition: background .15s;
  border: 1px solid transparent;
}
.tag-item:hover { background: var(--hl-primary-2, #e8efff); border-color: var(--hl-primary, #3d6df5); }
.tag-item.empty { opacity: .55; }
.tag-ico {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 16px;
  flex-shrink: 0;
}
.tag-info { flex: 1; min-width: 0; }
.tag-info .name { font-size: 14px; font-weight: 500; }
.tag-info .meta { display: flex; gap: 4px; font-size: 11px; color: var(--hl-muted); margin-top: 2px; }
.tag-info .meta .dot { opacity: .5; }
.tag-item .actions { opacity: 0; transition: opacity .15s; }
.tag-item:hover .actions { opacity: 1; }

.color-preview { display: inline-block; width: 20px; height: 20px; border-radius: 4px; margin-left: 8px; vertical-align: middle; border: 1px solid var(--hl-border); }
</style>
