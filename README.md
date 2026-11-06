# 📒 家账簿 HomeLedger（v3.0 · 多数据库存储版）

> **本仓库是 [Panda-995/homeledger](https://github.com/Panda-995/homeledger) 的 fork**，在其 v1.8.0 基础上完成了一次彻底的架构重构。
>
> 血缘关系：
> `sucraft-hub/homeledger`（原作者 @蘇先生，v1.0 首发）→ `Panda-995/homeledger`（v1.x 持续增强：UI/UX 重做、移动端适配、开放 API 全量开放）→ **本仓库**（v2.0：前端整体重写为 Vue 3 + Naive UI 单页应用；v3.0：存储层支持 SQLite / MySQL / PostgreSQL 三选一）

**自托管的家庭记账系统**：网页手动记账 + AI 截图/文本自动记账 + 开放 API 对接聊天机器人（Hermes / OpenClaw 等），所有账目数据都留在你自己的 NAS / 服务器上。

- 数据存储：**SQLite / MySQL / PostgreSQL 三选一**（`.env` 中 `DB_*_ENABLE=true` 决定用哪个，SQLite 仍为零原生依赖）
- 前端：Vue 3.5 + TypeScript + Naive UI + Pinia + ECharts（独立 Vite 工作区 `web/`）
- 后端：Node 22 + Express 4，只提供 JSON API 与静态资源，**不再做服务端渲染**

---

## ✨ 本 fork 的增强（相对上游 v1.8.0）

### 🗄️ 存储层重构（v3.0.0，2026-11）

- **三种关系型数据库任选**：SQLite / MySQL 8+ / PostgreSQL 12+ 三选一，由 `.env` 中的 `DB_SQLITE_ENABLE` / `DB_MYSQL_ENABLE` / `DB_POSTGRES_ENABLE` 决定（值为 `true` 生效，多个同时启用会直接报错拒绝启动，全不启用时回落 SQLite）
- **业务代码零改动**：新增 `src/db/` 存储抽象层，`src/db.js` 仍是唯一入口，对外 API 与 200+ 处调用点完全不变
- **同步桥接**：`mysql2` / `pg` 均为异步驱动，而本项目全代码库是同步调用，故用 `worker_threads` + `SharedArrayBuffer` + `Atomics.wait` 在后台线程执行远程查询，主线程同步等待结果，对业务层透明
- **方言翻译层**：`src/db/translate.js` 统一处理三方言差异（`ON CONFLICT` → `ON DUPLICATE KEY UPDATE` / `INSERT IGNORE`、`?` → `$n`、`LIKE` → `ILIKE`、`GROUP_CONCAT` → `string_agg` / `SEPARATOR`、`CAST AS CHAR` → `AS TEXT` 等）
- **全库 SQL 归一化**：清理 SQLite 专有语法（`strftime()` / `date()` / `IFNULL` / `||` 拼接 / `INSERT OR IGNORE` / `AUTOINCREMENT` / `PRAGMA`），并按 MySQL 严格模式（`only_full_group_by`、列宽校验、保留字）逐项加固
- **建表与迁移统一**：`src/db/schema.js` 收敛 21 张表的 DDL 与增量迁移，按方言转换后幂等执行
- **批量写入能力**：新增 `db.runBatch(sql, rows)`，远程驱动下一次往返写多行，大批量导入性能提升约 88 倍
- **备份/恢复**：整库备份基于 SQLite 文件，仅 SQLite 模式可用；MySQL / PostgreSQL 下接口明确提示改用数据库自带工具

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
- **导出页**：重构导出功能，支持日期范围、类型和账户筛选，CSV / JSON / Excel 格式下载
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

# 3. 选择存储后端（三选一，默认 SQLite）
#   SQLite（零依赖，数据文件在 DATA_DIR）：
#     DB_SQLITE_ENABLE=true
#   MySQL：
#     DB_MYSQL_ENABLE=true
#     DB_MYSQL_HOST=127.0.0.1  DB_MYSQL_PORT=3306
#     DB_MYSQL_USER=homeledger  DB_MYSQL_PASSWORD=xxx  DB_MYSQL_DATABASE=homeledger
#   PostgreSQL：
#     DB_POSTGRES_ENABLE=true
#     DB_POSTGRES_HOST=127.0.0.1  DB_POSTGRES_PORT=5432
#     DB_POSTGRES_USER=homeledger  DB_POSTGRES_PASSWORD=xxx  DB_POSTGRES_DATABASE=homeledger
#   注意：同时启用多个会直接报错拒绝启动；MySQL / PG 需先自建数据库（字符集建议 utf8mb4）

# 3.5 选择账单截图的存放位置（默认本地磁盘）
#   本地（存到 DATA_DIR/uploads/，备份时拷 data 目录即可）：
#     STORAGE_DRIVER=local
#   S3 兼容对象存储（RustFS / MinIO / AWS S3）：
#     STORAGE_DRIVER=s3
#     S3_ENDPOINT=http://127.0.0.1:9000   # RustFS 的 S3 API 端口
#     S3_ACCESS_KEY=xxx  S3_SECRET_KEY=xxx
#     S3_BUCKET=homeledger  S3_PREFIX=uploads
#   桶不存在时启动会自动创建；从本地切到 s3 可先跑迁移脚本：
#     node scripts/migrate-uploads-to-s3.js --dry-run   # 先看清单
#     node scripts/migrate-uploads-to-s3.js             # 确认后迁移

# 4. 构建前端（产物在 web/dist）
cd web && npm install && npm run build && cd ..

# 5. 启动
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
      # 数据库三选一（都不配置时默认 SQLite）
      # DB_MYSQL_ENABLE: "true"
      # DB_MYSQL_HOST: mysql
      # DB_MYSQL_PORT: "3306"
      # DB_MYSQL_USER: homeledger
      # DB_MYSQL_PASSWORD: homeledger-pass
      # DB_MYSQL_DATABASE: homeledger
      # DB_POSTGRES_ENABLE: "true"
      # DB_POSTGRES_HOST: postgres
      # DB_POSTGRES_PORT: "5432"
      # DB_POSTGRES_USER: homeledger
      # DB_POSTGRES_PASSWORD: homeledger-pass
      # DB_POSTGRES_DATABASE: homeledger
    volumes:
      - ./data:/data
```

用 MySQL / PostgreSQL 时，仓库的 `docker-compose.yml` 末尾已备好注释掉的 `mysql:8.4` 与 `postgres:16-alpine` 服务，启用对应服务并把上面的 `DB_*_ENABLE` 改为 `"true"` 即可。

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
| 存储 | SQLite（Node 内置 `node:sqlite`，零原生依赖）/ MySQL 8+ / PostgreSQL 12+，`.env` 三选一 |
| 认证 | Cookie 会话 + CSRF（`X-CSRF-Token` header 或 `body._csrf`） |
| AI（可选） | OpenAI 兼容接口（智谱 GLM / 通义 / DeepSeek / 本地 Ollama 均可） |

---

## 📁 目录结构

```
homeledger/
├── server.js              # 服务入口：静态托管 + API 挂载 + SPA fallback
├── src/
│   ├── db.js              # 数据层统一入口：方言选择 / 建表 / 迁移 / 种子 / 余额重算
│   ├── db/                # 存储抽象层
│   │   ├── schema.js      #   21 张表 DDL + 增量迁移清单（单一方言源）
│   │   ├── sqlite.js      #   SQLite 驱动（node:sqlite）
│   │   ├── remote.js      #   MySQL / PG 同步桥接（主线程侧）
│   │   ├── worker.js      #   MySQL / PG 后台线程（连接池 / 事务 / 建表）
│   │   └── translate.js   #   方言翻译（MySQL / PG 差异归一）
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
├── docs/                  # 迁移计划、API 文档、部署与对等修复记录、测试报告
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

## 🔒 安全说明

- SQLite 模式下所有数据存放在 `DATA_DIR`（默认项目内 `data/`，容器内 `/data`），备份 = 拷贝该目录；MySQL / PostgreSQL 模式请用数据库自带的备份工具
- 账单截图的存放位置由 `STORAGE_DRIVER` 决定：`local` 放在 `DATA_DIR/uploads/`（随目录一起备份），`s3` 放在 S3 兼容对象存储（RustFS / MinIO / AWS S3）里，备份对象存储需要另行处理
- 开放 API 令牌只存 SHA-256 摘要，可随时吊销；权限跟随账本成员关系；写操作全量审计
- 建议仅在局域网/VPN 内暴露端口；如需公网访问，请置于反向代理之后并启用 HTTPS

## 🙏 致谢

- 上游 fork：[Panda-995/homeledger](https://github.com/Panda-995/homeledger)（v1.x 增强维护）
- 原始项目：[sucraft-hub/homeledger](https://github.com/sucraft-hub/homeledger)（作者 @蘇先生，应用内「关于」页保留了原署名与 AI 辅助声明）
- 图标：[Lucide](https://lucide.dev)（ISC License）

## 📄 许可

与源仓库保持一致。本 fork 的改动同样开放，欢迎 Issue / PR。

---

## 📦 更新记录

### v3.0.0（2026-11-02 多数据库存储改造）

- 🗄️ **存储层支持 SQLite / MySQL 8+ / PostgreSQL 12+ 三选一**，由 `.env` 的 `DB_SQLITE_ENABLE` / `DB_MYSQL_ENABLE` / `DB_POSTGRES_ENABLE` 决定（值为 `true` 生效；多个同时启用直接报错拒绝启动；全不启用回落 SQLite）
- 🏗️ 新增 `src/db/` 存储抽象层：`schema.js`（21 张表 DDL + 增量迁移）、`sqlite.js`（SQLite 驱动）、`remote.js` + `worker.js`（MySQL / PG 同步桥接）、`translate.js`（方言翻译）；`src/db.js` 保持唯一入口，**业务代码与对外 API 零改动**
- ⚡ 基于 `worker_threads` + `SharedArrayBuffer` + `Atomics.wait` 实现同步桥接，规避 `mysql2` / `pg` 异步驱动与全代码库同步调用的冲突
- 🔧 方言翻译层统一处理三方言差异：`ON CONFLICT` → `ON DUPLICATE KEY UPDATE` / `INSERT IGNORE`、`?` → `$n`、`LIKE` → `ILIKE`、`GROUP_CONCAT` → `string_agg` / `SEPARATOR`、`CAST AS CHAR` → `AS TEXT`、`AUTOINCREMENT` → `AUTO_INCREMENT` / `BIGSERIAL`
- 🧹 全库 SQL 归一化，清理 SQLite 专有语法：`strftime()` / `date()` / `IFNULL` / `||` 拼接 / `INSERT OR IGNORE` / `AUTOINCREMENT` / `PRAGMA`
- 🐛 修复 MySQL 下 `||` 被当作逻辑或导致的**静默数据错误**（日期区间筛选返回错结果、删除用户后用户名被写成 `0`），改用 `CONCAT()` 与应用层拼接
- 🐛 修复 MySQL `only_full_group_by` 严格模式下 3 处 GROUP BY 缺非聚合列导致的查询报错
- 🐛 修复 MySQL 保留字 `key`（settings 表）、`out`（别名）导致的建表与查询语法错误
- 🐛 修复 `VARCHAR` 列宽过窄（`password_hash` 实际 179 字符超 `VARCHAR(128)`）与 `INTEGER` 存毫秒时间戳溢出 32 位（`avatar_ver` 改 `BIGINT`）
- 🐛 修复局部更新个人资料被误判为改名（只传昵称 / 邮箱时返回 400）
- ⚡ 新增 `db.runBatch(sql, rows)` 批量写入能力 + 分类 / 账户查询缓存 + 导入改为先解析后批量落库：MySQL 下 1466 笔导入从 **89.5 秒 → 1.0 秒**，SQL 调用 1002 → 9 次
- ⚡ 导入接口前端超时单独放宽至 300 秒（原 30 秒会误报超时）
- 🐛 修复导出 CSV 缺失时间列，且回导无法还原 `txn_time`（新增独立「时间」列 + `timeColumnIndex()` 精确取列，避免误抓支付宝账单的「交易时间」列）
- 🛡️ 删除账本新增「至少保留一个」校验（后端拦截 + 前端提示并禁用按钮），避免删光账本后侧栏菜单整体消失
- 📄 新增测试报告 [`docs/testing-report.md`](docs/testing-report.md)：SQLite 137/137、MySQL 136/136 全量 API 用例通过，PostgreSQL 方言静态审查零残留，两库交叉一致性完全一致
- 📦 新增依赖 `mysql2`、`pg`；`docker-compose.yml` 备好注释掉的 `mysql:8.4` 与 `postgres:16-alpine` 服务

### v2.0.0（2026-10-16 重构启动，2026-11-02 收尾）

- 🏗️ 前端从 EJS + jQuery SSR 全面迁移到 **Vue 3 + TypeScript + Naive UI SPA**（Vite / Pinia / vue-router / ECharts）
- 🔌 后端同步 API 化：35 个 EJS 渲染路由退役，改为纯 JSON 接口 `/api/v1/*`；未匹配 GET 走 SPA fallback
- 🧹 移除 `ejs` 依赖，删除 `src/views/` 全部模板与 `public/` 静态资源
- 🧩 30 个 Vue 视图覆盖登录 / 初始化 / 记一笔 / 账单明细 / 账户 / 分类 / 标签 / 预算 / 周期 / 订阅 / 借贷 / 目标 / 导入 / 导出 / 账本 / 成员 / 通知 / 设置 / AI / 日历 / 搜索 / 报表 / 关于
- ✨ 记一笔新增 AA 分账、多币种 + 汇率、交易时刻、记录人字段、元信息卡与关联截图
- ✨ 账单明细页全量重做（筛选 chips / 汇总 / 分页 / 行内操作 / 批量操作）
- ✨ 全量页面对等修复（30+ 视图逐一与老版对齐）：交易详情页、截图库独立页、记账日历、报表分析、搜索筛选、设置页 / 账户管理全量重写、预算 / 周期账单 / 借贷台账 / 储蓄目标 / 标签 / 分类（颜色自定义 + 合计统计）
- ✨ 裸布局页面补齐：登录 / 注册 / 初始化 / 加入账本 / 404 页修复，通知中心差异销账，关于页功能补全
- ✨ 导入模块增强：提取交易时刻并纳入重复判定、支持按行切换记账本、预览新增时间列并按时间倒序
- ✨ 导出功能重构：支持日期范围、类型和账户筛选（原「已知待办」全部销账）
- 🐛 修复 `AppShell` 内嵌 `RouterView` 导致的全局空白页
- 🐛 修复图表容器高度塌陷导致的全站图表空白
- 🐛 修复退出登录 403 与切换账本静默失效（FormData → URLSearchParams）
- 🐛 修复搜索页白屏与成员筛选失效、关于页路由重复前缀 404、账户详情页余额调整取值、AI 识别丢失消费时刻
- 🐛 日历视图优化：单元格金额显示逻辑，选中日交易按时间倒序并显示时刻
- 🐛 `DATA_DIR` 相对路径按项目根目录解析，目录创建失败给出可读提示
- 🔧 Docker 配置优化：基础镜像更新、容器名 / 运行用户 / 端口映射调整、时区配置精简
- ✅ 版本号升至 2.0.0，`node:sqlite` 零原生依赖，Dockerfile 改多阶段构建

### 上游沿革（继承自 Panda-995/homeledger v1.x）

v1.x 阶段由上游维护者 Panda-995 持续增强，主要包括：全新 UI/UX 与移动端适配、开放 API 全量开放与权限分层、AI 助手接入、订阅扣费与预算目标、微信 / 支付宝账单导入、备份恢复与热切换、90+ 项安全与口径修复。完整逐版本记录见 [Panda-995/homeledger](https://github.com/Panda-995/homeledger) 的 README 与应用内「关于」页。
