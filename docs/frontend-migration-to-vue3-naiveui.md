# 家账簿 HomeLedger → Vue 3 + Naive UI 全量迁移实施计划

> 状态：方案 A —— 全量 SPA 化（连 `/login` `/setup` 也用 Vue 重写，彻底告别 EJS）
> 技术栈：Vue 3.5 + TypeScript + Vite + Pinia + naive-ui + ECharts + axios
> 工作区：前端独立 `web/` 子目录；包管理 pnpm
> 维护：随实施推进更新本文件"实施进度"小节

---

## 1. 现状摸底

| 维度 | 现状 |
|---|---|
| 后端栈 | Node 22 + Express 4 + EJS 模板 + SQLite + 内存/SQLite 会话 |
| 前端策略 | 纯 SSR + 渐进增强，零前端依赖、零组件库、零构建工具 |
| 后端依赖 | `ejs` `express` `express-session` 三件套 |
| 模板 | 35 个 `.ejs` 视图（业务页 32 个 + 3 个 partial） |
| 样式 | 1 份 67KB 手写 CSS（`public/css/app.css`），含自设计令牌、暗色主题、自定义 `.hl-select` 下拉等"准组件"实现 |
| JS | `app.js` 67KB（自定义下拉/抽屉/Toast/AI 面板）+ `assistant.js` 7KB |
| 图表 | 服务端 SVG（`src/lib/charts.js`） |
| 模块数 | 11 个路由模块 |
| 项目语言 | 中文文案 + 英文标识 |

**核心矛盾**：所有页面都是手写 HTML + class，后期维护与替换组件成本高 → 改 Vue 3 + Naive UI。

---

## 2. 目标架构

```
家账簿 v2.0（完全 SPA 化）
┌──────────────────────────────────────────────────────────┐
│                     浏览器（Vue 3）                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │ Pinia Store │  │ Vue Router  │  │ Naive UI 组件库 │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │ axios/CSRF  │  │ ECharts     │  │ @vicons         │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
└────────────────────────┬─────────────────────────────────┘
                         │ /api/v1/*  (JSON)
                         │ Cookie 会话自动续期
┌────────────────────────┴─────────────────────────────────┐
│                Node.js 22 + Express（仅 API + 静态）     │
│  /api/v1/* （新）  /api/open/*（保留）  /static web/dist  │
│              SQLite (better-sqlite3)                      │
└──────────────────────────────────────────────────────────┘
```

**关键变化**：Express 不再渲染视图，仅提供 JSON API 与静态文件服务。

---

## 3. 决策记录（已与用户确认）

| 项 | 决策 |
|---|---|
| 前端语言 | **TypeScript** |
| 包管理 | **npm** |
| 工作区布局 | **独立 `web/` 子目录**（与 `src/` `server.js` 同层） |
| 登录/setup 处理 | **Vue 重写全部页面，连 `/login` `/setup` 也不留 EJS** |
| 风格语言 | UI 库换 Naive，主题延续原冷灰调（CSS 变量平移） |
| 图表方案 | 用 ECharts 替换服务端 SVG |
| 鉴权与会话 | 复用现有 session 机制；CSRF 通过 meta + axios 拦截器 |

---

## 4. 技术栈定型

| 层 | 选型 |
|---|---|
| 框架 | Vue 3.5 + `<script setup>` + Composition API |
| 类型 | TypeScript 5.5 |
| 构建 | Vite 5 |
| 路由 | vue-router 4 |
| 状态 | Pinia 2 + pinia-plugin-persistedstate |
| UI 库 | naive-ui 2.40+ |
| 图标 | @vicons/ionicons5 + 内联 SVG 备份 |
| HTTP | axios 1.7 + 拦截器（CSRF / 401 / Toast） |
| 图表 | echarts 5 + vue-echarts |
| 日期 | dayjs |
| 表单校验 | 手写 composable + naive-ui 内置校验 |
| E2E | Playwright（新增） |
| 单元 | 原 `test/verify-*.js` 改为 API 断言 + 前端 vitest |

---

## 5. 路由表

```ts
const routes = [
  // 免登录
  { path: '/setup', component: () => import('@/views/SetupView.vue'), meta: { bareLayout: true } },
  { path: '/login',  component: () => import('@/views/LoginView.vue'),  meta: { bareLayout: true } },
  { path: '/register', component: () => import('@/views/RegisterView.vue'), meta: { bareLayout: true } },
  { path: '/join/:token', component: () => import('@/views/JoinView.vue'), meta: { bareLayout: true } },

  // 受保护
  { path: '/', component: () => import('@/views/DashboardView.vue') },
  { path: '/transactions', component: () => import('@/views/TransactionsView.vue') },
  { path: '/transactions/new', component: () => import('@/views/TxnFormView.vue') },
  { path: '/transactions/:id(\\d+)', component: () => import('@/views/TxnDetailView.vue') },
  { path: '/transactions/:id(\\d+)/edit', component: () => import('@/views/TxnFormView.vue') },
  { path: '/calendar', component: () => import('@/views/CalendarView.vue') },
  { path: '/search', component: () => import('@/views/SearchView.vue') },
  { path: '/reports', component: () => import('@/views/ReportsView.vue') },
  { path: '/reports/:tab', component: () => import('@/views/ReportsView.vue') },

  { path: '/accounts', component: () => import('@/views/AccountsView.vue') },
  { path: '/accounts/:id', component: () => import('@/views/AccountDetailView.vue') },
  { path: '/budgets', component: () => import('@/views/BudgetsView.vue') },
  { path: '/recurring', component: () => import('@/views/RecurringView.vue') },
  { path: '/subscriptions', component: () => import('@/views/SubscriptionsView.vue') },
  { path: '/debts', component: () => import('@/views/DebtsView.vue') },
  { path: '/goals', component: () => import('@/views/GoalsView.vue') },

  { path: '/categories', component: () => import('@/views/CategoriesView.vue') },
  { path: '/tags', component: () => import('@/views/TagsView.vue') },
  { path: '/import', component: () => import('@/views/ImportView.vue') },
  { path: '/export', component: () => import('@/views/ExportView.vue') },

  { path: '/ledgers', component: () => import('@/views/LedgersView.vue') },
  { path: '/members', component: () => import('@/views/MembersView.vue') },
  { path: '/notifications', component: () => import('@/views/NotificationsView.vue') },
  { path: '/settings/:tab?', component: () => import('@/views/SettingsView.vue') },
  { path: '/about', component: () => import('@/views/AboutView.vue') },
  { path: '/ai', component: () => import('@/views/AiView.vue') },
  { path: '/:catch(.*)*', component: () => import('@/views/NotFoundView.vue') },
]
```

---

## 6. 公共组件清单

| 组件 | 用途 | 对应原 EJS 模块 |
|---|---|---|
| `<AppShell>` | 顶栏/侧栏/移动 nav/AI 浮窗/Toast 全局 | `layout.ejs` |
| `<BlankLayout>` | 登录/setup/register 三页 | `layout-blank.ejs` |
| `<PageHead>` | 标题 + 副标题 + 操作位 | 各页面 `.card-head` |
| `<StatCard>` | 数字卡 + 趋势 | `dashboard.ejs` `.stat` |
| `<AmountDisplay>` | 红/绿样式金额 | `helpers.fmtAmount` |
| `<AmountInput>` | 金额输入 + ¥ 前缀 | `txn-form.ejs` |
| `<TxnTypeTabs>` | 主类型 + 更多类型 chips | `txn-form.ejs` |
| `<AccountSelect>` / `<CategorySelect>` / `<MemberSelect>` / `<TagSelect>` | 替代自定义 `.hl-select` | 多个页面 |
| `<DatePickerWrap>` | 封装 n-date-picker | 各处 |
| `<Empty>` | 空状态 | `.empty` |
| `<Confirm>` | 二次确认弹窗 | 删除按钮 |
| `<DeltaText>` | "环比上月 ↑ 12.3%" | `.delta.up/.down` |
| `<TxnList>` / `<TxnListRow>` | 交易列表 + 日内分组 | `partials/txn-list.ejs` |
| `<BarChart>` / `<DonutChart>` / `<LineChart>` | ECharts 封装 | `lib/charts.js` |
| `<AiPanel>` | AI 助手浮窗（替换 `assistant.js`） | `layout.ejs` |
| `<UserMenu>` | 头像下拉 | `layout.ejs` |

---

## 7. 阶段化路线（6 步）

### 阶段 0｜脚手架与基础设施  【1~2 天】
- 新增 `web/` 工作区（Vite + Vue 3 + TS）
- Vite 代理 `/api` → Express
- 调整 `server.js`：静态 `web/dist` + SPA fallback
- 调整 `Dockerfile` 多阶段构建
- 抽出 `theme/tokens.ts` 与 naive 主题映射骨架
- 搭起路由 + `<AppShell>` 空骨架 + 占位首页

### 阶段 1｜API 化大改造  【3~4 天｜关键】
- SSR 路由全部改为 JSON API，新增 `app.use('/api/v1', ...)`
- 35+ 个 `/api/v1/*` 端点，按原 router 一对一映射
- 统一响应格式 `{ ok, data, error }`；分页 `{ items, total }`
- 复用现有 `auth.js` 与 `csrfProtect`，前端通过 meta + axios 拦截器

### 阶段 2｜前端骨架与设计系统  【2~3 天】
- vue-router 配置 + Pinia store 拆分
- `<AppShell>` 用 naive UI 复刻侧栏/顶栏/抽屉/移动 nav
- 主题 tokens → naive themeOverrides
- 公共组件库搭建（见第 6 节）

### 阶段 3｜按模块迁移 32+ 页面  【4~6 周】
| 顺序 | 模块 | 工作量 | 难点 |
|---|---|---|---|
| 1 | dashboard 总览 | 1 天 | 4 个 stat + 趋势柱状 + 环形图 + 最近交易 |
| 2 | transactions 明细 + 日历 | 2 天 | 长列表虚拟化 |
| 3 | transactions 表单（新建/编辑） | 2 天 | 类型切换动态联动 |
| 4 | AI 截图 + 助手 | 1.5 天 | 流式响应、多附件 |
| 5 | 账户 + 详情 | 1 天 | CRUD + 余额调整 |
| 6 | 预算/周期/订阅/借贷/目标 | 3~4 天 | 5 个相似 CRUD |
| 7 | 分类/标签/导入/导出 | 2 天 | 树形分类、批量 |
| 8 | 报表 | 2~3 天 | 5 子报表 + ECharts |
| 9 | 搜索筛选 | 1 天 | 复合筛选 |
| 10 | 账本/成员/通知 | 2 天 | 列表+操作 |
| 11 | 设置 | 2 天 | 多 tab + 表单 + 头像 |
| 12 | 关于 / setup | 0.5 天 | 静态为主 |
| 13 | 移动端打磨 | 1~2 天 | 抽屉、底部 nav |

### 阶段 4｜打磨收尾  【1 周】
- 暗色主题切换
- 加载骨架屏、过渡动画、异常 Toast
- 移动断点 375 / 768 / 1024
- 可访问性：键盘 / ARIA / 对比度
- Playwright 关键路径

### 阶段 5｜退役旧前端  【0.5 周】
- 删除 32 个 `.ejs` 业务模板（保留 `error.ejs` 兜底）
- 删除 `public/css/app.css`、`public/js/app.js`、`assistant.js`
- 删除 `src/lib/charts.js`
- `package.json` 移除 `ejs`
- 更新 README、Dockerfile、`openclaw-skill/.../SKILL.md`

---

## 8. 文件级产出清单

### 新增（~70 个文件）
```
web/
├── package.json
├── pnpm-workspace.yaml（可选）
├── vite.config.ts
├── tsconfig.json / tsconfig.node.json
├── index.html
├── env.d.ts
└── src/
    ├── main.ts / App.vue
    ├── router/index.ts
    ├── stores/{session,ledger,preferences,ai}.ts
    ├── api/{client,transactions,accounts,...}.ts
    ├── layouts/{AppShell,BlankLayout}.vue
    ├── components/{...}.vue           ← ~15 个
    ├── views/{Dashboard,...}.vue       ← ~32 个
    ├── composables/{useApi,useCsrf,useFlash}.ts
    ├── theme/{tokens.ts,naive.ts}
    └── utils/{money,date,format}.ts
```

### 修改
- `server.js` ← 静态文件 + SPA fallback + JSON 适配
- `src/routes/*.js`（11 个）← 拆分 JSON API
- `src/lib/auth.js` ← JSON 401/403 适配
- `package.json` ← 移除 ejs
- `Dockerfile` ← 多阶段

### 删除
- `src/views/*.ejs`（业务页 32 个）
- `public/css/app.css`
- `public/js/app.js` `assistant.js`
- `src/lib/charts.js`

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 首批 API 阶段进展 | 后端改造阻塞整个项目 | 阶段 1 完成后立刻并行前端 |
| Naive UI 主题一致性 | 主色偏离失去"冷灰调"特色 | 现有 CSS 变量作单一事实源，`tokens.ts` 导出 naive |
| ECharts 体积 | 首屏慢 | 路由懒加载 + 按需引入 |
| AI 流式响应 | 体验差异 | 前端 `fetch + ReadableStream` |
| 长交易明细卡顿 | 上万行滚动 | 虚拟列表或分页 |
| 数据格式兼容性 | 老用户升级失败 | `/api/v1` 兼容老字段 |
| Docker 镜像变大 | 部署耗时 | 前端独立 stage，pnpm `--prod` |
| session / CSRF 衔接 | 安全漏洞 | 复用现有 cookie 机制，前端不读 cookie 内容 |
| 测试中断 | 回归盲区 | 阶段 1 先扩 API 测试，前端补 Playwright |

---

## 10. 验收点

| 阶段 | 验收 |
|---|---|
| 0 | 浏览器 `localhost:5173` 看到 Vite 占位；`npm start` 跑 server，`/` 返 `web/dist/index.html` |
| 1 | `curl /api/v1/transactions` 返 JSON；老 OpenAPI token 仍能用 `/api/open` |
| 2 | `<AppShell>` 在登录后可见，暗色切换正常 |
| 3.1 | 总览页 4 数字 + 柱状 + 环形 + 最近 5 笔 |
| 3.4 | 交易表单类型联动完整 |
| 3.7 | 分类管理树形 + 合并 + 批量 |
| 3.8 | 报表 5 tab 切换 + 图表 |
| 4 | Playwright 关键路径全绿 |
| 5 | `git grep ".ejs" src/views` 空；`package.json` 无 `ejs` |

---

## 11. 实施进度（开工后由 AI 同步更新）

| # | 阶段 | 状态 | 备注 |
|---|---|---|---|
| - | 立项 + 写计划 | ✅ 完成 | 计划见 `docs/frontend-migration-to-vue3-naiveui.md` |
| 0 | 脚手架 + 设计系统骨架 | ✅ 完成 | `web/` 工作区可构建；SPA fallback 工作 |
| 1 | 全量 API 化 | ✅ 完成 | 8 个 `api.v1.*.js` 子模块；约 2.6K 行 JSON 路由；端到端 curl 验证通过（详见 `docs/api-v1.md`） |
| 2 | 前端骨架 | ✅ 完成 | Vue 3 + TS + Vite + Pinia + Naive UI；3 套布局 + 11 个通用组件；深色主题与 CSS 令牌 |
| 3-A | 核心 4 页 | ✅ 完成 | 登录 / 初始化 / 记一笔 / 账单明细 |
| 3-B | 账户/分类/标签 | ✅ 完成 | 账户列表/明细、分类树、标签 |
| 3-C | 预算/周期/订阅/目标 | ✅ 完成 | 4 个规划页（同步修正 `budgets/recurring_rules/goals` 三处 schema 错位） |
| 3-D | 借贷/导入 | ✅ 完成 | 借贷台账 + 账单导入（修正 `debts` schema） |
| 3-E | 账本/成员/通知/设置/AI | ✅ 完成 | 系统页 5 个（系统管理并入设置页） |
| 3-F | 日历/搜索/报表/导出/关于 | ✅ 完成 | 查询 5 页（v2.0 增补导出页） |
| 4 | 打磨收尾 | ✅ 完成 | 深色主题响应式、CSS 变量、a11y 焦点环、空状态、错误兜底；`docs/deployment-vue3.md` |
| 5 | 退役旧前端 | ✅ 完成 | 见下方阶段 5 交付清单；v2.0.0 版本上线 |

### 阶段 1 交付清单

- `src/lib/api.js` — 统一 JSON 响应工具（`ok/created/saved/deleted/badRequest/unauthorized/forbidden/notFound/conflict/wantsJson/asyncHandler`）
- `src/routes/apiV1.js` — 主路由（ping / session / 子模块挂载 / 404 兜底）
- 8 个子模块（每个一文件，按业务领域拆分）：
  - `api.v1.transactions.js` — 列表 / CRUD / bulk
  - `api.v1.accounts.js` — accounts / categories / tags 三个子路由
  - `api.v1.planning.js` — budgets / recurring / debts / goals
  - `api.v1.subscriptions.js` — 订阅（含 charge/skip/toggle/cancel）
  - `api.v1.dashboard.js` — 总览 / 日历 / 搜索 / 通知
  - `api.v1.reports.js` — 报表（5 个时间区间预设）
  - `api.v1.admin.js` — 设置 / 账本 / 成员 / 导入 / 备份 / 系统
  - `api.v1.ai.js` — AI 截图 / 文本 / 助手对话 / 附件
- `src/lib/auth.js` 改造：`requireAdmin / requireLedgerWrite / requireLedgerManage` 在 `application/json` accept 时返 JSON 而非 HTML
- `server.js` 调整：
  - `app.use('/api/v1', require('./src/routes/apiV1'))` 挂在 `csrfProtect` 之前（v1 内部自己 `router.use(auth.csrfProtect)` 保证写接口安全）
  - SPA fallback 后置，避免抢 `/api/v1/*` 响应
  - `/api/*` 404 兜底返 JSON
- 端到端验证通过：
  - `/api/v1/ping` `200`
  - `/api/v1/session` 返完整 user/ledger/ledgers/csrf
  - `/api/v1/dashboard` `/api/v1/accounts` `/api/v1/categories` `/api/v1/transactions` 全部返真实数据
  - 写操作：`POST /api/v1/accounts` 不带 CSRF → 403，带 token → 201
- 文档：`docs/api-v1.md` —— 完整端点索引 + curl 联调示例

### 阶段 0 交付清单

- `web/package.json` / `web/vite.config.ts` / `web/tsconfig.json` / `web/tsconfig.node.json` / `web/env.d.ts` / `web/index.html`
- `web/src/{main.ts,App.vue,router/index.ts,styles/global.css}`
- `web/src/theme/{tokens.ts,naive.ts}` —— 设计令牌 + Naive 主题覆盖
- `web/src/api/client.ts` —— axios + CSRF 拦截器
- `web/src/composables/useFlash.ts` —— 全局消息（占位）
- `web/src/utils/money.ts` —— 金额格式化（平移 `helpers.fmtAmount` / `compactMoney`）
- `web/src/stores/session.ts` —— Pinia session / ledger / theme
- `web/src/layouts/{AppShell,BlankLayout}.vue` —— 顶栏/侧栏/裸壳布局
- `web/src/views/{Dashboard,Login,Setup,Placeholder,NotFound}View.vue`
- `server.js` 调整：新增 `web/dist` 静态托管 + SPA fallback
- `Dockerfile` 改造为多阶段（`web-builder` 跑 `npm run build`，运行时镜像只含后端 + 产物）
- 包管理：使用 **npm**（替代最初计划的 pnpm）
- Pinia 升级到 **v3**（`pinia-plugin-persistedstate@4` 要求）

---

> 注：本计划覆盖"家账簿 HomeLedger v2.0（重构）"完整路径。后续每个阶段推进时，由执行方在本文件追加具体完成项与遗留点。

---

## 阶段 1 实施完成（API 化）

详见：[阶段 1 交付清单 - 见上述 §阶段 1 改造路径](./frontend-migration-to-vue3-naiveui.md#阶段-1-改造路径)。

核心交付：
- 8 个 `/api/v1/*` 路由模块（auth / transactions / accounts / planning / subscriptions / dashboard / reports / admin / ai）
- 12 个统一响应工具函数（api.ok / created / saved / deleted / badRequest / unauthorized / forbidden / notFound / conflict / serverError / asyncHandler / 标准化 JSON 响应）
- `auth.js` 改造：JSON 优先模式，写接口自动 `csrfProtect`
- 端点文档 [docs/api-v1.md](file:///d:/project/homeledger/docs/api-v1.md)
- 端到端验证通过

---

## 阶段 2 实施完成（前端骨架）

**vue-tsc 0 错误 / vite build 通过（vue + naive + echarts + pinia = 1.1MB / 354KB gzipped）**

### 2.1 公共组件（11 个）

- [StatCard.vue](file:///d:/project/homeledger/web/src/components/StatCard.vue) — 数字卡 + 环比
- [AmountDisplay.vue](file:///d:/project/homeledger/web/src/components/AmountDisplay.vue) — 金额红绿显示
- [PageHead.vue](file:///d:/project/homeledger/web/src/components/PageHead.vue) — 页面标题/副标题/操作位
- [Empty.vue](file:///d:/project/homeledger/web/src/components/Empty.vue) — 空状态
- [DeltaText.vue](file:///d:/project/homeledger/web/src/components/DeltaText.vue) — 环比（绿/红）
- [AmountInput.vue](file:///d:/project/homeledger/web/src/components/AmountInput.vue) — ¥ 前缀金额输入
- [TxnTypeTabs.vue](file:///d:/project/homeledger/web/src/components/TxnTypeTabs.vue) — 14 种交易类型标签
- [DatePickerWrap.vue](file:///d:/project/homeledger/web/src/components/DatePickerWrap.vue) — NDatePicker 包装
- [AccountSelect.vue](file:///d:/project/homeledger/web/src/components/AccountSelect.vue) — 账户下拉
- [CategorySelect.vue](file:///d:/project/homeledger/web/src/components/CategorySelect.vue) — 分类下拉
- [BarChart.vue / DonutChart.vue / LineChart.vue](file:///d:/project/homeledger/web/src/components/BarChart.vue) — ECharts 封装
- [TxnList.vue](file:///d:/project/homeledger/web/src/components/TxnList.vue) — 列表 + 日内分组 + 批量

### 2.2 工具 & 状态

- [api/client.ts](file:///d:/project/homeledger/web/src/api/client.ts) — axios + CSRF + 401 拦截
- [api/modules.ts](file:///d:/project/homeledger/web/src/api/modules.ts) — 业务模块 8 大类 API 封装
- [stores/session.ts](file:///d:/project/homeledger/web/src/stores/session.ts) — user / ledgers / csrf / theme
- [composables/useFlash.ts](file:///d:/project/homeledger/web/src/composables/useFlash.ts) — 全局消息队列
- [utils/money.ts](file:///d:/project/homeledger/web/src/utils/money.ts) — 金额格式化
- [utils/txnTypes.ts](file:///d:/project/homeledger/web/src/utils/txnTypes.ts) — 14 种交易类型常量
- [utils/accountTypes.ts](file:///d:/project/homeledger/web/src/utils/accountTypes.ts) — 10 种账户类型

### 2.3 主题 & 布局

- [AppShell.vue](file:///d:/project/homeledger/web/src/layouts/AppShell.vue) — 顶栏 + 侧栏 + 账本切换 + 主题 + UserMenu + 移动端抽屉
- [BlankLayout.vue](file:///d:/project/homeledger/web/src/layouts/BlankLayout.vue) — 登录/setup/注册 裸壳

## 阶段 5 实施完成（退役旧前端，v2.0.0 上线）

### 5.1 清理目标

阶段 5 之前，后端同时持有 EJS SSR 与 SPA fallback 两套视图层：阶段 0–4 期间 32 个旧 EJS 路由与对应 Vue 视图共存，便于灰度切换。阶段 5 彻底退役 EJS：

- 删除 `src/views/` 全部 35 个 `.ejs` 模板（业务页 32 + 3 个 partial）+ `public/css/app.css` + `public/js/app.js` + `public/js/assistant.js` + `public/manifest.webmanifest`
- `server.js`：卸载 `app.set('view engine','ejs')`、`res.locals` 注入块、`res.render` 包装中间件、`APP_VERSION`、`util/charts` 依赖、`assetStamp()`
- 所有 32 个 GET 渲染路由 → `next()` 透传，由 SPA fallback 接管；POST 错误处理改为 `res.flash()` + `res.redirect()`，前端 `useFlash` 兜底
- `csrfProtect`（[src/lib/auth.js](file:///d:/project/homeledger/src/lib/auth.js)）失败时改为写 flash + 302，不再 `res.render('error')`
- 路由全部删除 `import` 死引用：`txn`、`fd`、`charts`、`u` 等仅 SSR 使用的工具不再出现在新路由签名中
- [package.json](file:///d:/project/homeledger/package.json)：移除 `ejs` 依赖、`version` 升至 `2.0.0`、描述更新为「前端 Vue 3 SPA」
- [src/lib/about.js](file:///d:/project/homeledger/src/lib/about.js) CHANGELOG 顶部追加 2.0.0 条目

### 5.2 关键改造点

| 路径 | 改造 |
|---|---|
| `GET /login /setup /register` | 仅校验（如有），其余 `next()` 交给 SPA |
| `GET /join/:code` | 校验邀请码 → `redirect(/join?code=&ledger=&role=&creator=&expires=)`，前端 `/join` 视图读 query 渲染 |
| `GET /accounts /accounts/:id /categories /tags /budgets /recurring /debts /goals /subscriptions /subscriptions/:id/edit` | `next()` 透传 |
| `GET /transactions /transactions/new /transactions/:id/edit /calendar /search /notifications /settings /ai /attachments /ledgers /members /import /export /reports /about` | `next()` 透传 |
| `POST /login`（错误） | `res.flash('error', ...)` + 302 回 `/login?next=&u=` |
| `POST /register /setup`（错误） | 同上：flash + 302 回原页并回填表单字段 |
| `POST /transactions /:id`（错误） | flash + 302 回 `safeBack(req.body.back)` |
| `POST /accounts /:id` 等所有 write 失败 | 一律 flash + 302 回原页；不再渲染模板 |

### 5.3 端到端验证

v2 之后未保留自动化测试套件（v1 的 `test/verify-*.js` 9 套件均按 EJS 渲染结果写断言，与 SPA 化后的接口契约不再一致，已随阶段 5 一并退役）。新功能上线请通过浏览器端到端 + `curl /api/v1/*` 手动验证；后续如要回归覆盖，建议按 v2 契约（`/api/v1` + Vue Router 行为）重写。

### 5.4 文件变更摘要

- 删除：`src/views/`（35 文件）、`public/css/app.css`、`public/js/app.js`、`public/js/assistant.js`、`public/manifest.webmanifest`、整个 `test/` 目录（含 v1 EJS 时代 9 个 `verify-*.js` 套件与 `selfcheck-static.js` / `smoke-spa.js`）
- 重写：`src/routes/auth.js`、`src/routes/dashboard.js`、`src/routes/transactions.js`、`src/routes/accounts.js`、`src/routes/admin.js`、`src/routes/planning.js`、`src/routes/subscriptions.js`、`src/routes/reports.js`、`src/routes/ai.js`、`src/routes/about.js`
- 修改：`server.js`、`src/lib/auth.js`、`src/lib/about.js`、`package.json`

### 5.5 部署要点

详见 [deployment-vue3.md](./deployment-vue3.md)。关键提醒：
- 旧用户升级 v2 前**务必先 `cd web && npm install && npm run build`**（Docker 多阶段已自动化）
- 反向代理（Nginx/Caddy）继续按 v1 配置即可——所有 API 与前端路由都按 host/path 路由，没有特殊 rewrite
- 旧「导入导出 CSV」格式未变，可直接复用

### 2.3 主题 & 布局（补充样式）

- [styles/theme.css](file:///d:/project/homeledger/web/src/styles/theme.css) — 亮/暗主题
- [styles/naive-tokens.css](file:///d:/project/homeledger/web/src/styles/naive-tokens.css) — Naive UI token 覆盖
- [styles/global.css](file:///d:/project/homeledger/web/src/styles/global.css) — 全局重置

### 2.4 路由（32 个）

- [router/index.ts](file:///d:/project/homeledger/web/src/router/index.ts) — 公开页 4 个 + 受保护 28 个 + 404 + 登录守卫

---

## 阶段 3-A 实施完成（核心 4 页）

| 页面 | 文件 | 关键特性 |
|---|---|---|
| 登录 | [LoginView.vue](file:///d:/project/homeledger/web/src/views/LoginView.vue) | next 重定向 / needsSetup 检测 / allowRegister 检测 / 错误提示 |
| 初始化 | [SetupView.vue](file:///d:/project/homeledger/web/src/views/SetupView.vue) | 站点名 + 用户名 + 双密码 + 已存在则跳登录 |
| 记一笔/编辑 | [TxnFormView.vue](file:///d:/project/homeledger/web/src/views/TxnFormView.vue) | 14 种类型 + 联动（类型↔分类、类型↔账户、转入账户、报销开关、标签、商户/备注、编辑/删除） |
| 账单明细 | [TransactionsView.vue](file:///d:/project/homeledger/web/src/views/TransactionsView.vue) | 月份/类型/账户/分类/关键字/报销 6 维筛选 + URL 同步 + 同比 3 卡 + 批量删除/标记报销/恢复 |

**端到端验证**：登录 → 创建 ¥35.50 餐饮交易 → 列表展示 ✓

---

## 阶段 3-B 实施完成（账户/分类/标签）

| 页面 | 文件 | 关键特性 |
|---|---|---|
| 账户管理 | [AccountsView.vue](file:///d:/project/homeledger/web/src/views/AccountsView.vue) | 净资产/总资产/总负债 3 卡 + 4 大类分组（cash/debit/credit/...）+ 卡片悬停编辑/归档/删除 + 抽屉表单（含信用卡字段联动） |
| 账户详情 | [AccountDetailView.vue](file:///d:/project/homeledger/web/src/views/AccountDetailView.vue) | 4 张 StatCard（当前/初始余额 + 收入/支出）+ 元信息网格 + 该账户 TxnList + 余额调整抽屉 |
| 分类管理 | [CategoriesView.vue](file:///d:/project/homeledger/web/src/views/CategoriesView.vue) | 左右双栏（支出/收入）+ NCollapse 树形 + 子分类嵌套 + 笔数/金额统计 + 系统标识 + 删除自动归档 |
| 标签管理 | [TagsView.vue](file:///d:/project/homeledger/web/src/views/TagsView.vue) | 总数/使用次数/已使用 3 卡 + 标签网格 + 按使用次数排序 + 空标签灰显 |

**端到端验证**：创建自建分类/标签/账户全部成功 ✓

---

## 阶段 3-C 实施完成（规划 4 页）

> **重要**：本阶段发现并修复了**后端 schema 错位**——阶段 1 写 v1 时对真实 schema 假设有误。已重写 [api.v1.planning.js](file:///d:/project/homeledger/src/routes/api.v1.planning.js)：
> - `recurring_rules` 实际为 `payload (JSON) + frequency/interval_n/day_of_month/weekday/next_run_at`，去掉了错误的 `type/amount_cents/category_id/account_id/cadence/anchor_date/cycle_n` 直接列
> - `budgets` 去掉了 `period_start`，使用 `alert_pct` 而非 `alert_threshold`；新增 `name/currency/trigger_type/rollover` 字段
> - `goals` 去掉了 `is_archived/currency`，改用 `status (active/achieved/archived)`

| 页面 | 文件 | 关键特性 |
|---|---|---|
| 预算管理 | [BudgetsView.vue](file:///d:/project/homeledger/web/src/views/BudgetsView.vue) | 3 卡总览 + 4 类型预算卡片（overall/category/account）+ NProgress 进度条 + 状态色（绿/黄/红）+ 4 周期 |
| 周期账单 | [RecurringView.vue](file:///d:/project/homeledger/web/src/views/RecurringView.vue) | 4 周期（月/周/年/日）+ 每月几号 / 每周几 / 间隔 + 手动补登（`runRecurringNow`）+ 自动入账开关 |
| 订阅扣费 | [SubscriptionsView.vue](file:///d:/project/homeledger/web/src/views/SubscriptionsView.vue) | 12 预设快速添加（Netflix/Spotify/...）+ 4 状态（已订阅/试用/暂停/取消）+ 立即记账/跳一次/暂停/取消 |
| 储蓄目标 | [GoalsView.vue](file:///d:/project/homeledger/web/src/views/GoalsView.vue) | 3 状态（进行中/已达成/已归档）+ NProgress 进度 + 存入抽屉（关联账户/分类/自动入账） |

**端到端验证**：
- 总预算 8000 / 分类预算 2000 创建，used=35.50、ratio 正确
- 月租 3500 周期账单创建成功，next_run_at 推进正常
- 8000 储蓄目标，存入 500 → 自动生成"储蓄目标存入"交易 ✓

---

## 阶段 3-D 实施完成（借贷/导入）

> **重要**：本阶段发现并修复了**借贷 schema 错位**——`debts` 表实际为 `balance_cents + status (open/closed)`，去掉了错误的 `is_settled/interest_rate/start_date/settled_at/settled_txn_id` 字段。

| 页面 | 文件 | 关键特性 |
|---|---|---|
| 借贷台账 | [DebtsView.vue](file:///d:/project/homeledger/web/src/views/DebtsView.vue) | 4 张 StatCard（未结借出/未结借入/净头寸/已结清）+ 4 状态筛选 + 卡片含到期日/倒计时/逾期标红 + 借出/借入双抽屉 + 结算抽屉（自动生成"收回借款/偿还借款"交易） |
| 账单导入 | [ImportView.vue](file:///d:/project/homeledger/web/src/views/ImportView.vue) | 3 步流程：上传 → 预览 → 完成；NUpload 拖拽；3 引导卡（支付宝/微信/通用）；预览含来源/编码/笔数/3 类统计（收/支/转）+ AI 自动分类；NDataTable 样本预览 200 笔；导入历史 |

**端到端验证**：
- 借出 ¥2000 + 借入 ¥500 + 结算借出（自动生成 txn_id=3 收回借款交易）✓
- 通用 CSV（4 笔）预览 + 提交导入：4 笔全部入账，AI 分类全中（午餐→餐饮、超市→购物、工资→职业收入、地铁→交通）✓

---

## 整体进度

| # | 阶段 | 状态 | 视图数 |
|---|---|---|---|
| 0 | 脚手架 | ✅ | - |
| 1 | API 化 | ✅ | - |
| 2 | 前端骨架 | ✅ | - |
| 3-A | 核心 4 页 | ✅ | 4/32 |
| 3-B | 账户/分类/标签 | ✅ | 4/32 |
| 3-C | 规划 4 页 | ✅ | 4/32 |
| 3-D | 借贷/导入 | ✅ | 2/32 |
| 3-E | 系统 5 页 | ✅ | 5/32 |
| 3-F | 查询 5 页 | ✅ | 5/32 |
| 4 | 打磨 | ✅ | - |
| 5 | 退役旧前端 | ✅ | - |

**已完成：32/32 视图（100%）**
