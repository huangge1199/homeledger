# 📒 家账簿 HomeLedger（v2.0 · Vue 3 SPA 重构版）

> **本仓库是 [Panda-995/homeledger](https://github.com/Panda-995/homeledger) 的 fork**，在其 v1.8.0 基础上完成了一次彻底的架构重构。
>
> 血缘关系：
> `sucraft-hub/homeledger`（原作者 @蘇先生，v1.0 首发）→ `Panda-995/homeledger`（v1.x 持续增强：UI/UX 重做、移动端适配、开放 API 全量开放）→ **本仓库**（v2.0：前端整体重写为 Vue 3 + Naive UI 单页应用）

**自托管的家庭记账系统**：网页手动记账 + AI 截图/文本自动记账 + 开放 API 对接聊天机器人（Hermes / OpenClaw 等），所有账目数据都留在你自己的 NAS / 服务器上。

- 数据存储：SQLite 单文件（Node 内置 `node:sqlite`，零原生依赖）
- 前端：Vue 3.5 + TypeScript + Naive UI + Pinia + ECharts（独立 Vite 工作区 `web/`）
- 后端：Node 22 + Express 4，只提供 JSON API 与静态资源，**不再做服务端渲染**

---

## ✨ 本 fork 的增强（相对上游 v1.8.0）

### 🏗️ 架构重构（v2.0.0，2026-10）

- **前端整体重写**：从「EJS 模板 + jQuery + 67KB 手写 CSS」迁移为 **Vue 3.5 + TypeScript + Vite 5 + Naive UI 2.40 + Pinia 3 + ECharts 5** 单页应用，30 个业务视图覆盖全部页面
- **后端 API 化**：35 个 EJS 渲染路由全部退役，改为纯 JSON 接口 `/api/v1/*`（8 个业务子模块）；未匹配的 GET 交由 SPA fallback，前端路由接管
- **依赖瘦身**：移除 `ejs` 依赖，删除 `src/views/` 全部 35 个模板与 `public/css/app.css`、`public/js/app.js`、`public/js/assistant.js`
- **Docker 多阶段构建**：`web-builder` 阶段构建前端，运行时镜像只含后端 + 产物
- **可视化设计令牌**：原 CSS 变量平移为 `web/src/theme/tokens.ts`，再映射为 Naive UI 主题覆盖，浅色 / 深色双主题
- 改动规模：**160 个文件变更，+16496 / −9477 行**（88 新增 / 51 删除 / 21 修改）

### ✨ 新功能

- **AA 分账**：记一笔时添加分摊人、按人数均摊或逐人填写金额，提交时自动过滤无效行
- **多币种记账**：11 种币种（CNY / USD / EUR / HKD / JPY / GBP / KRW / SGD / AUD / CAD / TWD）+ 汇率输入，折叠区收纳不占主界面空间
- **交易时刻**：新增 `txn_time` 字段（`HH:mm:ss`），与「消费日」语义分离，列表有值才显示
- **记录人字段**：记一笔时显示并保留成员信息，与老版口径一致
- **账单明细页全量重做**：时间 / 类型快选 chips、成员与排序筛选、汇总行、分页、行内编辑删除、双边账户显示、批量报销 / 改分类 / 加标签
- **分类级联选择**：分类浮层支持父子级联，样式对齐老版分类卡
- **导出页**：按年选择 + CSV / JSON / Excel 格式选择（下载接口待接通，见「已知待办」）
- **AI 助手浮窗**（`AiPanel`）：悬浮球 + 面板，Enter 发送、最多 6 张图、识别结果直接入库

### 🐛 修复

- **全局阻断：`AppShell` 内嵌 `<RouterView>` 导致所有页面内容区空白** —— 顶层扁平路由下内嵌 `RouterView` 必然渲染空注释，改为默认插槽传入
- **全站图表空白**：`height` prop 传字符串时 `typeof` 判断失败，CSS 变成无单位的 `height: 220` 导致容器塌陷为 0
- **退出登录 403 / 切账本静默失效**：原生 `fetch` + `FormData`（multipart）不被 `express.urlencoded` 解析，CSRF token 与 `ledger_id` 全丢；改用 `URLSearchParams`
- **环形图半径计算错误**：ECharts 百分比基准是容器短边的一半（半径）而非直径，改为先按像素算半径再换算百分比
- **CSRF 校验失败与开发环境代理**：`/login`、`/setup`、`/ledgers/switch` 等 POST 端点的 Vite 代理区分 GET / POST
- **数据目录解析**：`DATA_DIR` 相对路径按项目根目录解析（不依赖启动 cwd），绝对路径原样使用；目录创建失败给出可读提示
- 修正后端 schema 错位：`recurring_rules` / `budgets` / `goals` / `debts` 四张表按真实列结构重写

### 🎨 体验

- 移动端底部导航（总览 / 明细 / ＋ / 报表 / AI）、汉堡抽屉、悬浮球入口
- 空账本引导态、空状态占位、启动屏（`AppSplash`）、错误兜底 Toast
- 可访问性补全：键盘焦点环、aria-label、表单错误提示
- 顶栏头像直传换图、侧栏底部主题切换、通知未读徽标

> 页面级对等修复的逐项记录见 [`docs/page-parity-fixing.md`](docs/page-parity-fixing.md)。

---

## 🚀 快速开始

### 方式 A：源码运行（开发 / 试用）

需要 Node ≥ 22.5。

```bash
# 1. 拉代码并安装依赖
git clone <本仓库地址> homeledger
cd homeledger
npm install

# 2. 准备环境变量
cp .env.example .env
#   本地运行请把 DATA_DIR 改成 ./data（容器内才用 /data）
#   SESSION_SECRET 建议改成随机长字符串：openssl rand -hex 32

# 3. 构建前端（产物在 web/dist）
cd web && npm install && npm run build && cd ..

# 4. 启动
npm start          # http://localhost:5111
```

开发模式（前后端分离，前端热更新）：

```bash
npm run dev        # 终端 1：后端 http://localhost:5111
cd web && npm run dev   # 终端 2：前端 http://localhost:5173（/api 与 /uploads 已反代）
```

### 方式 B：Docker（推荐用于 NAS / 服务器）

> ⚠️ 仓库自带的 `docker-compose.yml` 里 `image:` 仍指向上游 `ghcr.milu.moe/panda-995/homeledger:latest`（**那是 v1 的 EJS 版本，不含本 fork 的 v2 重构**）。要用 v2 请改成本地构建：

```yaml
services:
  homeledger:
    build: .              # 本地构建，包含 v2 前端
    container_name: homeledger
    restart: unless-stopped
    ports:
      - "5111:5111"
    environment:
      TZ: Asia/Shanghai
      PORT: "5111"
      DATA_DIR: /data
      SESSION_SECRET: "${SESSION_SECRET:-please-change-this-session-secret}"
      ADMIN_USER: "${ADMIN_USER:-admin}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD:-admin888}"
      ALLOW_REGISTER: "${ALLOW_REGISTER:-false}"
    volumes:
      - ./data:/data
```

```bash
docker compose up -d --build
```

打开 `http://<NAS内网IP>:5111` 即可使用（首次启动自动创建管理员，账号密码即 `ADMIN_USER` / `ADMIN_PASSWORD`）。

- 升级：`docker compose pull && docker compose up -d`（数据在 `./data`，升级不丢账）
- 手机访问：同一局域网浏览器直接打开，已完整适配移动端
- 完整部署说明（反向代理、HTTPS、备份、迁移、故障排查）见 [`docs/deployment-vue3.md`](docs/deployment-vue3.md)

---

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3.5 + TypeScript 5.6 + Vite 5 + vue-router 4 + Pinia 3 + Naive UI 2.40 + ECharts 5 + axios + dayjs |
| 后端 | Node.js 22 + Express 4 + express-session |
| 存储 | SQLite（Node 内置 `node:sqlite`，零原生依赖） |
| 认证 | Cookie 会话 + CSRF（`X-CSRF-Token` header 或 `body._csrf`） |
| AI（可选） | OpenAI 兼容接口（智谱 GLM / 通义 / DeepSeek / 本地 Ollama 均可） |

---

## 📁 目录结构

```
homeledger/
├── server.js              # 服务入口：静态托管 + API 挂载 + SPA fallback
├── src/
│   ├── db.js              # 数据层：建表 / 迁移 / 种子 / 余额重算引擎
│   ├── lib/               # 鉴权、AI、附件、导入、定时任务等
│   └── routes/            # api.v1.* 业务子模块 + 遗留 SSR 兼容端点
├── web/                   # 前端独立工作区（Vite）
│   └── src/
│       ├── api/           # axios 客户端（CSRF/401 拦截）+ 业务模块封装
│       ├── components/    # 17 个跨页面复用组件
│       ├── layouts/       # AppShell（带侧栏）/ BlankLayout（裸页）
│       ├── router/        # 33 条路由
│       ├── stores/        # Pinia：session / 账本 / 主题
│       ├── theme/         # 设计令牌 + Naive 主题覆盖
│       └── views/         # 30 个业务视图
├── scripts/               # 演示数据、密码重置等辅助脚本
├── docs/                  # 迁移计划、API 文档、部署与对等修复记录
└── skills/                # Hermes / OpenClaw 技能包
```

---

## 🔌 API

| 前缀 | 用途 | 鉴权 |
|---|---|---|
| `/api/v1/*` | 前端专用 JSON API（交易、账户、分类、预算、订阅、报表、设置、AI…） | Cookie 会话 + CSRF |
| `/api/open/*` | 开放 API，供聊天机器人 / 脚本对接 | `Authorization: Bearer <token>` |
| `/healthz` | 健康检查 | 无 |

完整端点索引见 [`docs/api-v1.md`](docs/api-v1.md)。

### 🤖 AI 助手自动记账（Hermes / OpenClaw）

1. 「设置 → 开放 API」生成令牌（`hl_` 开头，明文只展示一次）
2. Hermes：把 `skills/homeledger-bookkeeping/` 复制到 `~/.hermes/skills/`；OpenClaw / PicoClaw：用 `openclaw-skill/homeledger-bookkeeping/`
3. 技能读 `HOMELEDGER_URL` 与 `HOMELEDGER_TOKEN` 两个环境变量，之后发截图或说"午饭 35"即可自动记账

AI 截图/文本识别使用 OpenAI 兼容接口，在「设置 → AI 记账」中配置。

---

## 📦 更新记录

### v2.0.0（2026-10-16 重构启动，2026-10-21 收尾）

- 🏗️ 前端从 EJS + jQuery SSR 全面迁移到 **Vue 3 + TypeScript + Naive UI SPA**（Vite / Pinia / vue-router / ECharts）
- 🔌 后端同步 API 化：35 个 EJS 渲染路由退役，改为纯 JSON 接口 `/api/v1/*`；未匹配 GET 走 SPA fallback
- 🧹 移除 `ejs` 依赖，删除 `src/views/` 全部模板与 `public/` 静态资源
- 🧩 30 个 Vue 视图覆盖登录 / 初始化 / 记一笔 / 账单明细 / 账户 / 分类 / 标签 / 预算 / 周期 / 订阅 / 借贷 / 目标 / 导入 / 导出 / 账本 / 成员 / 通知 / 设置 / AI / 日历 / 搜索 / 报表 / 关于
- ✨ 记一笔新增 AA 分账、多币种 + 汇率、交易时刻、记录人字段、元信息卡与关联截图
- ✨ 账单明细页全量重做（筛选 chips / 汇总 / 分页 / 行内操作 / 批量操作）
- 🐛 修复 `AppShell` 内嵌 `RouterView` 导致的全局空白页
- 🐛 修复图表容器高度塌陷导致的全站图表空白
- 🐛 修复退出登录 403 与切换账本静默失效（FormData → URLSearchParams）
- 🐛 `DATA_DIR` 相对路径按项目根目录解析，目录创建失败给出可读提示
- ✅ 版本号升至 2.0.0，`node:sqlite` 零原生依赖，Dockerfile 改多阶段构建

### 上游沿革（继承自 Panda-995/homeledger v1.x）

v1.x 阶段由上游维护者 Panda-995 持续增强，主要包括：全新 UI/UX 与移动端适配、开放 API 全量开放与权限分层、AI 助手接入、订阅扣费与预算目标、微信 / 支付宝账单导入、备份恢复与热切换、90+ 项安全与口径修复。完整逐版本记录见 [Panda-995/homeledger](https://github.com/Panda-995/homeledger) 的 README 与应用内「关于」页。

---

## ⚠️ 已知待办

- **记录详情页**（`/transactions/:id`）仍是占位页，仅展示标题占位内容，待按老版 `txn-detail` 补齐字段与附件展示
- **截图库独立页**（`/attachments`）尚未迁移，记一笔编辑页的「全部截图 →」链接暂不可用
- **导出页下载未接通**：前端按 `year` + `format` 拼 `/export?…`，但后端仍是 `/export/csv`、`/export/json` 两个旧端点（参数口径不同），Excel 格式后端亦无实现
- v1 时代的 `test/verify-*.js` 回归套件随 EJS 退役一并移除，CI 已取消测试门禁；新功能请用浏览器端到端 + `curl /api/v1/*` 验证，后续如需回归建议按 v2 契约重写

---

## 🔒 安全说明

- 所有数据存放在 `DATA_DIR`（默认项目内 `data/`，容器内 `/data`），备份 = 拷贝该目录
- 开放 API 令牌只存 SHA-256 摘要，可随时吊销；权限跟随账本成员关系；写操作全量审计
- 建议仅在局域网/VPN 内暴露端口；如需公网访问，请置于反向代理之后并启用 HTTPS

## 🙏 致谢

- 上游 fork：[Panda-995/homeledger](https://github.com/Panda-995/homeledger)（v1.x 增强维护）
- 原始项目：[sucraft-hub/homeledger](https://github.com/sucraft-hub/homeledger)（作者 @蘇先生，应用内「关于」页保留了原署名与 AI 辅助声明）
- 图标：[Lucide](https://lucide.dev)（ISC License）

## 📄 许可

与源仓库保持一致。本 fork 的改动同样开放，欢迎 Issue / PR。
