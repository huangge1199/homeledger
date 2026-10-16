# 家账簿 v2 —— Vue 3 + Naive UI 前端

独立的 Vite 工作区，与同级 `src/` 共用后端服务。

## 本地开发

```bash
# 终端1：后端
npm install
npm run dev          # http://localhost:5111

# 终端2：前端
cd web
npm install
npm run dev          # http://localhost:5173
```

开发期 Vite 会把 `/api` `/uploads` 反代到 5111。

## 生产构建

```bash
cd web
npm run build        # 产物在 web/dist
```

构建后 `node server.js` 会从 `web/dist` 提供静态资源（SPA fallback），不需要再单独跑前端进程。

## 目录

```
web/src/
├── api/            # axios 客户端 + 各模块接口
├── components/     # 跨页面复用组件
├── composables/    # 业务 composables（useApi/useCsrf/...）
├── layouts/        # AppShell / BlankLayout
├── router/         # vue-router 路由表
├── stores/         # Pinia 全局 store
├── theme/          # 设计令牌 + Naive 主题
├── utils/          # 工具函数
├── views/          # 各页面组件
├── App.vue
└── main.ts
```
