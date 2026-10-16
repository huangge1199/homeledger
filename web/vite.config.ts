import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 家账簿 v2 前端构建配置
// 开发期将 /api 与 /uploads 代理到后端 5111；构建产物输出到 web/dist
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api':    { target: 'http://localhost:5111', changeOrigin: true },
      '/uploads':{ target: 'http://localhost:5111', changeOrigin: true },
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate'],
          naive: ['naive-ui'],
          echarts: ['echarts', 'vue-echarts']
        }
      }
    }
  }
})
