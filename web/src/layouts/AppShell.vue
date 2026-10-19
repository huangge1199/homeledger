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
import { AdminApi } from '@/api/modules'
import AiPanel from '@/components/AiPanel.vue'

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

/** 通知中心菜单项：右侧未读数徽标（对齐旧版 layout.ejs .count） */
function renderNavLabel(item: { key: string; label: string }) {
  return () =>
    h('span', { class: 'nav-label-row' }, [
      h(RouterLink, { to: item.key }, { default: () => item.label }),
      session.unreadCount > 0
        ? h('span', { class: 'nav-count' }, session.unreadCount > 99 ? '99+' : String(session.unreadCount))
        : null,
    ])
}

/** 侧栏导航结构（与旧版一致：分组名 + 图标 + 文字） */
const NAV_GROUPS: Array<{
  label: string
  items: Array<{ key: string; label: string; icon: string; need?: 'write' | 'manage' }>
}> = [
  {
    label: '记账',
    items: [
      { key: '/', label: '总览', icon: '🏠' },
      { key: '/transactions/new', label: '记一笔', icon: '✏️', need: 'write' },
      { key: '/transactions', label: '账单明细', icon: '📋' },
      { key: '/calendar', label: '记账日历', icon: '📅' },
      // 旧版 AI 入口无条件展示（未配置模型时页面内提示"规则解析"）
      { key: '/ai', label: 'AI 截图记账', icon: '🤖' },
    ],
  },
  {
    label: '分析',
    items: [
      { key: '/reports', label: '报表分析', icon: '📊' },
      { key: '/search', label: '搜索筛选', icon: '🔍' },
    ],
  },
  {
    label: '资产与计划',
    items: [
      { key: '/accounts', label: '账户管理', icon: '🏦' },
      { key: '/budgets', label: '预算管理', icon: '💰' },
      { key: '/recurring', label: '周期账单', icon: '🔁' },
      { key: '/subscriptions', label: '订阅扣费', icon: '🔔' },
      { key: '/debts', label: '借贷台账', icon: '🤝' },
      { key: '/goals', label: '储蓄目标', icon: '🎯' },
    ],
  },
  {
    label: '数据',
    items: [
      { key: '/categories', label: '分类管理', icon: '🗂️' },
      { key: '/tags', label: '标签管理', icon: '🏷️' },
      { key: '/import', label: '账单导入', icon: '📥', need: 'write' },
      { key: '/export', label: '导出备份', icon: '📤' },
    ],
  },
  {
    label: '协作与系统',
    items: [
      { key: '/ledgers', label: '账本管理', icon: '📚' },
      // 旧版成员页所有登录成员可见（页面内写操作才要求 manage 权限）
      { key: '/members', label: '成员权限', icon: '👥' },
      { key: '/notifications', label: '通知中心', icon: '🔔' },
      { key: '/settings', label: '设置', icon: '⚙️' },
      { key: '/about', label: '关于', icon: 'ℹ️' },
    ],
  },
]

const menuOptions = computed<MenuOption[]>(() =>
  NAV_GROUPS.map((g) => ({
    key: 'g-' + g.label,
    type: 'group' as const,
    label: g.label,
    children: g.items
      .filter((it) =>
        it.need === 'write' ? session.canWrite
        : it.need === 'manage' ? session.canManage
        : true)
      .map((it) => ({
        key: it.key,
        icon: renderIcon(it.icon),
        label: it.key === '/notifications'
          ? renderNavLabel(it)
          : () => h(RouterLink, { to: it.key }, { default: () => it.label }),
      })),
  }))
)

const activeKey = computed(() => {
  const p = route.path
  if (p === '/') return '/'
  // 取最长前缀匹配
  const candidates = menuOptions.value.flatMap((g) => g.type === 'group' ? (g.children || []).map((c) => c.key as string) : [])
  return candidates.filter((k) => k !== '/' && p.startsWith(k)).sort((a, b) => b.length - a.length)[0] || p
})

const pageTitle = computed(() => (route.meta?.title as string) || '')
// 注：老版 layout.ejs 的 topbar 同时渲染 title + sub；新版各页 PageHead 已自带 sub 文案，
// 按方案 A 副标题只在页面内显示，顶栏只保留标题，避免同一句话出现两次。

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

/** 点头像直接换头像（旧版全站通用，不进设置页）：点击不展开下拉 */
const avatarInput = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)

function openAvatarPicker(e: Event) {
  e.stopPropagation()
  avatarInput.value?.click()
}

async function onAvatarPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!/^image\//.test(f.type)) return toastError('请选择图片文件')
  if (f.size > 2 * 1024 * 1024) return toastError('头像请小于 2MB')
  uploadingAvatar.value = true
  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result || ''))
      fr.onerror = () => reject(new Error('读取失败'))
      fr.readAsDataURL(f)
    })
    await AdminApi.uploadAvatar(dataUrl)
    await session.refresh()
    success('头像已更新')
  } catch (err) {
    toastError(errorMessage(err, '上传失败'))
  } finally {
    uploadingAvatar.value = false
  }
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

      <!-- 当前账本切换器（旧版位置：brand 下方、菜单上方） -->
      <div v-if="session.user" class="ledger-switch">
        <div v-if="!collapsed" class="ledger-label">当前账本</div>
        <NDropdown trigger="click" :options="ledgerOptions" @select="pickLedger">
          <button class="ledger-btn" :title="session.currentLedger?.name" type="button">
            <span class="lo-ico">{{ session.currentLedger?.icon || '📒' }}</span>
            <span v-if="!collapsed" class="lo-name ellipsis">{{ session.currentLedger?.name || '选择账本' }}</span>
            <span v-if="!collapsed" class="caret">▾</span>
          </button>
        </NDropdown>
      </div>

      <div class="menu-scroll">
        <NMenu
          v-if="session.currentLedger"
          :options="menuOptions"
          :value="activeKey"
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="20"
          :indent="10"
          :root-indent="0"
          :item-height="38"
          class="hl-menu"
        />
      </div>

      <!-- 侧栏底部（旧版 sidebar-foot：主题切换 + 用户名） -->
      <div class="sider-foot" :class="{ collapsed }">
        <button
          class="foot-btn"
          type="button"
          :title="session.theme === 'dark' ? '切换亮色' : '切换暗色'"
          :aria-label="'切换主题'"
          @click="toggleTheme"
        >
          {{ session.theme === 'dark' ? '☀️' : '🌙' }}
        </button>
        <span v-if="!collapsed && session.user" class="foot-user ellipsis">@{{ session.user.username }}</span>
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
              <span
                class="avatar-pick"
                :class="{ busy: uploadingAvatar }"
                title="点击更换头像"
                aria-label="点击更换头像"
                @click="openAvatarPicker"
              >
                <NAvatar
                  round
                  :size="28"
                  :src="avatarUrl()"
                  :color="session.user?.avatarColor || '#3d6df5'"
                  style="font-size: 12px; color: #fff; font-weight: 600"
                >
                  {{ (session.user?.displayName || '?').slice(0, 1) }}
                </NAvatar>
              </span>
              <span class="uname ellipsis">{{ session.user?.displayName }}</span>
              <span class="caret">▾</span>
            </div>
          </NDropdown>
          <input
            ref="avatarInput"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            @change="onAvatarPicked"
          />
        </div>
      </NLayoutHeader>

      <NLayoutContent class="hl-content">
        <!-- 空账本引导态（对齐旧版 no-ledger.ejs） -->
        <div v-if="!session.currentLedger" class="no-ledger">
          <div class="card">
            <div class="empty">
              <span class="big">📚</span>
              <h1>还没有账本</h1>
              <p class="muted">账本是账目的容器，你可以为家庭、旅行、生意分别建一个。</p>
            </div>
            <div class="cta">
              <NButton type="primary" size="large" @click="router.push('/ledgers')">去创建账本</NButton>
            </div>
          </div>
        </div>
        <RouterView v-else />
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

    <!-- 移动端底部导航（对齐旧版 layout.ejs .mobile-nav） -->
    <nav v-if="session.currentLedger" class="mobile-nav">
      <RouterLink to="/" :class="{ active: route.path === '/' }">
        <span class="mi">🏠</span>总览
      </RouterLink>
      <RouterLink to="/transactions" :class="{ active: route.path.startsWith('/transactions') && route.path !== '/transactions/new' }">
        <span class="mi">📋</span>明细
      </RouterLink>
      <RouterLink v-if="session.canWrite" to="/transactions/new" class="fab" aria-label="记一笔">
        <span class="mi">＋</span>
      </RouterLink>
      <RouterLink to="/reports" :class="{ active: route.path.startsWith('/reports') }">
        <span class="mi">📊</span>报表
      </RouterLink>
      <RouterLink to="/ai" :class="{ active: route.path === '/ai' }">
        <span class="mi">🤖</span>AI
      </RouterLink>
    </nav>

    <!-- AI 记账助手浮窗（旧版 #aiFab + #aiPanel 全站可用） -->
    <AiPanel v-if="session.currentLedger" />
  </NLayout>
</template>

<style scoped>
.hl-app { min-height: 100vh; }
.hl-sider { background: var(--hl-card, #fff); }
/* sider 滚动容器改为纵向 flex：brand/账本切换/foot 固定，菜单区滚动 */
.hl-sider :deep(.n-layout-sider-scroll-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 老版 .sidebar padding: 16px 12px */
  padding: 16px 12px;
}
.hl-sider :deep(.brand),
.hl-sider :deep(.ledger-switch),
.hl-sider :deep(.sider-foot) { flex-shrink: 0; }
/* 底部 foot 通栏出血，与老版 sidebar padding 内外一致 */
.hl-sider :deep(.sider-foot) {
  margin: 0 -12px; padding: 10px 16px;
}
.brand {
  display:flex; align-items:center; gap:8px;
  padding: 4px 8px 14px; font-weight: 600; font-size: 15px;
}
.brand .logo {
  display:inline-flex; align-items:center; justify-content:center;
  width: 30px; height: 30px; border-radius: 8px;
  background: linear-gradient(135deg, #5d87f7, #3d6df5);
  box-shadow: 0 2px 6px rgba(61, 109, 245, .35);
  font-size: 16px; line-height: 1;
}
/* 账本切换器：内嵌卡片底（对齐旧版 .ledger-switch） */
.ledger-switch {
  margin: 0 4px 12px; padding: 8px 10px;
  background: var(--hl-card-2, #f7f8fb);
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 8px;
}
.ledger-label {
  display: block; font-size: 11px; color: var(--hl-text-3, #8a93a3);
  margin-bottom: 3px; font-weight: 550;
}
.hl-menu { padding-bottom: 12px; }
/* 菜单区独占剩余高度并滚动，底部 foot 固定 */
/* 菜单项：老版 .nav-item —— padding 8px 10px，font 13.5px，图标间距 10px，radius-sm 9px */
/* 去掉 naive 默认 42px 固定行高，改为内容自适应（老版无固定高度） */
.hl-menu :deep(.n-menu-item-content) {
  height: auto !important;
  padding: 8px 12px !important;
}
/* 高亮块内缩，避免图标贴边（老版 .nav-item.active 满宽但内容有 10px 内距） */
.hl-menu :deep(.n-menu-item-content::before) {
  border-radius: 9px;
  left: 4px; right: 4px; top: 0; bottom: 0;
}
.hl-menu :deep(.n-menu-item-content__icon) {
  width: 18px; height: 20px; font-size: 18px; margin-right: 10px;
  display: inline-flex; align-items: center; justify-content: center;
}
/* emoji 字形基线偏下，translateY 微调使图标与文字视觉居中对齐 */
.nav-emoji {
  font-size: 15px; line-height: 1;
  display: inline-flex; width: 22px; justify-content: center;
}
.hl-menu :deep(.nav-emoji) {
  font-size: 16px; width: 18px; height: 18px;
  align-items: center; justify-content: center;
  transform: translateY(-5px);
}
.hl-menu :deep(.n-menu-item-content-header) {
  font-size: 13.5px; line-height: 20px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.menu-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 分组标题：老版 .nav-title —— 11px faint 色，padding 12px 10px 6px，weight 650 */
.hl-menu :deep(.n-menu-item-group-title) {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .06em;
  color: var(--hl-text-3, #8a93a3);
  /* 覆盖 naive 内联 padding-left: 0 */
  padding: 12px 10px 6px !important;
}
/* 老版 .nav-group { margin-bottom: 4px } */
.hl-menu :deep(.n-menu-item-group) {
  margin-bottom: 4px;
}
/* 通知中心未读徽标（对齐旧版 .count） */
.nav-label-row { display: flex; align-items: center; width: 100%; }
.nav-count {
  margin-left: auto;
  font-size: 11px; font-weight: 600;
  background: var(--hl-expense, #e5484d); color: #fff;
  border-radius: 99px; padding: 0 6px; min-width: 18px;
  text-align: center; line-height: 17px;
}

/* 侧栏底部（旧版 sidebar-foot）；padding/margin 已在 :deep() 中设定 */
.sider-foot {
  display: flex; align-items: center; gap: 8px;
  border-top: 1px solid var(--hl-border, #e6eaf1);
  background: var(--hl-card, #fff);
}
.sider-foot.collapsed { justify-content: center; padding: 10px 8px; }
.foot-btn {
  background: transparent; border: 0; cursor: pointer;
  font-size: 16px; line-height: 1; padding: 5px;
  border-radius: 6px;
}
.foot-btn:hover { background: var(--hl-card-2, #f7f8fb); }
.foot-user {
  margin-left: auto;
  font-size: 12px; color: var(--hl-text-3, #8a93a3);
  max-width: 120px;
}
/* 账本下拉：老版内层 select 无边框透明，直接坐在卡片底上 */
.ledger-btn {
  width: 100%;
  display: flex; align-items: center; gap: 6px;
  border: 0; background: transparent;
  padding: 2px 0;
  font-size: 13px; font-weight: 600;
  color: var(--hl-text, #17202e);
  cursor: pointer;
}
.ledger-btn:hover .lo-name { color: var(--hl-primary, #3d6df5); }
.ledger-btn .caret { margin-left: auto; opacity: .6; font-size: 10px; }
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

/* 点头像换头像（旧版 .avatar-click） */
.avatar-pick {
  display: inline-flex; cursor: pointer;
  border-radius: 50%;
  transition: box-shadow .15s, opacity .15s;
}
.avatar-pick:hover { box-shadow: 0 0 0 2px var(--hl-primary, #3d6df5); }
.avatar-pick.busy { opacity: .55; cursor: progress; }

/* 空账本引导态（对齐旧版 no-ledger.ejs） */
.no-ledger { display: flex; justify-content: center; padding-top: 40px; }
.no-ledger .card {
  background: var(--hl-card, #fff);
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 12px; padding: 40px 32px;
  max-width: 420px; width: 100%; text-align: center;
}
.no-ledger .empty .big { font-size: 40px; display: block; margin-bottom: 10px; }
.no-ledger .empty h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
.no-ledger .empty .muted { font-size: 13px; color: var(--hl-text-3, #8a93a3); margin: 0; }
.no-ledger .cta { display: flex; justify-content: center; margin-top: 20px; }

.hl-content {
  padding: 20px;
  background: var(--hl-bg, #f3f5f9);
  min-height: calc(100vh - 58px);
}

.ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* 移动端底部导航（对齐旧版 .mobile-nav，桌面端隐藏） */
.mobile-nav { display: none; }

@media (max-width: 768px) {
  .burger { display:flex; }
  .hl-sider { display: none; }
  .user-trigger .uname { display: none; }
  .right .btn-label { display: none; }
  /* 底部导航占位，避免内容被遮挡 */
  .hl-content { padding-bottom: 76px; }

  .mobile-nav {
    display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
    background: var(--hl-card, #fff);
    border-top: 1px solid var(--hl-border, #e6eaf1);
    padding: 5px 4px calc(5px + env(safe-area-inset-bottom));
    justify-content: space-around; align-items: flex-end;
  }
  .mobile-nav a {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
    font-size: 10.5px; color: var(--hl-text-3, #8a93a3); padding: 5px 0;
    text-decoration: none;
  }
  .mobile-nav a .mi { font-size: 19px; line-height: 1; }
  .mobile-nav a.active { color: var(--hl-primary, #3d6df5); font-weight: 600; }
  .mobile-nav .fab {
    flex: 0 0 52px; height: 52px; border-radius: 50%;
    background: linear-gradient(180deg, #5d87f7, #3d6df5); color: #fff;
    display: grid; place-items: center; margin: 0 6px;
    box-shadow: 0 8px 20px -6px rgba(61, 109, 245, .75); transform: translateY(-12px);
  }
  .mobile-nav .fab .mi { font-size: 24px; font-weight: 300; }
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
