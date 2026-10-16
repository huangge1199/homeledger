import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/global.css'
import './styles/naive-tokens.css' // 主题变量对接
import './styles/theme.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 启动时根据 localStorage 设置主题（避免启动闪烁）
const t = (localStorage.getItem('hl.theme') as 'light' | 'dark') || 'light'
document.documentElement.setAttribute('data-theme', t)
