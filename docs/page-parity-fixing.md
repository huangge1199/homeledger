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
| A2 | 空白页全局阻断（RouterView 嵌套） | — | `AppShell.vue` | 已确认 | 见下方修复清单 |

A1 已修复内容：

| # | 问题 | 改法 |
|---|---|---|
| 1 | 通知中心缺未读数徽标 | 菜单项挂红色徽标（99+ 封顶）；后端 `/api/v1/session` 透出 `unreadCount`，store 增该字段与 `setUnread()` |
| 2 | 「AI 截图记账」被隐藏 | 恢复无条件展示 —— 老版无 `aiUsable` 门控，未配模型时页面内提示走规则解析 |
| 3 | 「成员权限」被隐藏 | 恢复全员可见 —— 老版 GET 不校验 manage，仅写操作校验 |
| 4 | 缺侧栏底部 | 补 `sidebar-foot`：主题切换 + `@用户名`；菜单区改独立滚动，底部固定 |
| 5 | 缺移动端底部导航 | 补五格（总览/明细/＋/报表/AI），FAB 凸起，桌面端隐藏，内容区补底部占位 |
| 6 | 顶栏副标题 | **按方案 A 不做** —— 各页 `PageHead` 已自带 sub，副标题只在页面内显示，避免同一句话出现两次 |
| 7 | 换头像需进设置页 | 改为点头像直接换：hover 光圈 + 2MB 限制 + 图片类型校验 |
| 8 | 缺 AI 助手浮窗 | 新增 `AiPanel.vue`：悬浮球 + 面板，复刻旧版 `assistant.js`（Enter 发送 / Esc 关闭 / 最多 6 图 / 缩略图 / 打字动画 / 结果卡片 / 未配置跳设置） |
| 9 | 缺空账本引导态 | 无账本时内容区显示引导卡 + 「去创建账本」 |
| 10 | 菜单项样式与老版不符 | 去 naive 固定 42px 行高改自适应、`item-height=38`、内容 `padding: 8px 12px`、高亮块内缩 4px、圆角 9px、分组间距 4px；分组标题补内边距 + 11px faint + 字距；品牌区去底边框改留白；侧栏容器 `padding: 16px 12px` |
| 11 | 图标与文字不对齐 | 图标容器高度改 20px 与文字 `line-height: 20px` 同高；emoji 内部 `translateY(-5px)`（用户手工调定的值） |

有意保留的新版差异：
- 顶栏副标题：按方案 A 定案。若后续想改回老版分工，需在路由补 `meta.sub` 并删掉各页 `PageHead` 的 `sub`。
- 侧栏配色：用户明确「配色不用管」，保留 naive 绿色主色与 emoji 图标，不换老版蓝色 + 线性 SVG 图标。

### A2 已修复内容（全局阻断，优先级高于所有页面）

**现象**：点侧栏任意菜单，右侧内容区全白（侧栏与顶栏正常）。

**根因**：路由是「扁平顶层路由」（`/` 直接指向 `DashboardView`，无嵌套 children），而架构上每个视图自己包一层 `<AppShell>`。`AppShell` 内容区却写了 `<RouterView v-else />` —— 由于顶层路由没有子路由，内层 `RouterView` 解析不到匹配项，渲染为空注释，页面主体整体消失。

**修复**：`AppShell.vue` 内容区由 `<RouterView v-else />` 改为 `<slot v-else />`，并移除不再使用的 `RouterView` 导入。页面内容经各视图已有的默认插槽传入，与 `BlankLayout.vue` 的既有写法保持一致（该文件注释里已记录过这个坑，只是 AppShell 漏改）。

**教训**：`AppShell` / `BlankLayout` 是纯布局组件，内容必须靠 `slot` 传入，**绝不能内嵌 `RouterView`**；顶层扁平路由下内嵌 `RouterView` 必然渲染空白。

---

### B 组｜记账

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| B1 | 总览 | `dashboard.ejs` | `DashboardView.vue` | 已确认 | 见下方修复清单 |
| B2 | 记一笔 / 编辑 | `txn-form.ejs` | `TxnFormView.vue` | 待修 | |
| B3 | 账单明细 | `transactions.ejs` | `TransactionsView.vue` | 待修 | |
| B4 | 记录详情 | — | `TxnDetailView.vue` | 待修 | 新增页，重点核字段与附件展示 |
| B5 | 记账日历 | `calendar.ejs` | `CalendarView.vue` | 待修 | |
| B6 | AI 截图记账 | `ai.ejs` | `AiView.vue` | 待修 | |
| B7 | 截图库 | `attachments.ejs` | 缺独立页 | 待修 | 老版有 `/attachments` 图库页 + 分页；新版无路由 |

B1 第一轮修复（后端 `/api/v1/dashboard` 数据本来就全，缺的是前端消费）：

| # | 问题 | 改法 |
|---|---|---|
| 1 | 统计卡信息缺失 | 支出/收入补「环比上月 ↑↓ X%」（`cur` vs `prev`）；结余补「共 N 笔 · 日均 ¥X」；净资产补「资产 ¥X · 负债 ¥Y」。顺序调为 支出→收入→结余→净资产 |
| 2 | 缺 AI 未配置提示 | 补提示条 + 「去配置 →」，放统计卡上方，仅未配置时显示 |
| 3 | 趋势图类型不对 | `LineChart` → `BarChart`（老版双柱：支出红 / 收入绿），数据除 100 换算为「元」，卡头补「近 6 个月」「详细报表 →」 |
| 4 | 卡片命名与老版不一致 | 「最近交易」→「最近记录」，卡头补「全部 →」 |
| 5 | 支出构成缺图例 | 补环图右侧图例（色点 + 名称 + 占比条 + 百分比 + 金额），环图用分类自带颜色，卡头补月份 |
| 6 | 缺「今日速览」卡 | 新增：今日支出（`todayList` 筛 `is_expense` 求和）+ 今日笔数 + 两个快捷按钮 |
| 7 | 待报销卡显示逻辑不对 | 改条件显示（`count > 0`），补「N 笔待报销 + 金额」和「去处理」跳转 |
| 8 | 缺「预算进度」卡 | 新增：最多 4 条，图标+名称、`已用 / 总额`、进度条（超支红 / >80% 橙 / 正常绿）、底部提示 |
| 9 | 订阅卡结构不对 | 「订阅年支出预估」改为老版「订阅扣费」：每月固定 + 全年 + 生效项数 + 前 3 项（下次扣费 3 天内标红） |
| 10 | 账户卡命名与信息缺失 | 「账户概览」→「账户余额」，补「管理 →」、虚线分隔、负余额红色、超 6 个显示「还有 N 个账户…」 |
| 11 | 缺三张规划类卡 | 新增「借贷」（别人欠我 / 我欠别人）、「储蓄目标」（进度条 + 百分比）、「即将自动记账」（下次执行 + 自动/提醒），均条件显示 |

布局调整：老版是「左栏（趋势 / 最近记录 / 支出构成）+ 右栏（8 个小卡）」两列；新版原先为 2×2 等宽网格，改为 `l:2 / l:1` 两列，与老版 `grid-main` 一致。另移除原「本月每日支出」卡 —— 老版总览页无此区块，该图在 C1 报表页。

B1 第二轮修复（用户截图反馈后）：

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 12 | **全站图表空白**（根因，影响面超出总览页） | `height` prop 用 `typeof === 'number'` 判断，但页面传的是字符串 `height="220"`，判断失败使 CSS 变成无单位的 `height: 220`（无效），容器塌陷为 0。改为 `/^\d+$/.test(String(height))` 兜底补 `px` | `BarChart.vue`<br>`LineChart.vue`<br>`DonutChart.vue` |
| 13 | 星期只显示「二」 | 加「星期」前缀，与老版一致 | `TxnList.vue` |
| 14 | 明细行显示消费时刻 | **新增 `txn_time` 字段**（方案 C）：`txn_date` 只到天不够用，且 `created_at` 是录入时间（消费日 10-12 的记录录入于 10-19），语义不符。新字段存 `HH:mm`，可空。改 `db.js` 建表 + 幂等迁移、`txn.js` 读写（正则校验 `HH:mm`/`HH:mm:ss`，统一存 `HH:mm`）、路由透传、`TxnFormView` 加 `NTimePicker`、列表有值才显示 |
| 15 | 月份标签与下拉框基线错位；操作按钮溢出卡片 | `.actions` 改 `align-items: center`；加 `flex: 0 1 auto` + `max-width: 100%`；父级加 `flex-wrap: wrap`；`.hl-page-head` 加 `padding-right: 16px` 避免贴右边缘 | `PageHead.vue` |
| 16 | 环图过粗 | 原 `radius: ['26px', '78%']` 内外径基准不一致。改为先按老版公式 `r = size/2 - thickness/2 - 2` 算像素半径再换算百分比 —— echarts 的 radius 百分比基准是**容器短边的一半（半径）**，不是直径。新增 `size` prop（默认 190），`.donut-fig` 容器宽度同步改 190px | `DonutChart.vue`<br>`DashboardView.vue` |
| 17 | 下拉框文字与按钮基线不一致 | 补 `font-family: inherit` + `line-height: 30px` | `DashboardView.vue` |
| 18 | 手机端 4 卡挤在一行，金额换行 | 改单列：`grid-template-columns: minmax(0,1fr)` + 子项 `span 1`；金额加 `white-space: nowrap`，窄屏（≤480px）字号降至 20px | `DashboardView.vue`<br>`StatCard.vue`（全站共用） |

> 有意偏离老版一处：老版手机端统计卡为 2 列（`app.css` `@media max-width:820px`），但 2 列下大额金额换行且左右对齐困难，经用户确认改为单列。

#### 消费时刻方案（已定：方案 C）

原需求「明细行显示消费时刻」一度误用 `created_at` —— 查库确认后推翻：`created_at` 是**录入时间**（消费日 `10-12` 的记录录入于 `10-19 08:53`），语义不符；`txn_date` 则只到天（`todayStr()` = `nowStr().slice(0, 10)`）。老版账单列表也未显示时刻（`partials/txn-list.ejs` 只有日期 + 星期 + 金额）。

**采用方案 C：新增 `txn_time` 字段**，语义清晰、不影响现有筛选与分组逻辑。存储格式统一为 `HH:mm:ss`（24 小时制含时分秒）。

| 环节 | 改动 |
|---|---|
| 建表 | `db.js` `transactions` 表加 `txn_time TEXT`（可空） |
| 迁移 | 复用 `ensureColumn` 幂等迁移，老库自动补列，已实测生效 |
| 新建 | `txn.js` INSERT 加字段，正则 `^([01]\d\|2[0-3]):([0-5]\d)(?::([0-5]\d))?$` 校验后归一化为 `HH:mm:ss`（秒缺省补 `00`），不合法置 `null` |
| 更新 | `updateTransaction` 支持覆盖与清除（传空串清除，未传保留原值），同一套归一化 |
| 路由 | `api.v1.transactions.js` `pickBody` 透传 `txn_time` |
| 表单 | `TxnFormView.vue` 日期下方加 `NTimePicker`（`format="HH:mm:ss"`、可清除、默认空），提交时 `dayjs().format('HH:mm:ss')` |
| 列表 | `TxnList.vue` 账户名后以 `·` 分隔显示时刻，**有值才显示**，等宽数字 |

归一化边界已验证：`08:30`→`08:30:00`、`08:30:45`→`08:30:45`、`00:00`→`00:00:00`；`8:30`、`24:00`、`12:60`、`08:30:99`、空串、非字符串全部置 `null`。

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
| 2026-10-19 | A1 | 建计划表；侧栏 9 项全部完成（4 项菜单差异 + 移动端底导 / AI 浮窗 / 空账本态等 5 项），经 4 轮截图迭代对齐侧栏样式。**已确认** |
| 2026-10-19 | B1 | 总览页第一轮 11 项（详见上表），布局改左 2 右 1 两列 |
| 2026-10-19 | B1-2 | 第二轮 7 项（12~18）。重点：修复三图表组件 `height` 类型判断 bug —— 此前**全站图表均为空白**。**已确认** |
| 2026-10-19 | A2 | **全局阻断**：`AppShell` 内嵌 `<RouterView>` 致所有页面内容区空白，改为 `<slot>`。属架构遗留缺陷，非对等修复范畴 |
