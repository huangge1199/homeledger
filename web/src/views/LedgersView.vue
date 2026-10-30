<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect,
  NDrawer, NDrawerContent, NAlert, NSpin, NGrid, NGridItem,
  NColorPicker, useMessage, NSwitch, NRadioGroup, NRadio,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { colorFor } from '@/utils/format'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const items = ref<any[]>([])

const drawerOpen = ref(false)
const editing = ref<any>(null)
const submitting = ref(false)
const form = ref(emptyForm())
// 用户是否手动改过颜色（未改则跟随账本名自动配色）
const colorTouched = ref(false)

const deleteOpen = ref(false)
const deleteTarget = ref<any>(null)
const deleteConfirm = ref('')

function emptyForm() {
  return {
    name: '',
    kind: 'personal',
    icon: '📒',
    // 默认按账本名自动配色（老版新建表单没有颜色项，由后端 colorFor(name) 生成）
    color: colorFor(''),
    currency: 'CNY',
    with_default_accounts: true,
    note: '',
  }
}

async function load() {
  loading.value = true
  try {
    const d = await AdminApi.ledgers()
    items.value = d.items || []
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

/**
 * 用途选项（文案对齐老版 ledgers.ejs）
 * 老版新建表单：个人 / 家庭（多人共享）/ 经营 / 旅行 / 项目
 * 老版编辑表单：个人 / 家庭 / 经营 / 旅行 / 项目
 */
const kindOptions = computed(() => [
  { label: '🏠 个人', value: 'personal' },
  { label: editing.value ? '👨‍👩‍👧 家庭' : '👨‍👩‍👧 家庭（多人共享）', value: 'family' },
  { label: '💼 经营', value: 'business' },
  { label: '✈️ 旅行', value: 'travel' },
  { label: '🚀 项目', value: 'project' },
])

/** 币种（对齐老版编辑表单：CNY/USD/EUR/HKD/JPY/SGD） */
const currencyOptions = [
  { label: '人民币 CNY', value: 'CNY' },
  { label: '美元 USD', value: 'USD' },
  { label: '欧元 EUR', value: 'EUR' },
  { label: '港币 HKD', value: 'HKD' },
  { label: '日元 JPY', value: 'JPY' },
  { label: '新加坡元 SGD', value: 'SGD' },
]

const colorPresets = [
  '#3d6df5', '#fa8c16', '#52c41a', '#722ed1', '#eb2f96',
  '#f5222d', '#13c2c2', '#faad14', '#8c8c8c',
]

function openCreate() {
  editing.value = null
  colorTouched.value = false
  form.value = emptyForm()
  drawerOpen.value = true
}

function openEdit(l: any) {
  editing.value = l
  colorTouched.value = true
  form.value = {
    name: l.name,
    kind: l.kind,
    icon: l.icon,
    color: l.color,
    currency: l.currency,
    with_default_accounts: false,
    note: l.note || '',
  }
  drawerOpen.value = true
}

// 老版新建表单没有颜色项，颜色由后端 colorFor(name) 自动生成；
// 这里在用户未手动指定颜色前，随账本名同步自动配色
watch(() => form.value.name, (name) => {
  if (!editing.value && !colorTouched.value) form.value.color = colorFor(name)
})

async function onSubmit() {
  if (!form.value.name?.trim()) { message.warning('请填写账本名称'); return }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      kind: form.value.kind,
      icon: form.value.icon,
      color: form.value.color,
      currency: form.value.currency,
      note: form.value.note,
    }
    if (editing.value) {
      await AdminApi.updateLedger(Number(editing.value.id), payload)
      success('账本信息已更新')
    } else {
      payload.with_default_accounts = form.value.with_default_accounts ? '1' : '0'
      await AdminApi.createLedger(payload)
      success(`账本「${form.value.name}」已创建`)
      await session.refresh()
    }
    drawerOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onSwitch(l: any) {
  try {
    await session.switchLedger(Number(l.id))
    success(`已切换到「${l.name}」`)
  } catch (e: any) {
    toastError(errorMessage(e, '切换账本失败'))
  }
}

async function onArchive(l: any) {
  try {
    await AdminApi.archiveLedger(Number(l.id))
    success(l.is_archived ? '账本已恢复' : '账本已归档')
    // 归档/恢复会改变侧栏账本列表（归档账本不进入当前账本候选），需同步会话
    await session.refresh()
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '操作失败')
  }
}

function openDelete(l: any) {
  if (l.role !== 'owner') {
    toastError('只有账本拥有者可以删除')
    return
  }
  deleteTarget.value = l
  deleteConfirm.value = ''
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  if (deleteConfirm.value !== deleteTarget.value.name) {
    message.warning('请准确输入账本名称以确认删除')
    return
  }
  try {
    await AdminApi.deleteLedger(Number(deleteTarget.value.id), deleteConfirm.value)
    success(`账本「${deleteTarget.value.name}」及其全部数据已删除`)
    deleteOpen.value = false
    // 删除后侧栏账本列表需同步（删掉的可能不是当前账本）
    await session.refresh()
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '删除失败')
  }
}

const activeLedgers = computed(() => items.value.filter((l) => !l.is_archived))
const archivedLedgers = computed(() => items.value.filter((l) => l.is_archived))

function roleLabel(role: string) {
  return ({ owner: '所有者', admin: '管理员', member: '成员', viewer: '只读' } as Record<string, string>)[role] || role
}
function kindLabel(kind: string) {
  return ({ personal: '个人', family: '家庭', business: '经营', travel: '旅行', project: '项目' } as Record<string, string>)[kind] || kind
}
</script>

<template>
  <AppShell>
    <PageHead title="账本管理" sub="账本用于分隔不同用途的账目，例如「家庭」「旅行」「工作室」。每个账本可邀请成员共同记账。">
      <template #actions>
        <NButton type="primary" @click="openCreate">＋ 新建账本</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <Empty
        v-if="!loading && !items.length"
        icon="📚"
        title="还没有账本"
        description="创建一个账本开始记录你的财务"
      >
        <NButton type="primary" @click="openCreate">＋ 新建账本</NButton>
      </Empty>

      <template v-else>
        <!-- 活跃账本 -->
        <h3 class="section-title">活跃账本 <NTag :bordered="false" type="default" size="small">{{ activeLedgers.length }}</NTag></h3>
        <div class="grid">
          <NCard
            v-for="l in activeLedgers"
            :key="l.id"
            :bordered="true"
            size="small"
            class="ledger"
            :class="{ current: session.currentLedger?.id === Number(l.id) }"
            :style="{ '--ledger-color': l.color } as any"
          >
            <template #header>
              <div class="head">
                <span class="ico" :style="{ background: l.color }">{{ l.icon }}</span>
                <div class="meta">
                  <div class="title">
                    {{ l.name }}
                    <NTag v-if="session.currentLedger?.id === Number(l.id)" type="primary" size="small" :bordered="false">当前</NTag>
                    <NTag :bordered="false" size="small">{{ roleLabel(l.role) }}</NTag>
                  </div>
                  <div class="sub">
                    <span>{{ kindLabel(l.kind) }}</span>
                    <span class="dot">·</span>
                    <span>{{ l.currency }}</span>
                  </div>
                </div>
              </div>
            </template>
            <div class="stats-row">
              <div class="stat">
                <div class="num">{{ l.txn_count || 0 }}</div>
                <div class="lbl">笔记录</div>
              </div>
              <div class="stat">
                <div class="num">{{ l.member_count || 0 }}</div>
                <div class="lbl">位成员</div>
              </div>
              <div class="stat">
                <div class="num">{{ l.account_count || 0 }}</div>
                <div class="lbl">个账户</div>
              </div>
            </div>
            <div v-if="l.note" class="note">{{ l.note }}</div>
            <div class="actions">
              <NButton v-if="session.currentLedger?.id !== Number(l.id) && !l.is_archived" size="tiny" type="primary" @click="onSwitch(l)">切换到该账本</NButton>
              <NButton size="tiny" @click="openEdit(l)">编辑</NButton>
              <NButton size="tiny" @click="onArchive(l)">归档</NButton>
              <NButton v-if="l.role === 'owner'" size="tiny" ghost type="error" @click="openDelete(l)">删除</NButton>
            </div>
          </NCard>
        </div>

        <!-- 已归档 -->
        <template v-if="archivedLedgers.length">
          <h3 class="section-title">已归档 <NTag :bordered="false" type="warning" size="small">{{ archivedLedgers.length }}</NTag></h3>
          <div class="grid archived">
            <NCard
              v-for="l in archivedLedgers"
              :key="l.id"
              :bordered="true"
              size="small"
              class="ledger archived-item"
              :style="{ '--ledger-color': l.color } as any"
            >
              <template #header>
                <div class="head">
                  <span class="ico" :style="{ background: l.color, opacity: .6 }">{{ l.icon }}</span>
                  <div class="meta">
                    <div class="title">
                      {{ l.name }}
                      <NTag :bordered="false" size="small" type="warning">已归档</NTag>
                      <NTag v-if="session.currentLedger?.id === Number(l.id)" type="primary" size="small" :bordered="false">当前</NTag>
                      <NTag :bordered="false" size="small">{{ roleLabel(l.role) }}</NTag>
                    </div>
                    <div class="sub">
                      <span>{{ kindLabel(l.kind) }}</span>
                      <span class="dot">·</span>
                      <span>{{ l.currency }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <div class="stats-row">
                <div class="stat">
                  <div class="num">{{ l.txn_count || 0 }}</div>
                  <div class="lbl">笔记录</div>
                </div>
                <div class="stat">
                  <div class="num">{{ l.member_count || 0 }}</div>
                  <div class="lbl">位成员</div>
                </div>
                <div class="stat">
                  <div class="num">{{ l.account_count || 0 }}</div>
                  <div class="lbl">个账户</div>
                </div>
              </div>
              <div v-if="l.note" class="note">{{ l.note }}</div>
              <div class="actions">
                <NButton size="tiny" type="primary" @click="onArchive(l)">取消归档</NButton>
                <NButton size="tiny" @click="openEdit(l)">编辑</NButton>
                <NButton v-if="l.role === 'owner'" size="tiny" ghost type="error" @click="openDelete(l)">删除</NButton>
              </div>
            </NCard>
          </div>
        </template>
      </template>
    </NSpin>

    <!-- 抽屉 -->
    <NDrawer v-model:show="drawerOpen" :width="420" placement="right">
      <NDrawerContent :title="editing ? '编辑账本' : '新建账本'" :native-scrollbar="false">
        <NForm label-placement="top" :model="form">
          <NFormItem label="账本名称" required>
            <NInput v-model:value="form.name" maxlength="30" show-count placeholder="例如：家庭账本 / 2026 装修" />
          </NFormItem>
          <NFormItem label="用途">
            <NRadioGroup v-model:value="form.kind">
              <NSpace size="small" :wrap="true">
                <NRadio v-for="o in kindOptions" :key="o.value" :value="o.value">{{ o.label }}</NRadio>
              </NSpace>
            </NRadioGroup>
          </NFormItem>
          <NGrid :cols="2" :x-gap="12">
            <NGridItem>
              <NFormItem label="图标">
                <NInput v-model:value="form.icon" placeholder="📒" />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem label="币种">
                <NSelect v-model:value="form.currency" :options="currencyOptions" />
              </NFormItem>
            </NGridItem>
          </NGrid>
          <NFormItem label="颜色">
            <NColorPicker
              v-model:value="form.color"
              :modes="['hex']"
              :show-alpha="false"
              :swatches="colorPresets"
              @update:value="colorTouched = true"
            />
            <NText depth="3" class="hint">&nbsp;默认按账本名自动配色</NText>
          </NFormItem>
          <NFormItem v-if="!editing" label="默认账户">
            <NSwitch v-model:value="form.with_default_accounts" />
            <NText depth="3" class="hint">&nbsp;自动创建默认账户（现金 / 支付宝 / 微信 / 银行卡 / 信用卡）</NText>
          </NFormItem>
          <NFormItem label="备注">
            <NInput v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="可选" />
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

    <!-- 删除确认 -->
    <NDrawer v-model:show="deleteOpen" :width="380" placement="right">
      <NDrawerContent :title="`删除账本：${deleteTarget?.name}`" :native-scrollbar="false">
        <NAlert type="error" :show-icon="true" class="alert">
          <strong>这是不可逆操作！</strong> 删除账本将一并删除其下所有：
          <ul style="margin: 8px 0 0 16px; padding: 0; line-height: 1.7">
            <li>交易记录</li>
            <li>账户 / 分类 / 标签</li>
            <li>预算 / 周期 / 订阅 / 目标</li>
            <li>借贷台账</li>
            <li>账单截图附件</li>
            <li>成员关系</li>
          </ul>
        </NAlert>
        <NForm label-placement="top" :model="{ name: deleteConfirm }" style="margin-top: 12px">
          <NFormItem :label="`请输入账本名称「${deleteTarget?.name}」以确认`">
            <NInput v-model:value="deleteConfirm" placeholder="账本名称" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="deleteOpen = false">取消</NButton>
            <NButton
              type="error"
              :disabled="deleteConfirm !== deleteTarget?.name"
              @click="onDelete"
            >
              🗑️ 永久删除
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.section-title {
  font-size: 14px; margin: 8px 0 12px; display: flex; align-items: center; gap: 6px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.ledger {
  border-left: 4px solid var(--ledger-color, #3d6df5);
  transition: box-shadow .15s;
}
.ledger:hover { box-shadow: 0 4px 16px rgba(15, 22, 36, 0.08); }
.ledger.current { border-color: var(--hl-primary, #3d6df5); }
.ledger.archived-item { opacity: .7; }
.head { display: flex; align-items: center; gap: 10px; }
.ico {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; color: #fff;
}
.meta { flex: 1; min-width: 0; }
.title { font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.sub { font-size: 12px; color: var(--hl-muted); display: flex; gap: 4px; white-space: nowrap; }
.sub .dot { opacity: .5; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.stats-row {
  display: flex; gap: 8px; margin-top: 4px;
}
.stat { flex: 1; text-align: center; background: var(--hl-card-2, #f7f8fb); padding: 6px 0; border-radius: 6px; }
.stat .num { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stat .lbl { font-size: 11px; color: var(--hl-muted); margin-top: 2px; }
.note { font-size: 12px; color: var(--hl-muted); margin-top: 6px; }
.hint { font-size: 12px; }
.alert ul { color: var(--hl-text-2, #45516a); }
</style>
