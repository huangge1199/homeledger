<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useRoute, useRouter, RouterView, RouterLink } from 'vue-router'
import {
  NLayout, NLayoutHeader, NLayoutSider, NLayoutContent, NMenu, NButton, NIcon,
  NDropdown, NAvatar, NSpace, NText, NTag, type MenuOption, type DropdownOption,
} from 'naive-ui'
import { useSessionStore } from '@/stores/session'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const collapsed = ref(false)
const drawerOpen = ref(false)
const userMenuOpen = ref(false)
const { success, error: toastError } = useFlash()

function renderIcon(emoji: string) {
  return () => h('span', { class: 'nav-emoji' }, emoji)
}

const menuOptions = computed<MenuOption[]>(() => {
  const items: MenuOption[] = [
    {
      key: 'g-bookkeeping', type: 'group', children: [
        { key: '/',            label: () => h(RouterLink, { to: '/' }, { default: () => '总览' }) },
        ...(session.canWrite
          ? [{ key: '/transactions/new', label: () => h(RouterLink, { to: '/transactions/new' }, { default: () => '记一笔' }) }]
          : []),
        { key: '/transactions', label: () => h(RouterLink, { to: '/transactions' }, { default: () => '账单明细' }) },
        { key: '/calendar',     label: () => h(RouterLink, { to: '/calendar' }, { default: () => '记账日历' }) },
        ...(session.aiUsable
          ? [{ key: '/ai', label: () => h(RouterLink, { to: '/ai' }, { default: () => 'AI 截图记账' }) }]
          : []),
      ],
    },
    {
      key: 'g-analytics', type: 'group', children: [
        { key: '/reports', label: () => h(RouterLink, { to: '/reports' }, { default: () => '报表分析' }) },
        { key: '/search',  label: () => h(RouterLink, { to: '/search' }, { default: () => '搜索筛选' }) },
      ],
    },
    {
      key: 'g-assets', type: 'group', children: [
        { key: '/accounts',      label: () => h(RouterLink, { to: '/accounts' }, { default: () => '账户管理' }) },
        { key: '/budgets',       label: () => h(RouterLink, { to: '/budgets' }, { default: () => '预算管理' }) },
        { key: '/recurring',     label: () => h(RouterLink, { to: '/recurring' }, { default: () => '周期账单' }) },
        { key: '/subscriptions', label: () => h(RouterLink, { to: '/subscriptions' }, { default: () => '订阅扣费' }) },
        { key: '/debts',         label: () => h(RouterLink, { to: '/debts' }, { default: () => '借贷台账' }) },
        { key: '/goals',         label: () => h(RouterLink, { to: '/goals' }, { default: () => '储蓄目标' }) },
      ],
    },
    {
      key: 'g-data', type: 'group', children: [
        { key: '/categories', label: () => h(RouterLink, { to: '/categories' }, { default: () => '分类管理' }) },
        { key: '/tags',       label: () => h(RouterLink, { to: '/tags' }, { default: () => '标签管理' }) },
        ...(session.canWrite
          ? [{ key: '/import', label: () => h(RouterLink, { to: '/import' }, { default: () => '账单导入' }) }]
          : []),
        { key: '/export', label: () => h(RouterLink, { to: '/export' }, { default: () => '导出备份' }) },
      ],
    },
    {
      key: 'g-system', type: 'group', children: [
        { key: '/ledgers',       label: () => h(RouterLink, { to: '/ledgers' }, { default: () => '账本管理' }) },
        ...(session.canManage
          ? [{ key: '/members', label: () => h(RouterLink, { to: '/members' }, { default: () => '成员权限' }) }]
          : []),
        { key: '/notifications', label: () => h(RouterLink, { to: '/notifications' }, { default: () => '通知中心' }) },
        { key: '/settings',      label: () => h(RouterLink, { to: '/settings' }, { default: () => '设置' }) },
        { key: '/about',         label: () => h(RouterLink, { to: '/about' }, { default: () => '关于' }) },
      ],
    },
  ]
  return items
})

const activeKey = computed(() => {
  const p = route.path
  if (p === '/') return '/'
  // 取最长前缀匹配
  const candidates = menuOptions.value.flatMap((g) => g.type === 'group' ? (g.children || []).map((c) => c.key as string) : [])
  return candidates.filter((k) => k !== '/' && p.startsWith(k)).sort((a, b) => b.length - a.length)[0] || p
})

const pageTitle = computed(() => (route.meta?.title as string) || '')

// 账本切换选项
const ledgerOptions = computed(() => session.ledgers.map((l) => ({
  label: () => h('span', { class: 'ledger-opt' }, [
    h('span', { class: 'lo-ico' }, l.icon || '📒'),
    h('span', { class: 'lo-name' }, l.name),
    l.isArchived ? h('span', { class: 'lo-tag' }, '归档') : null,
  ]),
  key: l.id,
})))

async function pickLedger(id: number | string) {
  if (typeof id !== 'number' || !session.currentLedger || id === session.currentLedger.id) return
  try {
    await session.switchLedger(id)
    success(`已切换到「${session.currentLedger?.name}」`)
    // 触发路由刷新：当前页重新拉数据
    router.replace({ path: '/redirect' + route.fullPath }).catch(() => router.go(0))
  } catch (e) {
    toastError(errorMessage(e, '切换账本失败'))
  }
}

// 主题切换
async function toggleTheme() {
  const next = session.theme === 'dark' ? 'light' : 'dark'
  session.setTheme(next)
  try {
    const { AdminApi } = await import('@/api/modules')
    await AdminApi.setTheme(next)
  } catch { /* 离线时也保留本地主题 */ }
}

// 用户菜单
const userMenuOptions = computed<DropdownOption[]>(() => [
  { key: 'profile', label: '个人资料' },
  { key: 'settings', label: '设置' },
  { key: 'theme', label: session.theme === 'dark' ? '切换为亮色' : '切换为暗色' },
  { type: 'divider', key: 'd1' },
  { key: 'logout', label: '退出登录' },
])

async function onUserMenu(key: string | number) {
  if (key === 'profile') return router.push('/settings?tab=profile')
  if (key === 'settings') return router.push('/settings')
  if (key === 'theme') return toggleTheme()
  if (key === 'logout') {
    try { await session.logout() } catch { /* ignore */ }
    router.push('/login')
  }
}

function avatarUrl(): string | undefined {
  const u = session.user
  if (!u) return undefined
  // 头像 URL 通过后端附件返回；这里只展示首字母 + 颜色
  return u.avatarUrl
}

watch(() => route.path, () => { drawerOpen.value = false })
</script>

<template>
  <NLayout has-sider position="absolute" class="hl-app">
    <!-- 桌面侧栏 -->
    <NLayoutSider
      bordered
      :collapsed="collapsed"
      :collapsed-width="64"
      :width="232"
      collapse-mode="width"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
      class="hl-sider"
    >
      <div class="brand">
        <span class="logo">📒</span>
        <span v-if="!collapsed" class="name">{{ session.siteName }}</span>
      </div>

      <NMenu
        v-if="session.currentLedger"
        :options="menuOptions"
        :value="activeKey"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :indent="18"
        :root-indent="0"
        class="hl-menu"
      />

      <div class="sider-foot" v-if="!collapsed && session.user">
        <NDropdown
          trigger="click"
          :options="ledgerOptions"
          @select="pickLedger"
        >
          <NButton quaternary size="small" class="ledger-btn" :title="session.currentLedger?.name">
            <span class="lo-ico">{{ session.currentLedger?.icon || '📒' }}</span>
            <span class="lo-name ellipsis">{{ session.currentLedger?.name || '选择账本' }}</span>
            <span class="caret">▾</span>
          </NButton>
        </NDropdown>
      </div>
    </NLayoutSider>

    <NLayout>
      <NLayoutHeader bordered class="hl-topbar">
        <div class="left">
          <button class="burger" aria-label="打开菜单" @click="drawerOpen = true">
            <span class="bar"></span><span class="bar"></span><span class="bar"></span>
          </button>
          <div class="title">
            <h1>{{ pageTitle || '家账簿' }}</h1>
          </div>
        </div>
        <div class="right">
          <NButton quaternary size="small" @click="toggleTheme" :title="session.theme === 'dark' ? '切换亮色' : '切换暗色'">
            <span style="font-size: 16px">{{ session.theme === 'dark' ? '☀️' : '🌙' }}</span>
          </NButton>
          <NButton quaternary size="small" @click="router.push('/search')" title="搜索">
            <span style="font-size: 16px">🔍</span>
          </NButton>
          <NButton
            v-if="session.canWrite"
            type="primary"
            size="small"
            @click="router.push('/transactions/new')"
          >
            <span style="font-size: 14px">＋</span>
            <span class="btn-label">记一笔</span>
          </NButton>
          <NDropdown :options="userMenuOptions" trigger="click" @select="onUserMenu">
            <div class="user-trigger">
              <NAvatar
                round
                :size="28"
                :src="avatarUrl()"
                :color="session.user?.avatarColor || '#3d6df5'"
                style="font-size: 12px; color: #fff; font-weight: 600"
              >
                {{ (session.user?.displayName || '?').slice(0, 1) }}
              </NAvatar>
              <span class="uname ellipsis">{{ session.user?.displayName }}</span>
              <span class="caret">▾</span>
            </div>
          </NDropdown>
        </div>
      </NLayoutHeader>

      <NLayoutContent class="hl-content">
        <RouterView />
      </NLayoutContent>
    </NLayout>

    <!-- 移动端抽屉 -->
    <div v-if="drawerOpen" class="drawer-mask" @click="drawerOpen = false" />
    <aside v-if="drawerOpen" class="drawer">
      <div class="brand">
        <span class="logo">📒</span>
        <span class="name">{{ session.siteName }}</span>
        <button class="close" @click="drawerOpen = false">×</button>
      </div>
      <NMenu
        :options="menuOptions"
        :value="activeKey"
        :indent="20"
      />
      <div class="drawer-foot" v-if="session.user">
        <NDropdown :options="ledgerOptions" trigger="click" @select="pickLedger">
          <NButton quaternary size="small" block>
            <span class="lo-ico">{{ session.currentLedger?.icon || '📒' }}</span>
            {{ session.currentLedger?.name || '选择账本' }}
          </NButton>
        </NDropdown>
      </div>
    </aside>
  </NLayout>
</template>

<style scoped>
.hl-app { min-height: 100vh; }
.hl-sider { background: var(--hl-card, #fff); }
.brand {
  display:flex; align-items:center; gap:8px;
  padding: 16px 18px; font-weight: 600; font-size: 15px;
  border-bottom: 1px solid var(--hl-border, #e6eaf1);
}
.brand .logo { font-size: 18px; }
.hl-menu { padding-bottom: 80px; }

.sider-foot {
  position: absolute; left: 0; right: 0; bottom: 12px;
  padding: 0 12px;
}
.ledger-btn {
  width: 100%;
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 8px;
  background: var(--hl-card-2, #f7f8fb);
}
.ledger-btn .caret { margin-left: auto; opacity: .6; }
.ledger-btn .lo-name { flex: 1; text-align: left; }

.hl-topbar {
  display: flex; align-items: center;
  padding: 0 20px;
  height: 58px;
  background: var(--hl-card, #fff);
}
.left  { display:flex; align-items:center; gap:12px; }
.right { margin-left: auto; display:flex; align-items:center; gap:8px; }
.title h1 { font-size: 16px; font-weight: 600; margin: 0; }

.burger { display:none; background:transparent; border:0; cursor:pointer; padding:6px; flex-direction:column; gap:4px; }
.burger .bar { display:block; width:18px; height:2px; background: var(--hl-text, #17202e); }

.user-trigger {
  display:flex; align-items:center; gap:6px;
  padding: 4px 8px 4px 4px;
  border-radius: 18px;
  cursor: pointer;
}
.user-trigger:hover { background: var(--hl-card-2, #f7f8fb); }
.user-trigger .uname { font-size: 13px; max-width: 100px; }
.user-trigger .caret { font-size: 10px; opacity: .6; }

.hl-content {
  padding: 20px;
  background: var(--hl-bg, #f3f5f9);
  min-height: calc(100vh - 58px);
}

.ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

@media (max-width: 768px) {
  .burger { display:flex; }
  .hl-sider { display: none; }
  .user-trigger .uname { display: none; }
  .right .btn-label { display: none; }
}

.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 999;
}
.drawer {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: 260px;
  background: var(--hl-card, #fff);
  z-index: 1000;
  display: flex; flex-direction: column;
  box-shadow: 0 0 16px rgba(0,0,0,0.16);
}
.drawer .brand { padding: 16px 18px; display:flex; align-items:center; gap:8px; }
.drawer .close { margin-left: auto; background:transparent; border:0; font-size: 22px; cursor:pointer; }
.drawer-foot { padding: 12px; border-top: 1px solid var(--hl-border); }
</style>
