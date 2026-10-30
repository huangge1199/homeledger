<script setup lang="ts">
/**
 * 裸布局（登录 / 初始化 / 注册 / 加入账本）
 *
 * 对齐老版 src/views/layout-blank.ejs：老版由 layout 统一提供
 * 「渐变背景 + 白卡容器 + 品牌头（📒 + 站点名 + 副标题）」，
 * 页面模板只负责表单主体。这里把同样的三件套收回布局，
 * 避免 4 个裸页各画各的品牌区与卡片。
 */
import { useSessionStore } from '@/stores/session'

withDefaults(defineProps<{
  /** 页面标题（老版 layout-blank 用它拼 <title>；新版由 router 统一设置，此处仅作语义标注） */
  title?: string
  /** 卡片最大宽度；老版 auth-card 为 400px，新版登录页 420px / 初始化页 480px */
  width?: string
  /** 是否显示品牌头（老版所有裸页都有） */
  showBrand?: boolean
}>(), {
  title: '',
  width: '420px',
  showBrand: true,
})

const session = useSessionStore()
</script>

<template>
  <div class="blank">
    <!-- 视图组件（Login/Setup/Register/Join）把内容作为 slot 传入；
         此处不能用 <RouterView/>：顶层路由下没有子路由，会渲染成空注释导致整页空白 -->
    <div class="auth-card" :style="{ maxWidth: width }">
      <div v-if="showBrand" class="auth-brand">
        <div class="brand-logo">📒</div>
        <div class="brand-text">
          <b>{{ session.siteName || '家账簿' }}</b>
          <span>自托管 · 全类型记账 · AI 截图自动记账</span>
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.blank {
  min-height: 100vh;
  background:
    radial-gradient(900px 480px at 10% -10%, var(--hl-primary-2) 0%, transparent 60%),
    radial-gradient(760px 420px at 100% 0%, var(--hl-income-bg) 0%, transparent 55%),
    var(--hl-bg);
  display: grid;
  place-items: center;
  padding: 24px;
}

/* 老版 .auth-card：白底 + 边框 + 20px 圆角 + 大阴影 */
.auth-card {
  width: 100%;
  background: var(--hl-card);
  border: 1px solid var(--hl-border);
  border-radius: 20px;
  padding: 32px 30px;
  box-shadow: 0 10px 30px rgba(15, 22, 36, 0.08);
}
.hl-theme-dark .auth-card {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

/* 老版 .auth-brand：42px 图标 + 站点名 + 副标题 */
.auth-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 24px;
}
.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  font-size: 21px;
  line-height: 42px;
  text-align: center;
  background: var(--hl-primary-2);
  flex-shrink: 0;
}
.brand-text b { font-size: 17px; display: block; }
.brand-text span { font-size: 12px; color: var(--hl-muted); }

@media (max-width: 640px) {
  .blank { padding: 16px; }
  .auth-card { padding: 26px 20px; border-radius: 16px; }
}
</style>
