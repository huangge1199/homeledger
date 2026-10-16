<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NSpin } from 'naive-ui'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const show = computed(() => !session.loaded && session.loading)

// 加点暖场动画，避免空白
const dotCount = ref(3)
let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => {
    dotCount.value = (dotCount.value % 3) + 1
  }, 400)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="splash" role="status" aria-live="polite">
      <div class="logo">🏠</div>
      <div class="title">家账簿</div>
      <NSpin size="small" :show="true" />
      <div class="dots">
        <span v-for="n in 3" :key="n" :class="{ on: n <= dotCount }">·</span>
      </div>
      <div class="hint">正在加载数据{{ '.'.repeat(dotCount) }}</div>
    </div>
  </Transition>
</template>

<style scoped>
.splash {
  position: fixed; inset: 0;
  background: var(--hl-bg, #f3f5f9);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px;
  z-index: 9999;
  transition: opacity .3s;
}
.logo {
  font-size: 64px;
  width: 80px; height: 80px;
  border-radius: 20px;
  background: linear-gradient(135deg, #3d6df5, #5a7cff);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(61, 109, 245, 0.3);
  animation: bounce 1.2s ease-in-out infinite;
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.title { font-size: 20px; font-weight: 600; color: var(--hl-text, #17202e); }
.dots { display: flex; gap: 4px; }
.dots span {
  font-size: 24px; line-height: 1;
  color: var(--hl-muted, #7d8aa3);
  transition: color .2s;
}
.dots span.on { color: var(--hl-primary, #3d6df5); }
.hint { font-size: 12px; color: var(--hl-muted, #7d8aa3); }

.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
