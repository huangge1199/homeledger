<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect, NInputNumber,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin, NGrid, NGridItem,
  NAvatar, NDataTable, useMessage, NCode, type DataTableColumns,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const members = ref<any[]>([])
const invites = ref<any[]>([])

const inviteOpen = ref(false)
const inviteForm = ref({ role: 'member', days: 7, max_uses: 1 })
const inviting = ref(false)
const lastInvite = ref<{ code: string; invite_url: string; expires_at: string } | null>(null)

const editOpen = ref(false)
const editing = ref<any>(null)
const editRole = ref('member')
const editNickname = ref('')

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await AdminApi.members()
    members.value = d.members || []
    invites.value = d.invites || []
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => session.currentLedger?.id, load)

const roleOptions = [
  { label: '👀 只读', value: 'viewer' },
  { label: '✏️ 成员（记账）', value: 'member' },
  { label: '🛡️ 管理员（管理成员）', value: 'admin' },
]
const roleLabel: Record<string, string> = { owner: '所有者', admin: '管理员', member: '成员', viewer: '只读' }
const roleTone: Record<string, any> = { owner: 'primary', admin: 'warning', member: 'success', viewer: 'default' }

function openInvite() {
  inviteForm.value = { role: 'member', days: 7, max_uses: 1 }
  lastInvite.value = null
  inviteOpen.value = true
}

async function doInvite() {
  inviting.value = true
  try {
    const r = await AdminApi.inviteMember({ role: inviteForm.value.role, days: inviteForm.value.days })
    lastInvite.value = r
    success('邀请已生成')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '生成失败')
  } finally {
    inviting.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    success('已复制到剪贴板')
  } catch {
    message.warning('请手动复制')
  }
}

function openEdit(m: any) {
  editing.value = m
  editRole.value = m.role
  editNickname.value = m.nickname || ''
  editOpen.value = true
}

async function doEdit() {
  if (!editing.value) return
  try {
    await AdminApi.updateMember(Number(editing.value.user_id), {
      role: editRole.value,
      nickname: editNickname.value,
    })
    success('已更新')
    editOpen.value = false
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '更新失败')
  }
}

async function removeMember(m: any) {
  try {
    await AdminApi.removeMember(Number(m.user_id))
    success('已移出')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '操作失败')
  }
}

async function revokeInvite(inv: any) {
  try {
    await AdminApi.revokeInvite(Number(inv.id))
    success('已吊销')
    load()
  } catch (e: any) {
    toastError(e?.response?.data?.error || e?.message || '操作失败')
  }
}

function isExpired(inv: any) {
  return inv.expires_at && new Date(inv.expires_at) < new Date()
}

const memberColumns = computed<DataTableColumns>(() => [
  {
    title: '成员', key: 'user', render: (m: any) => h(NSpace, { size: 'small', align: 'center' }, {
      default: () => [
        h(NAvatar, { round: true, size: 28, color: m.color || '#3d6df5' }, { default: () => (m.display_name || m.username || '?').slice(0, 1) }),
        h('div', { class: 'col-info' }, [
          h('div', { class: 'col-name' }, m.display_name || m.username),
          h(NText, { depth: 3, class: 'col-sub' }, { default: () => `@${m.username}` }),
        ]),
      ],
    }),
  },
  { title: '角色', key: 'role', width: 100, render: (m: any) => h(NTag, { type: roleTone[m.role] || 'default', size: 'small', bordered: false }, { default: () => roleLabel[m.role] || m.role }) },
  { title: '本月交易', key: 'stat.cnt', width: 90, align: 'right' },
  {
    title: '本月支出', key: 'stat.expense', width: 120, align: 'right',
    render: (m: any) => h(AmountDisplay, { cents: m.stat?.expense || 0 }),
  },
  {
    title: '本月收入', key: 'stat.income', width: 120, align: 'right',
    render: (m: any) => h(AmountDisplay, { cents: m.stat?.income || 0 }),
  },
  {
    title: '操作', key: 'op', width: 160, fixed: 'right' as const,
    render: (m: any) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', quaternary: true, onClick: () => openEdit(m), disabled: m.role === 'owner' }, { default: () => '编辑' }),
        h(NPopconfirm, { onPositiveClick: () => removeMember(m), positiveText: '移出', negativeText: '取消' }, {
          trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error', disabled: m.role === 'owner' }, { default: () => '移出' }),
          default: () => `确定把「${m.display_name || m.username}」移出此账本？`,
        }),
      ],
    }),
  },
])

const inviteColumns = computed<DataTableColumns>(() => [
  { title: '邀请码', key: 'code', render: (inv: any) => h(NCode, { code: inv.code, style: 'background: transparent; padding: 0; font-size: 12px' }, { default: () => inv.code }) },
  { title: '角色', key: 'role', width: 100, render: (inv: any) => h(NTag, { type: 'warning', size: 'small', bordered: false }, { default: () => roleLabel[inv.role] || inv.role }) },
  { title: '创建人', key: 'creator', width: 120, render: (inv: any) => inv.creator || '-' },
  { title: '过期', key: 'expires_at', width: 110, render: (inv: any) => h(NText, { depth: isExpired(inv) ? 1 : 3, type: isExpired(inv) ? 'error' : undefined }, { default: () => inv.expires_at || '永不过期' }) },
  { title: '已用', key: 'used', width: 60, render: (inv: any) => inv.used_by ? '✅' : '—' },
  {
    title: '操作', key: 'op', width: 130, fixed: 'right' as const,
    render: (inv: any) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', quaternary: true, onClick: () => copy(`${window.location.origin}/join/${inv.code}`), disabled: inv.used_by }, { default: () => '复制链接' }),
        h(NPopconfirm, { onPositiveClick: () => revokeInvite(inv), positiveText: '吊销', negativeText: '取消' }, {
          trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error', disabled: !!inv.used_by }, { default: () => '吊销' }),
          default: () => '吊销该邀请码？已使用的不可吊销。',
        }),
      ],
    }),
  },
])
</script>

<template>
  <AppShell>
    <PageHead :title="`成员权限 · ${session.currentLedger?.name || ''}`" sub="邀请他人加入账本，分权限管理">
      <template #actions>
        <NButton v-if="session.canManage" type="primary" @click="openInvite">＋ 生成邀请码</NButton>
        <NText v-else depth="3" class="hint">需要管理员权限</NText>
      </template>
    </PageHead>

    <NAlert v-if="!session.canManage" type="info" :show-icon="true" class="alert">
      你不是该账本的管理员，无法邀请/修改成员。
    </NAlert>

    <NSpin :show="loading">
      <!-- 成员列表 -->
      <NCard :bordered="true" class="card" title="成员">
        <Empty v-if="!loading && !members.length" icon="👥" title="还没有成员" />
        <NDataTable
          v-else
          :columns="memberColumns"
          :data="members"
          :pagination="false"
          :bordered="false"
          size="small"
          :max-height="500"
        />
      </NCard>

      <!-- 邀请码 -->
      <NCard :bordered="true" class="card invites" title="邀请码">
        <template #header-extra>
          <NTag :bordered="false" size="small">{{ invites.length }} 条</NTag>
        </template>
        <Empty v-if="!loading && !invites.length" icon="🎫" title="没有邀请码" description="点击右上角生成一个新邀请码" />
        <NDataTable
          v-else
          :columns="inviteColumns"
          :data="invites"
          :pagination="false"
          :bordered="false"
          size="small"
        />
      </NCard>
    </NSpin>

    <!-- 邀请抽屉 -->
    <NDrawer v-model:show="inviteOpen" :width="420" placement="right">
      <NDrawerContent title="生成邀请码" :native-scrollbar="false">
        <NForm label-placement="top" :model="inviteForm">
          <NFormItem label="角色">
            <NSelect v-model:value="inviteForm.role" :options="roleOptions" />
          </NFormItem>
          <NFormItem label="有效期（天）">
            <NInputNumber v-model:value="inviteForm.days" :min="1" :max="90" style="width: 100%" />
            <NText depth="3" class="hint">&nbsp;1~90 天后过期</NText>
          </NFormItem>
          <NAlert type="info" :show-icon="true">
            生成后复制链接发给对方，对方打开链接即可加入。
          </NAlert>
          <NButton type="primary" :loading="inviting" block @click="doInvite" style="margin-top: 12px">
            生成邀请码
          </NButton>
        </NForm>
        <NDivider />
        <div v-if="lastInvite" class="result">
          <h3>已生成 🎉</h3>
          <div class="result-row">
            <NText depth="3" class="label">邀请码</NText>
            <div class="code-row">
              <NCode :code="lastInvite.code" style="flex: 1; background: var(--hl-card-2, #f7f8fb); font-size: 14px; padding: 6px 8px" />
              <NButton size="small" @click="copy(lastInvite.code)">复制</NButton>
            </div>
          </div>
          <div class="result-row">
            <NText depth="3" class="label">链接</NText>
            <div class="code-row">
              <NCode :code="lastInvite.invite_url" style="flex: 1; background: var(--hl-card-2, #f7f8fb); font-size: 12px; padding: 6px 8px; word-break: break-all" />
              <NButton size="small" @click="copy(lastInvite.invite_url)">复制</NButton>
            </div>
          </div>
          <div class="result-row">
            <NText depth="3" class="label">过期</NText>
            <NText>{{ lastInvite.expires_at }}</NText>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 编辑成员 -->
    <NDrawer v-model:show="editOpen" :width="380" placement="right">
      <NDrawerContent :title="`编辑：${editing?.display_name || editing?.username || ''}`" :native-scrollbar="false">
        <NForm label-placement="top" :model="{ role: editRole }">
          <NFormItem label="角色">
            <NSelect v-model:value="editRole" :options="roleOptions" />
          </NFormItem>
          <NFormItem label="昵称（仅显示）">
            <NInput v-model:value="editNickname" maxlength="20" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="editOpen = false">取消</NButton>
            <NButton type="primary" @click="doEdit">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </AppShell>
</template>

<style scoped>
.hint { font-size: 12px; }
.alert { margin-bottom: 12px; }
.card { margin-bottom: 12px; }
.invites { margin-bottom: 12px; }
.col-info { display: flex; flex-direction: column; }
.col-name { font-size: 13px; }
.col-sub { font-size: 11px; }

.result { padding: 0 4px; }
.result h3 { margin: 0 0 12px; }
.result-row { margin-bottom: 12px; }
.result-row .label { display: block; font-size: 12px; margin-bottom: 4px; }
.code-row { display: flex; align-items: center; gap: 8px; }
</style>
