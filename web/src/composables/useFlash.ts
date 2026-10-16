/**
 * 全局消息（成功/错误/警告/信息）
 * 内部用一个 ref 队列 + NMessageProvider 在 App.vue 渲染
 */
import { ref, type Ref } from 'vue'

interface FlashItem {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  content: string
  duration?: number
}

const items: Ref<FlashItem[]> = ref([])
let nextId = 1

function push(type: FlashItem['type'], content: string, duration = 2400) {
  const id = nextId++
  items.value.push({ id, type, content, duration })
  setTimeout(() => {
    const i = items.value.findIndex((it) => it.id === id)
    if (i >= 0) items.value.splice(i, 1)
  }, duration + 200)
  return id
}

export function useFlash() {
  return {
    items,
    success: (s: string) => push('success', s),
    error: (s: string) => push('error', s, 3800),
    warning: (s: string) => push('warning', s, 3200),
    info: (s: string) => push('info', s),
  }
}
