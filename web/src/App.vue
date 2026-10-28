<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { darkTheme, NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider, NSpin, NText, NLoadingBarProvider, zhCN, dateZhCN } from 'naive-ui'
import { RouterView } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useFlash } from '@/composables/useFlash'
import { storeToRefs } from 'pinia'
import AppSplash from '@/components/AppSplash.vue'
import { lightThemeOverrides } from '@/theme/naive'

const session = useSessionStore()
const { items } = useFlash()
const { theme, loaded, loading } = storeToRefs(session)

onMounted(async () => {
  if (!session.loaded) {
    await session.refresh()
  }
})

// 主题切换立刻反映到 <html> 上
watch(theme, (t) => {
  document.documentElement.setAttribute('data-theme', t)
}, { immediate: true })

// 启动时根据是否有用户决定显示哪套布局
</script>

<template>
  <!--
    locale / dateLocale：naive-ui 的组件文案（日期面板的「选择日期 / 今天 / 清除」、
    Select 的「请选择」、Popconfirm 的「确认 / 取消」等）都从这里取。
    不配的话会回退到 enUS，日期选择器就显示英文 "Select Date"。
    dateLocale 额外决定日期面板里月份/星期的本地化写法（date-fns 的 zh-CN）。
  -->
  <NConfigProvider
    :theme="theme === 'dark' ? darkTheme : null"
    :locale="zhCN"
    :date-locale="dateZhCN"
    :class="theme === 'dark' ? 'hl-theme-dark' : 'hl-theme-light'"
  >
    <NLoadingBarProvider>
      <NMessageProvider>
        <NDialogProvider>
          <NNotificationProvider>
            <!-- 顶部消息队列 -->
            <div class="flash-rail">
              <div
                v-for="it in items"
                :key="it.id"
                class="flash-item"
                :class="['flash-' + it.type]"
                role="status"
              >
                {{ it.content }}
              </div>
            </div>

            <AppSplash v-if="!loaded && loading" />

            <RouterView v-else />
          </NNotificationProvider>
        </NDialogProvider>
      </NMessageProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>

<style>
.flash-rail {
  position: fixed; top: 16px; right: 16px; z-index: 9999;
  display: flex; flex-direction: column; gap: 8px;
  pointer-events: none;
}
.flash-item {
  pointer-events: auto;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(15, 22, 36, 0.12);
  border: 1px solid var(--hl-border, #e6eaf1);
  background: #fff;
  min-width: 200px;
  max-width: 360px;
  animation: flash-in .2s ease-out;
}
.flash-success { background: #f0f9f4; border-color: #cae7d3; color: #176c39; }
.flash-error   { background: #fdf1f1; border-color: #f4c4c4; color: #a3261e; }
.flash-warning { background: #fdf8e8; border-color: #ecdb96; color: #6b4d00; }
.flash-info    { background: #eef4ff; border-color: #c0d0f5; color: #0e3c91; }
@keyframes flash-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* a11y: focus 可见 */
*:focus-visible {
  outline: 2px solid var(--hl-primary, #3d6df5);
  outline-offset: 2px;
  border-radius: 4px;
}
.hl-theme-dark *:focus-visible {
  outline-color: var(--hl-primary, #6b8eff);
}
</style>
