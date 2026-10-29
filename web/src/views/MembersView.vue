<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NInput, NForm, NFormItem, NSelect,
  NPopconfirm, NDrawer, NDrawerContent, NDivider, NAlert, NSpin,
  NAvatar, NDataTable, useMessage, type DataTableColumns,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { initials } from '@/utils/format'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const members = ref<any[]>([])
const invites = ref<any[]>([])

const inviteOpen = ref(false)
const inviteForm = ref({ role: 'member', days: 7 })
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

// 老版邀请表单的角色文案（members.ejs「加入后的角色」）
const inviteRoleOptions = [
  { label: '成员（可记账）', value: 'member' },
  { label: '只读（只能看）', value: 'viewer' },
  { label: '管理员（可管理成员与设置）', value: 'admin' },
]
// 老版成员行内编辑的角色文案（members.ejs 成员行 select）
const editRoleOptions = [
  { label: '只读', value: 'viewer' },
  { label: '成员', value: 'member' },
  { label: '管理员', value: 'admin' },
]
// 老版有效期为固定四档（1 / 7 / 30 / 90 天）
const daysOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
]

const roleLabel: Record<string, string> = { owner: '拥有者', admin: '管理员', member: '成员', viewer: '只读' }
const roleTone: Record<string, any> = { owner: 'primary', admin: 'warning', member: 'success', viewer: 'default' }

function openInvite() {
  inviteForm.value = { role: 'member', days: 7 }
  lastInvite.value = null
  inviteOpen.value = true
}

async function doInvite() {
  inviting.value = true
  try {
    const r = await AdminApi.inviteMember({ role: inviteForm.value.role, days: inviteForm.value.days })
    lastInvite.value = r
    success(`邀请链接已生成（${inviteForm.value.days} 天内有效）`)
    load()
  } catch (e: any) {
    toastError(errorMessage(e, '生成失败'))
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
    // 后端 PATCH /admin/members/:id 的 :id 是 ledger_members 主键（老版同样传 m.id）
    await AdminApi.updateMember(Number(editing.value.id), {
      role: editRole.value,
      nickname: editNickname.value,
    })
    success('成员权限已更新')
    editOpen.value = false
    load()
  } catch (e: any) {
    toastError(errorMessage(e, '更新失败'))
  }
}

async function removeMember(m: any) {
  try {
    await AdminApi.removeMember(Number(m.id))
    success('成员已移出账本')
    load()
  } catch (e: any) {
    toastError(errorMessage(e, '操作失败'))
  }
}

async function revokeInvite(inv: any) {
  try {
    await AdminApi.revokeInvite(Number(inv.id))
    success('邀请码已吊销')
    load()
  } catch (e: any) {
    toastError(errorMessage(e, '操作失败'))
  }
}

/**
 * 邀请是否过期
 * 老版用字符串比较（i.expires_at >= today），当天到期的邀请仍算有效；
 * 这里若用 new Date() 解析 'YYYY-MM-DD' 会按 UTC 零点算，当天上午即误判过期，
 * 故同样走字符串比较
 */
function isExpired(inv: any) {
  if (!inv.expires_at) return false
  const today = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  return String(inv.expires_at).slice(0, 10) < todayStr
}

const fmtDateTime = (d?: string | null) => (d ? String(d).slice(0, 16) : '')

const memberColumns = computed<DataTableColumns>(() => {
  const cols: DataTableColumns = [
    {
      title: '成员', key: 'user', render: (m: any) => h(NSpace, { size: 'small', align: 'center' }, {
        default: () => [
          h(NAvatar, { round: true, size: 28, color: m.avatar_color || '#3d6df5' }, {
            default: () => initials(m.display_name || m.username),
          }),
          h('div', { class: 'col-info' }, [
            h('div', { class: 'col-name' }, [
              // 老版：昵称优先，其次显示名（nickname || display_name）
              h('span', null, m.nickname || m.display_name || m.username),
              // 老版：本人标记
              Number(m.user_id) === Number(session.user?.id)
                ? h(NTag, { size: 'tiny', bordered: false, type: 'default' }, { default: () => '我' })
                : null,
            ]),
            h(NText, { depth: 3, class: 'col-sub' }, {
              default: () =>
                `@${m.username}` +
                (m.last_login_at ? ` · 最近登录 ${fmtDateTime(m.last_login_at)}` : ''),
            }),
          ]),
        ],
      }),
    },
    { title: '角色', key: 'role', width: 100, render: (m: any) => h(NTag, { type: roleTone[m.role] || 'default', size: 'small', bordered: false }, { default: () => roleLabel[m.role] || m.role }) },
    { title: '本月 N 笔', key: 'stat.cnt', width: 100, align: 'right' },
    {
      // 老版：支出恒用红色（.amount.expense），不受正负号影响
      title: '本月支出', key: 'stat.expense', width: 120, align: 'right',
      render: (m: any) => h(AmountDisplay, { cents: m.stat?.expense || 0, tone: 'expense' }),
    },
    {
      title: '本月收入', key: 'stat.income', width: 120, align: 'right',
      render: (m: any) => h(AmountDisplay, { cents: m.stat?.income || 0, tone: 'income' }),
    },
  ]
  // 老版：管理操作仅在 canManage 时渲染
  if (session.canManage) {
    cols.push({
      title: '操作', key: 'op', width: 160, fixed: 'right' as const,
      render: (m: any) => h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'tiny', quaternary: true, onClick: () => openEdit(m), disabled: m.role === 'owner' }, { default: () => '编辑' }),
          h(NPopconfirm, { onPositiveClick: () => removeMember(m), positiveText: '移出账本', negativeText: '取消' }, {
            trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error', disabled: m.role === 'owner' }, { default: () => '移出账本' }),
            default: () => `把 ${m.nickname || m.display_name || m.username} 移出该账本？`,
          }),
        ],
      }),
    })
  }
  return cols
})

const inviteColumns = computed<DataTableColumns>(() => [
  {
    title: '邀请码', key: 'code',
    render: (inv: any) => h('code', { class: 'mono' }, inv.code?.slice(0, 12) + '…'),
  },
  {
    title: '链接', key: 'url',
    render: (inv: any) => h('code', { class: 'mono' }, `/join/${inv.code}`),
  },
  { title: '角色', key: 'role', width: 100, render: (inv: any) => h(NTag, { type: 'warning', size: 'small', bordered: false }, { default: () => roleLabel[inv.role] || inv.role }) },
  { title: '创建人', key: 'creator', width: 120, render: (inv: any) => inv.creator || '—' },
  { title: '有效期至', key: 'expires_at', width: 130, render: (inv: any) => h(NText, { depth: isExpired(inv) ? 1 : 3, type: isExpired(inv) ? 'error' : undefined }, { default: () => inv.expires_at || '不限' }) },
  {
    title: '状态', key: 'used', width: 90,
    render: (inv: any) => inv.used_by
      ? h(NTag, { size: 'small', bordered: false, type: 'success' }, { default: () => '已使用' })
      : h(NTag, { size: 'small', bordered: false }, { default: () => '未使用' }),
  },
  {
    title: '操作', key: 'op', width: 150, fixed: 'right' as const,
    render: (inv: any) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', quaternary: true, onClick: () => copy(`${window.location.origin}/join/${inv.code}`), disabled: !!inv.used_by }, { default: () => '复制链接' }),
        h(NPopconfirm, { onPositiveClick: () => revokeInvite(inv), positiveText: '吊销', negativeText: '取消' }, {
          trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error', disabled: !!inv.used_by || isExpired(inv) }, { default: () => '吊销' }),
          default: () => '吊销该邀请码？持有链接的人将无法再加入。',
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
      只有账本管理员或拥有者可以邀请成员。
    </NAlert>

    <NSpin :show="loading">
      <!-- 成员列表 -->
      <NCard :bordered="true" class="card" title="成员列表">
        <template #header-extra>
          <NText depth="3" class="hint">本月记账情况</NText>
        </template>
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

      <!-- 邀请记录（仅管理员可见） -->
      <NCard v-if="session.canManage" :bordered="true" class="card invites" title="邀请记录">
        <template #header-extra>
          <NSpace :size="8">
            <NText depth="3" class="hint">仅管理员可见</NText>
            <NTag :bordered="false" size="small">{{ invites.length }} 条</NTag>
          </NSpace>
        </template>
        <Empty v-if="!loading && !invites.length" icon="🎫" title="暂无邀请" description="点击右上角生成一个新邀请码" />
        <NDataTable
          v-else
          :columns="inviteColumns"
          :data="invites"
          :pagination="false"
          :bordered="false"
          size="small"
        />
      </NCard>

      <!-- 角色权限说明 -->
      <NCard :bordered="true" class="card" title="角色权限说明">
        <div class="roles">
          <div class="role-row">
            <NTag type="primary" size="small" :bordered="false">拥有者</NTag>
            <span>全部权限，可删除账本</span>
          </div>
          <div class="role-row">
            <NTag size="small" :bordered="false">管理员</NTag>
            <span>可管理成员、账本设置、导入导出</span>
          </div>
          <div class="role-row">
            <NTag size="small" :bordered="false">成员</NTag>
            <span>可记账、编辑自己的记录、查看统计</span>
          </div>
          <div class="role-row">
            <NTag size="small" :bordered="false">只读</NTag>
            <span>只能浏览与导出，不能修改</span>
          </div>
        </div>
      </NCard>
    </NSpin>

    <!-- 邀请抽屉 -->
    <NDrawer v-model:show="inviteOpen" :width="420" placement="right">
      <NDrawerContent title="生成邀请码" :native-scrollbar="false">
        <NForm label-placement="top" :model="inviteForm">
          <NFormItem label="加入后的角色">
            <NSelect v-model:value="inviteForm.role" :options="inviteRoleOptions" />
          </NFormItem>
          <NFormItem label="有效期">
            <NSelect v-model:value="inviteForm.days" :options="daysOptions" />
          </NFormItem>
          <NButton type="primary" :loading="inviting" block @click="doInvite">
            生成邀请链接
          </NButton>
          <NAlert type="info" :show-icon="true" class="drawer-tip">
            生成后把链接发给家人/同事，对方注册或登录后打开链接即可加入该账本。
          </NAlert>
        </NForm>
        <NDivider />
        <div v-if="lastInvite" class="result">
          <h3>已生成 🎉</h3>
          <div class="result-row">
            <NText depth="3" class="label">邀请码</NText>
            <div class="code-row">
              <code class="mono code-box">{{ lastInvite.code }}</code>
              <NButton size="small" @click="copy(lastInvite.code)">复制</NButton>
            </div>
          </div>
          <div class="result-row">
            <NText depth="3" class="label">链接</NText>
            <div class="code-row">
              <code class="mono code-box">{{ lastInvite.invite_url }}</code>
              <NButton size="small" @click="copy(lastInvite.invite_url)">复制</NButton>
            </div>
          </div>
          <div class="result-row">
            <NText depth="3" class="label">有效期至</NText>
            <NText>{{ lastInvite.expires_at }}</NText>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 编辑成员 -->
    <NDrawer v-model:show="editOpen" :width="380" placement="right">
      <NDrawerContent :title="`编辑：${editing?.nickname || editing?.display_name || editing?.username || ''}`" :native-scrollbar="false">
        <NForm label-placement="top" :model="{ role: editRole }">
          <NFormItem label="角色">
            <NSelect v-model:value="editRole" :options="editRoleOptions" />
          </NFormItem>
          <NFormItem label="账本内昵称">
            <NInput v-model:value="editNickname" maxlength="20" placeholder="账本内昵称" />
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
.drawer-tip { margin-top: 12px; }
/* 以下三类由 NDataTable 列 render 内部 h() 创建，scoped 属性不会附加，
   需用 :deep() 才能命中 */
:deep(.col-info) { display: flex; flex-direction: column; }
:deep(.col-name) { font-size: 13px; display: flex; align-items: center; gap: 6px; }
:deep(.col-sub) { font-size: 11px; }
.mono { font-family: v-mono, SFMono-Regular, Menlo, Consolas, monospace; }
:deep(.mono) { font-family: v-mono, SFMono-Regular, Menlo, Consolas, monospace; }
.code-box {
  flex: 1; font-size: 12px; padding: 6px 8px; word-break: break-all;
  background: var(--hl-card-2, #f7f8fb); border-radius: 4px;
}
.roles { line-height: 2; }
.role-row { display: flex; align-items: center; gap: 10px; }
.role-row span { font-size: 13px; color: var(--hl-text-2, #555); }

.result { padding: 0 4px; }
.result h3 { margin: 0 0 12px; }
.result-row { margin-bottom: 12px; }
.result-row .label { display: block; font-size: 12px; margin-bottom: 4px; }
.code-row { display: flex; align-items: center; gap: 8px; }
</style>
