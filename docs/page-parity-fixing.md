# 页面功能对等修复计划（老 v1 EJS → 新 v2 Vue3）

> 目的：以老项目 `~\project\homeledger-old` 为基准，逐页核对新版功能对等性并修复。
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
| A3 | 全局 fetch+FormData 被 CSRF 拦截 | — | `session.ts` | 待确认 | 见下方修复清单 |

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

### A3 已修复内容（fetch + FormData 被 CSRF 拦截，影响退出登录与切账本）

**现象**：右上角点「退出登录」报 403。

**根因**：`server.js` 中 `auth.csrfProtect` 全局挂载（`/api/v1` 豁免，靠 axios 拦截器注入 `X-CSRF-Token` header）。但 store 里两处用原生 `fetch` 直发非 v1 端点，body 用的是 `FormData` —— 浏览器自动设为 `multipart/form-data`，而后端只有 `express.urlencoded` / `express.json`，**multipart 不会被解析**：

- `logout()`：只把 `_csrf` 放 FormData，既没带 header，body 也解析不到 → 403
- `switchLedger()`：带了 `X-CSRF-Token` header 能过 CSRF，但 `ledger_id` 同样在 multipart 里解析不到 → **切账本静默失效**（session.ledgerId 从未被更新）

**修复**：两处 `new FormData()` 改为 `new URLSearchParams()`，浏览器自动以 `application/x-www-form-urlencoded` 发送，`express.urlencoded` 可正常解析。

**教训**：SPA 里直发非 `/api/v1` 的 SSR 遗留 POST 端点时，表单体必须用 `URLSearchParams`（urlencoded）；`FormData`（multipart）在后端没有对应解析中间件，字段全会丢。

---

### B 组｜记账

| # | 页面 | 旧文件 | 新文件 | 状态 | 差异备注 |
|---|---|---|---|---|---|
| B1 | 总览 | `dashboard.ejs` | `DashboardView.vue` | 已确认 | 见下方修复清单 |
| B2 | 记一笔 / 编辑 | `txn-form.ejs` | `TxnFormView.vue` | 已确认 | 见下方修复清单；2026-10-19 补 3 处小修（行距/开关/分类浮层）已并入确认 |
| B3 | 账单明细 | `transactions.ejs` | `TransactionsView.vue` | 已确认 | 见下方修复清单（第一轮 15 项 + 第二轮 19 项 + 第三轮 5 项 + 第四轮 4 项） |
| B4 | 记录详情 | — | `TxnDetailView.vue` | 已确认 | 新增页（老版是弹窗，非独立页），详见下方修复清单 |
| B5 | 记账日历 | `calendar.ejs` | `CalendarView.vue` | 已确认 | 见下方修复清单（第一轮 9 项 + 第二轮 8 项） |
| B6 | AI 截图记账 | `ai.ejs` | `AiView.vue` | 待确认 | 见下方修复清单（15 项，含 2 个隐性缺陷 + 2 条控制台警告修复）；「全部 →」指向的 `/attachments` 独立页待 B7 补齐 |
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

#### B2 记一笔 / 编辑页修复

后端能力齐备（`api.v1.transactions.js` 已透传 `split_name`/`share_amount`、`GET` 已返回 `attachments`/`splits`，`txn.js` 有 `saveSplits`），缺的是前端接入。

| # | 问题 | 改法 |
|---|---|---|
| 1 | 缺 AA 分账 | 补分账卡：成员名 + 金额行、「＋ 添加分摊人」、「按人数均摊」（总额分 N 份，余额补第一行避免丢分）、单行 ✕ 删除；提交时只取有名字的行，映射为 `split_name[]` / `split_amount[]`；编辑模式回填 `data.splits` |
| 2 | 多币种功能缺失且币种硬编码 | 补 `NCollapse` 折叠区（默认收起），11 币种下拉 + 汇率输入（后缀 `≈ ¥`）；提交改为用 `currency` / `rate`，去掉原先写死的 `currency: 'CNY'`；编辑模式回填 |
| 3 | 账户标签固定不变 | 补 `accountLabel` 计算属性，14 种类型各自对应（支出→支付账户 / 收入→收款账户 / 转账→从账户 / 借出→从哪个账户借出 / 借入→收到哪个账户 / 投资→付款·收款账户），与老版 `acc-label` 一致 |
| 4 | 投资类型缺转入账户 | `needsToAccount` 由仅 `transfer` 扩为 `transfer` + `invest_buy` + `invest_sell`，标签「转入 / 投资账户」 |
| 5 | 缺成员字段 | 补只读成员输入框，显示记录人（编辑模式取 `member_name`，新建取 session 用户），与老版 `disabled select` 一致 |
| 6 | 缺元信息卡 | 编辑模式补「创建时间 / 最后修改 / 来源」键值卡（`.kv` 样式，等宽数字） |
| 7 | 缺关联账单截图 | 编辑模式补截图卡：网格画廊（3:4 封面）+ 采集时间与体积 + 「全部截图 →」跳 `/attachments`，无图不显示 |
| 8 | 商户文案不符 | 「商户」改「商家 / 对方」，placeholder 改老版文案，补提示「（借贷时的对方姓名很关键）」 |
| 9 | 缺统计口径提示 | 底部补固定提示：转账 / 借贷 / 投资买卖不计入收支统计，只影响账户余额 |

顺带修一处：编辑回填的局部变量 `const t = data.txn` 与新增的响应式 `const t = ref(...)` 同名遮蔽，已改名 `tx`。

#### B3 账单明细修复

后端能力齐备（`txn.listTransactions` 已返回 `sum`、列表 SELECT 已 JOIN member/tag/source/status 等所有展示字段），缺的是前端消费 + 一处后端路由透传。

| # | 问题 | 改法 |
|---|---|---|
| 1 | 后端 list API 不返回 `sum` | `api.v1.transactions.js` list 透传 `result.sum`；无账本占位也补 sum: { income: 0, expense: 0 } 兜底 |
| 2 | `reimbursable` URL 参数不匹配 | `readListFilter` 加映射：`1/true/yes` 全部归一化为 `yes`（与老版 SSR 条件一致） |
| 3 | 缺时间快选 chips（全部/本月/近7/近30/今年） | `timeChips` 数组 + `apply()`；近 7/30 天用 dayjs 算 `from`/`to`；今年用当年起止 |
| 4 | 缺类型快选 chips（不限/只支出/只收入/只转账/待报销/AI/导入/订阅） | `kindChips` 数组，状态互斥；其中「待报销/AI/导入/订阅」是 toggle 式（点中再点取消） |
| 5 | 缺成员筛选 | 加 `memberId` ref + `memberOptions`，`formData().members` 取 `user_id/display_name` |
| 6 | 缺排序筛选（最新/最早/金额升降） | 加 `sort` ref + `sortOptions`；默认 `date_desc` 不上 URL |
| 7 | 缺汇总行（笔数/支出/收入/结余） | `list.sum` 渲染；用 `AmountDisplay` 保证符号/色彩与列表内一致；结余按正负切换 income/expense 色 |
| 8 | 缺分页 | `page` ref + URL 同步；「上一页 / N / M / 下一页」三段式 |
| 9 | 缺「清空筛选」入口 | `hasFilter` computed + 顶栏按钮，一键还原全部条件 |
| 10 | 批量条缺「报销入账 + 入账账户」 | `reimburseAccountId` + `bulkReimburse`；未选账户时由后端回落到账本默认账户 |
| 11 | 行内编辑/删除按钮 | `TxnList` 新增 `show-actions` prop + `act` 区（hover 显示），点击事件不冒泡到行点击 |
| 12 | 列表行缺 member / 标签 / source 徽标 / 待入账 | `TxnList` 补齐：`member_name`、源 chip map（AI/导入/周期/订阅）、`status=pending` 徽标、可报销徽标 |
| 13 | 转账/投资类行缺双边账户显示 | `sub` 区分 `is_transfer / invest_buy / invest_sell` → `账户A → 账户B`，与老版 txn-list.ejs 一致 |
| 14 | 多币种行缺币种后缀 | `amount-col` 下挂 `cur`，仅 `currency !== 'CNY'` 时显示 |
| 15 | 同比「收支差」delta 取错基线 | 原版用 `cur.income - prev.income` 作 delta 显示但加了 `reverse-delta` 自相矛盾；改为「本月支出 vs 上月支出」环比，且只在锁定到某月时显示 |

行为细节：

- `txFormData().members` 后端是 `[{ user_id, display_name, role, ... }]`，前端 map 为 `{ id, name }`
- 同比只在「按月筛选」时拉，避免全选/近 7 天场景下误导
- URL 同步去掉默认值（`page=1 / sort=date_desc / reimbursable=0`），链接更短
- 行内按钮在非批量模式下 hover 才显示，批量模式隐藏避免误点

##### B3 第二轮修复（2026-10-21）

以老版 `transactions.ejs` + `partials/txn-list.ejs` 逐条比对，补齐第一轮遗漏项，并修掉 3 个「编译通过但运行时/显示错」的隐性缺陷。

**A. 隐性缺陷修复（编译不报错，最易漏）**

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 16 | **筛选网格完全失效** | 模板用了 `<NGrid>` / `<NGridItem>`，但 import 列表里**没有这两个**。`vue-tsc` 不报未定义模板组件，编译 0 错误，产物却是 `resolveComponent("NGrid")`（运行时按字符串找组件）→ 筛选区布局塌陷。补 import 后产物变为静态导入 | `TransactionsView.vue` |
| 17 | **行内支出金额显示 `+¥50.00`** | 库里支出金额存正数，而 `AmountDisplay` 的 `fmtAmount(cents, sign=true)` 对正数恒加 `+`。老版 `txn-list.ejs` 是**按 `is_income`/`is_expense` 显式决定符号**。新增 `signedAmount(t)`：支出取 `-Math.abs`、收入取 `Math.abs`、中性保持原值 | `TxnList.vue` |
| 18 | **日小计显示 `++¥123.00`** | 外层已有 `+`/`-` 前缀，`AmountDisplay` 又传了 `sign=true` → 双前缀。改 `sign=false` | `TxnList.vue` |

**B. 统计口径修正**

| # | 问题 | 改法 |
|---|---|---|
| 19 | **日小计与汇总行数字对不上** | 前端原用 `is_income`/`is_expense`（余额方向宽口径，含 borrow/lend/repay）自行累加日小计；后端 `sum` 用严格口径（`INCOME_TYPES = income/interest/refund/reimburse`、`EXPENSE_TYPES = expense/fee`）。**改为直接消费后端 `groupByDate` 返回的 `data.groups`**，口径与汇总行天然一致 |

> 口径分层说明：收支统计用 `INCOME_TYPES`/`EXPENSE_TYPES`；UI 符号与配色用 `decorate()` 的 `is_income`/`is_expense`（含借贷类）。两者用途不同，不可混用。已在 `utils/txnTypes.ts` 补 `INCOME_STAT_TYPES` / `EXPENSE_STAT_TYPES` 常量作为前端单一来源。

**C. 老版有、新版缺的功能补齐**

| # | 问题 | 改法 |
|---|---|---|
| 20 | 分类下拉是扁平列表 | 改 `NSelect` 分组（`type: 'group'`）：「支出」「收入」两组，父级前缀 `📁`，子级全角空格缩进 —— 对齐老版 `optgroup` |
| 21 | 汇总行缺「导出」入口 | 汇总行改 `justify-content: space-between`，右侧加 `NButton quaternary` 跳 `/export`（老版 `transactions.ejs` 第 90 行） |
| 22 | 缺「全选本页」 | 列表卡顶部补 `NCheckbox`（含 `indeterminate` 半选态）+「勾选后可用下方批量操作」提示，对应老版 `#bulk-all` |
| 23 | 批量「改分类 / 加标签」有函数无 UI | 补 `NSelect`（`bulkCategoryOptions`，只列二级分类带父级路径）+「应用」按钮；`NInput` 标签名 +「加标签」按钮 |
| 24 | 分页只有「上一页 / N / M / 下一页」 | 新增 `pageNumbers` computed：首页 + 省略号 + 当前页前后各 2 页 + 省略号 + 末页，对齐老版 pager |
| 25 | 每页条数与老版不一致 | 前端 50 → **40**（老版 `f.pageSize = 40`） |
| 26 | 分类名不可点 | 老版分类名是 `<a class="txn-cat" href="/transactions?category_id=...">`。`TxnList` 新增 `filter-category` 事件，分类名改可点击 `<a>`（hover 变主色），点击后本页设 `categoryId` + `page = 1` |

**D. `TxnList.vue` 行内细节（组件全站共用，同时影响 B1 总览页与 D2 账户详情页）**

| # | 问题 | 改法 |
|---|---|---|
| 27 | 报销徽标状态判断错 | 原来按 `status === 'pending'` 判断可报销；老版按 **`reimbursed_at`** 区分「已报销 / 待报销」。`TxnItem` 补 `reimbursed_at` 字段，徽标按其有无显示 `已报销`（success）/ `待报销`（warning） |
| 28 | 「待入账」文案不符 | 改回老版「**待确认**」；且与报销徽标由 `v-else-if` 改为各自独立 `v-if`（两者可同时出现） |
| 29 | 附件徽标位置错 | `📎 N` 从 title 行移回 **sub 行**（老版位置） |
| 30 | 商家带 `@` 前缀 | 去掉 `@`，直接显示商家名 |
| 31 | 备注位置错 | `note` 从 sub 行移到 **title 行**，与商家名并列（老版 note 与 merchant 同在 title 行） |
| 32 | 账户名无兜底 | 兜底文案改老版「**未指定账户**」，sub 行不再用 `v-if` 裁剪（保证行高一致） |
| 33 | 相对日期缺口径 | `relLabel` 补老版 `helpers.relDate` 口径：「今天 / 昨天 / **前天** / M月D日 / **跨年 YYYY年M月D日**」 |

**遗留（不属于 B3）**：`SettingsView.vue` 同样存在 `<NGrid>` 未 import 的问题（属 F4 设置页范围），待 F4 一并修复。

**B3 第三轮修复（2026-10-21，分页样式）**

用户反馈分页区「看着别扭」，对照老版 `.pager` 样式修正。

| # | 问题 | 改法 |
|---|---|---|
| 34 | 「上一页 / 下一页」用 naive `NButton`，与数字页码按钮风格割裂 | 老版 `.pager` 内所有元素（上一页 / 页码 / 下一页）走**同一套** `.pager a` 样式。改为原生 `<button class="pg">`，与页码按钮完全同款：白底 + 1px 边框 + 7px 圆角（对齐老版 `--radius-xs`）+ 32px 方形 |
| 35 | 「上一页 / 下一页」恒显、禁用态灰 | 老版是**按需出现**（`page > 1` 才显示上一页，`page < total` 才显示下一页），无禁用态。改为条件渲染 |
| 36 | 省略号渲染成裸文字，宽度塌陷 | 老版 `.pager .gap` 同样是 32px 方形占位（`border: 0; background: transparent`），保持与其他按钮等高对齐，补 `min-width/height/grid` |
| 37 | 页码窗口算法与老版不同 | 老版是**固定 5 页滑动窗口**：`start = max(1, cur-2)`、`end = min(total, start+4)`、`start = max(1, end-4)`；首页仅在 `start > 1` 时单独列出，末页仅在 `end < total` 时单独列出。新版旧算法在首页只显示 3 页、末页少 1 页，改为完全同构 |
| 38 | 按钮字体不继承 | `.pg` 补 `font-family: inherit`（原生 button 默认不继承） |

**B3 第四轮修复（2026-10-21，用户验收反馈）**

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 39 | 明细行缺消费时刻 | 后端 `txn_time` 字段（`HH:mm:ss`）一直有，前端 `TxnList` 也早写好了 `itemTime()`，但**从未在模板里用过**。在 sub 行「成员」后补时间显示（`tabular-nums` 等宽对齐） | `TxnList.vue` |
| 40 | 编辑/删除按钮在金额右侧 | 按用户要求挪到**金额左侧**。`.act` 补 `margin-left: auto` 保持右对齐不挤压主区 | `TxnList.vue` |
| 41 | 账户详情页明细缺时间/标签/报销状态 | `AccountDetailView` 的 `toItem` 映射漏了 `txn_time` / `tag_names` / `reimbursed_at` 三个字段，补齐 | `AccountDetailView.vue` |
| 42 | 账户详情接口不返回附件数 | `GET /api/v1/accounts/:id` 漏了 `att.attachCounts(rows)`，导致账户详情页的 📎 徽标不显示。补上（与交易列表接口一致，一次查询避免 N+1） | `src/routes/api.v1.accounts.js` |

> 说明：第 40 项是**主动偏离老版** —— 老版 `.txn-act` 在金额右侧（列序 icon / main / amt / act），按用户要求调整为金额左侧。

**三个 `TxnList` 使用方的字段齐备性核对**（组件全站共用，缺一不可）：

| 使用方 | 字段来源 | `txn_time` | `tag_names` | `reimbursed_at` |
|---|---|---|---|---|
| `TransactionsView`（B3 列表） | 显式 `toItem` 映射 | 已映射 | 已映射 | 已映射 |
| `AccountDetailView`（D2） | 显式 `toItem` 映射 | **本轮补** | **本轮补** | **本轮补** |
| `DashboardView`（B1 最近记录） | `{ ...r }` 透传 | 自动带过 | 自动带过 | 自动带过 |

**B2 修复补充（2026-10-19 截图反馈后小修）**

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 1 | 表单字段行距不统一 | 主表单行距 20px → 10px；多币种折叠区按同值同步；可报销行后离间距缩小 | `TxnFormView.vue` |
| 2 | 可报销开关右对齐、文字独占一行 | 改用 `field-row`（横向 flex），开关靠左、文字在右侧 10px 间距，容器宽度不再 100% 拉伸 | `TxnFormView.vue` |
| 3 | 分类浮层背景透明 | `NPopover` 开了 `raw` 不渲染外壳，给 `.cat-panel` 补背景 / 边框 / 圆角 / 阴影 | `CategorySelect.vue` |

#### B4 记录详情修复（2026-10-21）

**性质**：老版**没有独立详情页** —— 老版点列表行是弹 JS 模态框（`public/js/app.js:906-977` `showTxnDetail`），数据走 `GET /transactions/:id/json`。新版把它做成了独立路由页 `/transactions/:id`（路由早已预留，此前是 15 行占位页）。因此本轮是**以老版弹窗为字段基准**，在新版独立页上落地。

后端能力齐备，**无需改动后端**：`GET /api/v1/transactions/:id` 已返回 `{ txn, attachments, splits }`（`src/routes/api.v1.transactions.js:83-88`），一次请求即可拿全。

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 1 | 页面是占位页（「阶段 3 实现中」） | 重写为完整详情页 | `TxnDetailView.vue` |
| 2 | 缺头部金额区 | 补头部卡：分类图标（圆形底色用 `category_color` 18% 透明度）+ 名称 + 类型·日期副标题 + 大号带符号金额 + 非 CNY 币种后缀。金额符号按老版口径（`is_income` 加 `+`、`is_expense` 取负），`adjust` 类型不加符号 | `TxnDetailView.vue` |
| 3 | 缺详细信息键值区 | 按老版弹窗逐行补齐 13 项：日期 / 类型 / 分类（转账不显）/ 账户（转账·投资显示双边 `A → B`）/ 成员 / 商家 / 备注 / 标签 / 原币金额（`X CUR × rate ≈ Y CNY`）/ 报销 / 状态 / 来源 / 创建时间 / 最后修改 | `TxnDetailView.vue` |
| 4 | 来源显示英文枚举 | 补中文映射（老版 `TXN_SOURCE_LABEL`）：手动 / AI 截图 / AI 文本 / 导入 / 周期账单 / 订阅 | `TxnDetailView.vue` |
| 5 | 缺 AA 分账展示 | 补分账卡：成员名 + 金额（`share_cents/100`）+ 已结算/未结算徽标。**老版弹窗没有此区块**（老版单笔接口不返回 splits），新版接口已返回，属能力增强 | `TxnDetailView.vue` |
| 6 | 缺附件画廊 | 补截图卡：3:4 封面网格 + 图注（采集时间 · KB），字段用 `file_name` / `url`（**不是** `filename` / `path`） | `TxnDetailView.vue` |
| 7 | 附件无法放大 | 老版有 `openZoom` 全屏遮罩放大。新版用 naive `NImage` 内置预览（`preview-props.showToolbar`），能力对等且支持工具栏 | `TxnDetailView.vue` |
| 8 | 缺写操作入口 | 顶部操作区补「编辑」（跳 `/transactions/:id/edit`）与「删除」（`NPopconfirm` 二次确认，删后跳回列表）。两者按 `session.canWrite` 门控 —— 老版靠 DOM 有无 `[data-del-txn]` 推断，新版有明确权限 getter | `TxnDetailView.vue` |
| 9 | 缺空态与错误态 | 记录不存在（404）显示 `Empty` 空态卡；加载中用 `NSpin` 包裹 | `TxnDetailView.vue` |
| 10 | 报销徽标不区分状态 | 按 `reimbursed_at` 区分「已报销」（success，附报销时间）/「待报销」（warning），与 B3 列表口径一致 | `TxnDetailView.vue` |
| 11 | **编辑页标签回填失效（会丢数据）** | 根因：后端只返回 `tag_names`（空格分隔字符串），**没有 `tags` 字段**；`TxnFormView.vue:183` 却读 `tx.tags` → 恒为 undefined → 标签框空。用户从详情页点「编辑」再保存，**原标签被清空**（后端 `updateTransaction` 走 `applyTags(..., replace=true)`，先删后建）。改读 `tx.tag_names` | `TxnFormView.vue` |

**闭环验证**（真实库数据核对）：`GET /api/v1/transactions/:id` 返回字段与页面消费一一对应 —— `category_path`（如「餐饮/饮料」）、`tag_names`、`is_income/is_expense`、`type_label/type_icon/type_color`、`reimbursed_at`、`amount_base_cents` 齐备；附件 `url` 直接是 `/uploads/...` 静态路径（后端 `attachments.js:38` `webUrl()` 已算好），`NImage` 可直用；`splits` 为 `[{member_name, share_cents, is_settled, settled_at}]`。

**入口闭环**：列表页点行 → `/transactions/:id`（详情）；详情页点「编辑」→ `/transactions/:id/edit`；编辑页保存 → `router.replace('/transactions/:id')` 回到详情。

#### B5 记账日历修复（2026-10-21）

后端 `GET /api/v1/dashboard/calendar` 已返回 `{month, monthLabel, cells, days, monthSummary, maxExpense, selected, selectedRows, weekdays}` —— 热力图与 TOP5 所需数据（`days` 每日收支、`maxExpense`）**齐备，无需改后端**。

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 1 | **日历格金额精度丢失** | 原 `(c.expense / 100).toFixed(0)` 强制取整 —— 11.50 元显示成「12」、128.80 元显示成「129」。老版用 `fmtAmount(cents, c.expense >= 100000 ? 0 : 2)`（≥1000 元才省小数）。在 `utils/money.ts` 新增 `fmtPlain(cents, decimals)`（对应老版 `util.js` 的 `fmtAmount`，无 ¥ 符号、小数位可变），日历格改用它 | `money.ts`、`CalendarView.vue` |
| 2 | **缺「本月热力分布」** | 老版有 `charts.calendarHeatmap` SVG 热力图（格底色按支出占比加深 6%~22%、今天主色描边、格内收支双行、`<title>` 悬浮提示）。新版补 `heatSvg` computed 直接生成同构 SVG | `CalendarView.vue` |
| 3 | **缺「本月支出 TOP 5」** | 老版有排行条形图（`charts.rankBars`，取本月支出最高的 5 天）。新版补 `top5` / `top5Max` computed + `.rank-row` 样式（序号 / 日期 / 进度条 / 金额），空态「本月暂无支出」 | `CalendarView.vue` |
| 4 | 选中日卡缺当日小计 | 老版侧栏有「支出 / 收入」当日合计（按 `amount_base_cents` 累加）。新版补 `daySum` computed + `.day-sum` 行 | `CalendarView.vue` |
| 5 | 选中日卡缺「＋ 补记」入口 | 老版侧栏有「＋ 补记」按钮跳 `/transactions/new?date=<选中日>`。新版补按钮（`session.canWrite` 门控） | `CalendarView.vue` |
| 6 | 选中日标题非相对日期 | 老版标题是 `relDate(selected)`（今天/昨天/前天/10月21日）+ 星期。新版原为硬编码 `📅 2026-10-21 的交易`。补 `selectedTitle` / `selectedWeekday` computed | `CalendarView.vue` |
| 7 | **新建页不支持 `?date=` 预填** | 老版 `/transactions/new?date=xxx` 会把日期预填进表单（补记场景的核心行为）。新版 `TxnFormView` 不读 query，导致「补记」跳过去还是今天。补：新建模式读 `route.query.date`，格式校验 `YYYY-MM-DD` 后写入 | `TxnFormView.vue` |
| 8 | 星期表头非响应式（真 bug） | `const dayNames = data.value?.weekdays` 是**普通赋值而非 computed** —— 首屏 `data` 还是 null，接口返回后表头**永远不会更新**，永远显示兜底值。改为 `computed` | `CalendarView.vue` |
| 9 | 死代码 + 多余请求 | `Empty` / `NIcon` / `NDivider` / `NTag` / `txnColumns` / `totalDays` / `categories` / `accounts` / `loadOptions` 全部定义未用；其中 `loadOptions()` 每次进页面多打一次 `/transactions/-form-data` 请求。全部清理 | `CalendarView.vue` |

**视觉对齐（老版 `.cal-cell` / `.cal-nav`）**：

| 项 | 老版 | 新版（原） | 新版（现） |
|---|---|---|---|
| 日历格圆角 | 10px | 4px | 10px |
| 日历格最小高度 | 62px | 70px | 62px |
| 热力表现 | `color-mix` 平铺，4%~16% | 线性渐变，0%~100%（过重） | `color-mix` 平铺，4%~16% |
| 空白格 | 透明无边框 | 灰底 | 透明无边框 |
| 今日描边 | 1.6px 主色 | 2px | 1.6px 主色 |
| hover | 边框主色 + 3px 主色光环 | 仅边框变色 | 边框主色 + 3px 光环 |
| 月份标题 | 16px 粗体、居中、最小宽 110px | 16px 常规、跟在按钮后 | 16px 粗体、居中、导航条中间 |
| 「本月」按钮 | 文案「本月」 | 文案「今」 | 文案「本月」 |

**热力图起始星期口径**：老版 `u.firstWeekday` = `getDay()`（**周日=0**），与 `WEEKDAYS`（周日/周一/…）表头同序。后端 `cells` 排布亦用此口径 —— 热力图曾按「周一开始」写会导致两图错位，已改为周日=0。同时把 `dayNames` 的兜底值从「一二三四五六日」修正为「周日…周六」。

**数据自检**（ledger 2，2026-10）：`days` 19 条、`maxExpense` = 175300、TOP5 = 10-01 / 10-17 / 10-03 / 10-04 / 10-02，`firstWeekday('2026-10')` = 4 与 `getDay()` 一致，`monthLabel` = 「2026年10月」。

**B5 第二轮修复（2026-10-21，用户提供老版截图对照）**

用户反馈：「图片是旧版本的样子，新版本的样式有区别，按照旧版本的改正下」。逐项比对老版截图后调整：

| # | 差异 | 改法 |
|---|---|---|
| 1 | **整体布局是上下堆叠，老版是左右两栏** | 老版 `.grid-main` = `minmax(0,1.6fr) minmax(0,1fr)`。新版改为两栏：左栏 = 日历视图 + 本月热力分布；右栏 = 当日详情 + 本月支出 TOP。窄屏（≤1100px）塌成单栏 |
| 2 | **月汇总做成了 4 个 StatCard，老版在月导航条右侧** | 老版 `cal-nav` 右侧是「支出 / 收入 / 结余」三段文字（`monthSummary.net` 由后端 `txn.summary()` 直接给出）。删除 4 个 StatCard，改到导航条右侧，支出红 / 收入绿 / 结余按正负上色 |
| 3 | 月导航条按钮形态不对 | 老版是「`‹` 月份标题 `›`」紧邻一组 + 「本月」独立按钮（`btn-ghost`）。新版改为 `‹` / `›` 小箭头按钮（quaternary）+ 16px 粗体月份标题（最小宽 110px 居中），「本月」保持 ghost 风格 |
| 4 | 日历格缺标题行与提示 | 补 `.card-head`「日历视图」+ 右侧提示「点某一天看当天明细」；格下方补脚注「颜色越深表示当天支出越多 · 蓝色边框是今天」 |
| 5 | 空态用 naive `NEmpty`，与全站风格不一 | 老版是 `<div class="empty"><span class="big">📭</span>这天还没有记录</div>`。改用同款：📭 大图标 + 文案，补 `.empty` 样式（36px 图标、居中、`padding: 22px 8px`） |
| 6 | 日历格间距与表头字号偏差 | 栅格 `gap` 4→6px；表头字号 12→11.5px、字重 500→600（对齐老版 `.cal-head`） |
| 7 | 清理失效导入 | `NSpace` / `NEmpty` / `NGrid` / `NGridItem` / `StatCard` 在重排后已不再使用，全部移除 |
| 8 | 右栏缺吸附 | 老版当日详情卡是 `card sticky-side`（滚动时吸附在视口顶部）。新版给 `.day-detail` 补 `position: sticky; top: 14px`，窄屏取消 |

**两栏布局与老版的对应关系**：

| 位置 | 老版 | 新版 |
|---|---|---|
| 左栏 | 日历视图（`card`）+ 本月热力分布（`card`） | 同 |
| 右栏 | 当日详情（`card sticky-side`，滚动时吸附）+ 本月支出 TOP（`card` 不吸） | 同 |

---

#### B6 AI 截图记账修复（2026-10-26）

以老版 `ai.ejs` + `public/js/app.js` 的 `initAiPage()`（367-569 行）为行为基准。新版原实现是 4 个 tab（截图识别 / 文字记账 / 智能对话 / 附件）+ 只读 `NDataTable` 结果，缺老版绝大多数能力。

**布局决策**：去掉 4 个 tab，改回老版**左右两栏** `.grid-main`（`minmax(0,1.6fr) minmax(0,1fr)`，≤1100px 塌成单栏）。老版右栏「识别原理 + 识别历史」天然对应两栏；「智能对话」能力已由 A1 的全站 `AiPanel` 浮窗承担；「附件」由右栏识别历史 + B7 的 `/attachments` 独立页承担。

| # | 问题 | 改法 | 影响文件 |
|---|---|---|---|
| 1 | **AI 识别结果全废（隐性缺陷，编译不报错）** | 后端统一响应体为 `{ok:true, data:{...}}`，而 `AiApi.scan/text/chat/confirm` 写成 `.then(r => r.data)` → 拿到整个响应体 → 前端读 `r.engine`/`r.items`/`r.created` 全是 `undefined`，**AI 页与 A1 的 AiPanel 浮窗都无法识别**。统一改为 `.then(r => r.data.data)`（与同文件其他读接口一致） | `api/modules.ts` |
| 2 | **截图与账单不关联** | `doConfirm` 原硬传 `AiApi.confirm(items, [], 'ai_screenshot')` → 空数组，截图永远挂不到交易上。新增 `lastImageIds`，scan 时保存 `r.images[].id`，confirm 时回传 | `AiView.vue` |
| 3 | **`/ai/config` 明文下发 apiKey** | 老版 EJS 只输出 model/baseUrl/vision/autoSave。后端改为白名单字段，不下发 apiKey（管理员设置页 `GET /api/v1/admin/settings` 仍返回完整配置，未动） | `api.v1.ai.js` |
| 4 | **`/ai/attachments` 缺图注字段** | SQL 补 `c.name AS category_name` / `c.icon AS category_icon`，并为每行补 `url = att.webUrl(r.rel_path)`，前端可直接 `<img src>` | `api.v1.ai.js` |
| 5 | **附件列表混入已删交易** | JOIN transactions 未过滤软删除，导致已删交易的金额/分类仍在图注显示。补 `AND t.deleted_at IS NULL` | `api.v1.ai.js` |
| 6 | 页面结构与老版不符 | 去掉 4 tab，改两栏 grid-main：左 = 上传卡 + 识别结果草稿区 + 文字快速记账卡；右 = 识别原理卡 + 识别历史画廊卡 | `AiView.vue` |
| 7 | 缺三态配置提示 | 顶部按状态分别提示：`!aiReady` → 「尚未配置 AI 模型…」；`!aiUsable` → 「已填写模型 X，但 AI 识别处于关闭状态…」；正常 → 「已连接模型 X（baseUrl）· 视觉能力… · 自动保存…」 | `AiView.vue` |
| 8 | 缺可编辑草稿卡 | 补老版 `renderDrafts` 同款：类型 chip / 分类 chip / 置信度「把握 XX%」（high/mid/low 三色）/ 删除按钮；字段含金额(NInputNumber ¥)、日期(DatePickerWrap)、类型(NSelect 支出/收入/转账)、分类(NSelect 按 kind 联动)、账户(AccountSelect)、商家备注(NInput)；提交时过滤 `amount_cents > 0` | `AiView.vue` |
| 9 | 缺上传交互与校验 | 自绘 `.dropzone`：点击选择 / 拖拽 / **Ctrl+V 粘贴**（document 级监听，`onBeforeUnmount` 移除）；校验单张 8MB 上限、仅图片、最多 6 张（对齐后端 `MAX_IMAGES`） | `AiView.vue` |
| 10 | 缺识别历史画廊 | 补 `.gallery` 网格（`minmax(132px,1fr)`，≤820px 变 2 列），`NImage` 可放大，figcaption 显示金额或「商家 · 分类 · 日期」，右下角「全部 →」跳 `/attachments`（该路由待 B7 补齐，当前落 404） | `AiView.vue` |
| 11 | 缺识别原理卡 | 按老版补「识别原理」说明卡（视觉模型读图 / 规则引擎兜底 / 置信度含义） | `AiView.vue` |
| 12 | **文字快速记账单笔跳转丢预填** | 老版单笔跳 `/transactions/new?from_ai=1` 并预填类型/金额/日期/分类/账户/备注。新版 `TxnFormView` 仅支持 `?date=` → 跳转后全是默认值。补 URL 预填（`type`/`amount`/`date`/`category_id`/`account_id`/`note`），分类需存在且与当前类型 kind 一致才采用，账户需存在才采用 | `TxnFormView.vue` |
| 13 | 保存后行为 / 只读门控缺失 | 保存成功跳 `/transactions`（老版行为），失败时显示后端返回的 errors；`!session.canWrite` 时顶部红色提示并禁用识别/保存/解析按钮 | `AiView.vue` |
| 14 | **设置页控制台报 2 条 Vue 警告：`Failed to resolve component: NGridItem` / `NGrid`** | `SettingsView.vue` 模板用了 `<NGrid>` / `<NGridItem>`（「系统信息」tab 的栅格），但 `import { ... } from 'naive-ui'` 里**漏了这两个组件** → Vue 解析不到，渲染成未知自定义元素 → **该 tab 的栅格布局完全失效**（所有 `.info` 项挤成一行竖排）。补 `NGrid, NGridItem` 到 import 列表 | `SettingsView.vue` |
| 15 | `NTag as NTagRaw` 重复导入且未使用 | 同一文件已单独 import `NTag`，`NTagRaw` 别名导入后全文件无引用，属死代码，移除 | `SettingsView.vue` |

**有意偏离老版一处**：草稿类型切到「转账」时隐藏并清空 `category_id`（老版转账仍会带分类），与后端 `createTransaction` 的转账校验（必须 account_id + to_account_id 且不同）方向一致。

**已知遗留 1**：`/attachments` 独立页在新版无路由（`router/index.ts` 走 catch-all → `NotFoundView`），AI 页「识别历史」的「全部 →」当前会落到 404，需在 B7「截图库」补齐。

**已知遗留 2（本次巡检发现，属 C2 范围，未修）**：`/search` 页 `SearchView.vue` 白屏 —— `NDatePicker` 的 `v-model:value` 直接绑 `f.from` / `f.to`（初值 `''` 字符串），而 naive 的 `NDatePicker` 只接受毫秒时间戳（Number）→ 传 `''` 触发 `RangeError: Invalid time value`，setup 抛错导致整个组件不渲染（控制台 8 条警告/错误）。该页原状态就是「待修」，本次未动，留待 C2 一并处理。

**验证**：`npm run build`（`vue-tsc --noEmit && vite build`）0 错误、exit 0；`GetDiagnostics` 无诊断；`node --check src/routes/api.v1.ai.js` 通过；真实库自检 ledger 2 有 3 条附件，`amount_cents=400`、`merchant='邻家惠超市 超市购物'`、`category_name='饮料'`、`category_icon='🧋'`、`url='/uploads/202610/1792558843589_9iotdqpz.png'` 均正确，ledger 3 无附件。

**浏览器实测**（Vite dev + 后端 5111 已运行，Chrome 实测）：
- 全站 30 个路由逐个巡检控制台，修复后仅剩 `/search` 一处白屏（上述遗留 2），其余页面控制台 0 警告 0 错误
- AI 页：两栏布局正常，识别历史画廊渲染 3 张图（金额 4.00 / 647.88 / 647.88，与库内一致），三态提示显示「已连接模型 MiniMax-M3.1-Flash-Preview…视觉能力已开启」
- 设置页「系统信息」tab：`NGrid` 渲染正常（`.n-grid` 存在，子项带 `grid-column: span 1 / span 1`），控制台 0 警告

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
| 2026-10-19 | B2+ | 截图反馈 3 处小修：表单行距统一 10px、可报销开关改横排、分类浮层补背景 |
| 2026-10-19 | B3 | 账单明细 15 项（详见上表），含后端 `sum` 透传、`reimbursable=1` 归一化、chips/汇总/分页/筛选/批量报销/行内按钮全量补齐。**待确认** |
| 2026-10-19 | A3 | **退出登录 403**：store 里 `fetch`+`FormData`（multipart）不被 `express.urlencoded` 解析，CSRF token 丢失；`logout()`/`switchLedger()` 改用 `URLSearchParams`，顺带修复切账本静默失效。**待确认** |
| 2026-10-21 | B3-2 | 账单明细第二轮 19 项（详见上表）。**3 个隐性缺陷**：`NGrid`/`NGridItem` 未 import 导致筛选网格运行时失效、支出金额误显 `+¥50.00`、日小计 `++` 双前缀；**口径修正**：日小计改用后端 `groupByDate` 结果，与汇总行 `sum` 对齐；**功能补齐**：分类下拉 optgroup 层级、汇总行导出入口、全选本页、批量改分类/加标签、pager 页码列表、pageSize 40、分类名可点筛选；**TxnList 行内细节** 8 项（报销徽标按 `reimbursed_at`、待确认文案、附件徽标位置、商家去 `@`、备注位置、账户兜底、`relLabel` 补前天/跨年）。`npm run build` 0 错误。**待确认** |
| 2026-10-21 | B3-3 | 分页样式对齐老版 5 项：上一页/下一页由 naive `NButton` 改原生 `<button class="pg">`（与页码同款白底边框 7px 圆角）、改按需出现而非禁用恒显、省略号补 32px 方形占位、页码窗口改老版固定 5 页滑动算法、按钮补 `font-family: inherit`。`npm run build` 0 错误。**已确认** |
| 2026-10-21 | B4 | 记录详情页从占位页重写为完整实现（11 项，详见上表）。老版无独立详情页（是弹窗），以老版弹窗字段为基准落到新版独立路由页；后端 `GET /api/v1/transactions/:id` 已返回 `{txn, attachments, splits}`，**无需改后端**。含头部金额区、13 项键值信息、AA 分账卡、附件画廊 + `NImage` 放大、编辑/删除（`canWrite` 门控）、404 空态。**顺带修一处会丢数据的 bug**：`TxnFormView` 读 `tx.tags` 回填标签，而后端只返回 `tag_names` → 编辑保存会清空原标签。`npm run build` 0 错误。**已确认** |
| 2026-10-21 | B3-4 | 用户验收反馈 4 项：明细行补消费时刻（`txn_time`，前端 `itemTime()` 早有但从未在模板使用）、编辑/删除按钮挪到金额左侧（`.act` 补 `margin-left:auto`）、`AccountDetailView` 的 `toItem` 补 `txn_time`/`tag_names`/`reimbursed_at`、后端 `GET /api/v1/accounts/:id` 补 `att.attachCounts(rows)` 恢复 📎 徽标。`npm run build` 0 错误，后端 `node --check` + 数据自检通过。**已确认** |
| 2026-10-21 | B5 | 记账日历 9 项（详见上表）：补「本月热力分布」SVG 热力图与「本月支出 TOP 5」排行条（老版有、新版缺）、修日历格金额强制取整（`toFixed(0)` → 新增 `fmtPlain`）、补选中日当日小计与「＋ 补记」入口、标题改相对日期+星期、`TxnFormView` 补 `?date=` 预填（老版补记行为）、修星期表头非响应式真 bug、清理 9 处死代码与 1 次多余请求、视觉对齐老版 `.cal-cell`/`.cal-nav`（圆角/热力口径/空白格/hover/月标题/按钮文案）。后端 `/dashboard/calendar` 数据齐备，**无需改后端**。`npm run build` 0 错误，无诊断。**待确认** |
| 2026-10-21 | B5-2 | 用户提供老版截图对照，改版式 8 项：整体改**左右两栏**（老版 `.grid-main` 1.6fr/1fr，左=日历+热力图、右=当日详情+支出TOP）、删 4 个 StatCard 把月汇总「支出/收入/结余」移进月导航条右侧、月导航改「‹ 标题 › + 本月」形态、补日历卡标题与提示脚注、空态改老版 📭 图标样式、栅格间距/表头字号对齐、清理 5 个失效导入、`.day-detail` 补 sticky 吸附。`npm run build` 0 错误，无诊断。**已确认** |
| 2026-10-26 | B6 | AI 截图记账 13 项（详见上表）。**2 个隐性缺陷**：① `AiApi.scan/text/chat/confirm` 解包错误（后端返回 `{ok,data}`，前端却取 `.data`）→ **AI 页与 A1 的 AiPanel 浮窗识别结果全废**，已统一改为 `.data.data`；② `doConfirm` 硬传空 `image_ids` → 截图挂不到交易上，已回传 `r.images[].id`。**结构变更**：去掉 4 个 tab，改回老版**左右两栏**（左=上传+草稿+文字快速记账，右=识别原理+识别历史画廊）。补可编辑草稿卡、三态配置提示、拖拽/粘贴/8MB/6 张校验、识别历史画廊、识别原理卡、保存后跳明细、只读门控；`TxnFormView` 补 AI 跳转 URL 预填。**后端**：`/ai/config` 剥离 apiKey（安全）、`/ai/attachments` 补 `category_name`/`category_icon`/`url` 并过滤软删除交易。`npm run build` 0 错误，`node --check` + 真实库自检通过。**待确认** |
| 2026-10-26 | B6-2 | 用户在控制台看到 **2 条 Vue 警告** → 定位为 `SettingsView.vue` 漏 import `NGrid` / `NGridItem`（「系统信息」tab 栅格失效，已修）+ `NTag as NTagRaw` 死代码（已移除）。顺带全站 30 路由控制台巡检：**`/search` 页白屏** —— `NDatePicker` 直接绑 `''` 字符串（naive 只收毫秒时间戳）→ `RangeError: Invalid time value` 致 setup 抛错、组件不渲染，属 C2 范围未动，已记入遗留。修复后除 `/search` 外全站控制台 0 警告。`npm run build` 0 错误。**待确认** |
