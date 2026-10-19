# 页面功能对等修复计划（老 v1 EJS → 新 v2 Vue3）

> 目的：以老项目 `D:\project\homeledger-old` 为基准，逐页核对新版功能对等性并修复。
> 节奏：**一次只修一个页面 → 用户验证通过 → 再进入下一个**。未获确认不推进。
> 状态字段：`待修` / `修复中` / `待确认` / `已确认` / `无差异`
> 续接提示：新对话先读本文件，从「修复中/待确认」的行继续。

---

## 修复原则

| 项 | 约定 |
|---|---|
| 基准 | 老项目 EJS 为准，新版缺失/行为不一致都要补齐 |
| 范围 | 功能对等（含权限门控、字段、交互、空态、分页） |
| 不做 | 不重设计视觉；仅在 Naive UI 无法表达时微调样式 |
| 验证 | `cd web && npm run build` 必须 0 错误；后端改动后 `curl` 自检 |
| 不做 | 不启动/停止项目（由用户自行控制） |
| 提交 | 不主动 git commit |

---

## 页面清单与进度

按老项目侧栏菜单顺序排列（`layout.ejs`）。

### A 组｜布局与裸页

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| A1 | 侧栏 + 顶栏 + 移动端 + AI 浮窗 | `layout.ejs` | `AppShell.vue` + `AiPanel.vue` | 已确认 | 见下方修复清单 |

A1 已修复内容：
1. 通知中心菜单项补未读数红色徽标（老版 `.count`），后端 `/api/v1/session` 透出 `unreadCount`，store 增 `unreadCount` + `setUnread()`
2. 「AI 截图记账」恢复无条件展示（旧版无 `aiUsable` 门控，未配置模型时页面内提示规则解析）
3. 「成员权限」恢复所有登录成员可见（旧版 GET 不校验 manage，写操作才校验）
4. 补侧栏底部（旧版 `sidebar-foot`）：主题切换按钮 + `@用户名`；菜单区改独立滚动，底部固定
5. 补移动端底部导航（旧版 `.mobile-nav`）：总览/明细/＋/报表/AI 五格，FAB 凸起，桌面端隐藏，内容区补底部占位
6. 顶栏副标题：**按方案 A 不做** —— 新版各页 `PageHead` 已自带 sub 文案，副标题只在页面内显示，顶栏只留标题，避免同一句话出现两次。（老版 `layout.ejs` 顶栏同时渲染 title+sub）
7. 点头像直接换头像（旧版全站通用，不进设置页）：hover 光圈 + 2MB 限制 + 图片类型校验
8. 新增 `AiPanel.vue` —— AI 助手全站浮窗（悬浮球 + 面板），复刻旧版 `assistant.js`：Enter 发送 / Esc 关闭 / 最多 6 图 / 缩略图 / 打字动画 / 识别结果卡片 / 未配置跳设置
9. 补空账本引导态（旧版 `no-ledger.ejs`）：无账本时内容区显示引导卡 + 「去创建账本」
10. 侧栏菜单项样式对齐老版 `.nav-item`：去掉 naive 固定 42px 行高改自适应、`item-height=38`、内容 `padding: 8px 12px`、高亮块 `::before` 内缩 4px、圆角 9px、分组 `margin-bottom: 4px`；分组标题补 `padding: 12px 10px 6px` + 11px faint + 字距；品牌区去底边框改留白；侧栏容器 `padding: 16px 12px`
11. 图标与文字对齐：图标容器高度 20px 与文字 `line-height: 20px` 同高，emoji 内部 `translateY(-5px)`（用户手工调定的值）

未做（新版有意不同，待用户决定）：
- 顶栏副标题：**已按方案 A 定案**（只在页面内 `PageHead` 显示）。若后续想改回老版分工，需在路由补 `meta.sub` 并删掉各页 `PageHead` 的 `sub`。
- 侧栏配色：用户明确「配色不用管」，保留 naive 绿色主色与 emoji 图标，不换老版蓝色 + 线性 SVG 图标。

---

### B 组｜记账

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| B1 | 总览 | `dashboard.ejs` | `DashboardView.vue` | 待修 | |
| B2 | 记一笔 / 编辑 | `txn-form.ejs` | `TxnFormView.vue` | 待修 | |
| B3 | 账单明细 | `transactions.ejs` | `TransactionsView.vue` | 待修 | |
| B4 | 记录详情 | — | `TxnDetailView.vue` | 待修 | 新增页，重点核字段与附件展示 |
| B5 | 记账日历 | `calendar.ejs` | `CalendarView.vue` | 待修 | |
| B6 | AI 截图记账 | `ai.ejs` | `AiView.vue` | 待修 | |
| B7 | 截图库 | `attachments.ejs` | 缺独立页 | 待修 | 老版有 `/attachments` 图库页 + 分页；新版无路由 |

---

### C 组｜分析

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| C1 | 报表分析 | `reports.ejs` | `ReportsView.vue` | 待修 | 老版单页多区块；新版 5 tab，需核区间/维度对齐 |
| C2 | 搜索筛选 | `search.ejs` | `SearchView.vue` | 待修 | |

---

### D 组｜资产与计划

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| D1 | 账户管理 | `accounts.ejs` | `AccountsView.vue` | 待修 | |
| D2 | 账户详情 | `account-detail.ejs` | `AccountDetailView.vue` | 待修 | |
| D3 | 预算管理 | `budgets.ejs` + `partials/budget-cat-options.ejs` | `BudgetsView.vue` | 待修 | |
| D4 | 周期账单 | `recurring.ejs` | `RecurringView.vue` | 待修 | |
| D5 | 订阅扣费 | `subscriptions.ejs` | `SubscriptionsView.vue` | 待修 | 老版 16.5KB，功能最重之一 |
| D6 | 借贷台账 | `debts.ejs` | `DebtsView.vue` | 待修 | |
| D7 | 储蓄目标 | `goals.ejs` | `GoalsView.vue` | 待修 | |

---

### E 组｜数据

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| E1 | 分类管理 | `categories.ejs` | `CategoriesView.vue` | 待修 | |
| E2 | 标签管理 | `tags.ejs` | `TagsView.vue` | 待修 | |
| E3 | 账单导入 | `import.ejs` | `ImportView.vue` | 待修 | |
| E4 | 导出备份 | `export.ejs` | `ExportView.vue` | 待修 | |

---

### F 组｜协作与系统

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| F1 | 账本管理 | `ledgers.ejs` | `LedgersView.vue` | 待修 | |
| F2 | 成员权限 | `members.ejs` | `MembersView.vue` | 待修 | |
| F3 | 通知中心 | `notifications.ejs` | `NotificationsView.vue` | 待修 | 需同步 `session.setUnread()` |
| F4 | 设置 | `settings.ejs`（25KB，最大） | `SettingsView.vue` | 待修 | |
| F5 | 关于 | `about.ejs` | `AboutView.vue` | 待修 | |

---

### G 组｜裸页（无侧栏）

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| G1 | 裸布局 | `layout-blank.ejs` | `BlankLayout.vue` | 待修 | |
| G2 | 登录 | `login.ejs` | `LoginView.vue` | 待修 | |
| G3 | 初始化 | `setup.ejs` | `SetupView.vue` | 待修 | |
| G4 | 注册 | `register.ejs` | `RegisterView.vue` | 待修 | |
| G5 | 加入账本 | `join.ejs` | `JoinView.vue` | 待修 | |
| G6 | 404 | `error.ejs` | `NotFoundView.vue` | 待修 | |
| G7 | 空账本态 | `no-ledger.ejs` | 缺 | 待修 | |

---

## 优先级建议

| 优先级 | 页面 | 理由 |
|---|---|---|
| P0 | A1、B1、B2、B3 | 高频入口，影响全局导航与记账闭环 |
| P0 | F4 设置 | 老版 25KB，功能最全，最易漏 |
| P1 | D1、D5、B6、B7 | 资产与订阅是核心能力 |
| P1 | C1 报表 | 图表/区间逻辑复杂 |
| P2 | D2~D7、E1~E4 | 常规 CRUD |
| P2 | F1~F3、F5 | 系统页 |
| P3 | G1~G7 | 裸页，改动相对独立 |

---

## 变更日志

| 日期 | 页面 | 内容 |
|---|---|---|
| 2026-10-19 | A1 | 建计划表；侧栏菜单 4 项 + 后续 5 项（移动端底导/顶栏副标题位/点头像换头像/AI 浮窗/空账本态）全部完成，待用户确认 |
