# 家账簿 HomeLedger v2 —— `/api/v1/*` API 文档

> 阶段 1 产出。**所有 v1 端点统一 JSON 响应，会话与 CSRF 复用现有 cookie 体系。**
> 设计目标：自研 Vue 3 + Naive UI 前端专用；外部工具仍走 `/api/open/*`（Bearer 令牌）。

---

## 通用约定

### 响应格式

| 类型 | 格式 | 状态码 |
|---|---|---|
| 成功 | `{ ok: true, data: ..., message?: '...' }` | 200 / 201 / 204 |
| 失败 | `{ ok: false, error: '人类可读', code?: 'INVALID', fields?: {...} }` | 400 / 401 / 403 / 404 / 409 / 500 |
| 列表 | `data: { items: [...], total, page, pageSize, totalPages }` | 200 |
| 已删 | `data: null, message: '已删除'` | 200 |

### 鉴权

- Cookie 会话：与 SSR 完全一致
- 401 未登录：`{ ok:false, error:'未登录', redirect:'/login', code:'UNAUTHORIZED' }`
- 403 权限不足：`{ ok:false, error:'...', code:'FORBIDDEN_XXX' }`

### CSRF

- 写接口（POST/PUT/PATCH/DELETE）需 `X-CSRF-Token` header 或 `body._csrf`
- token 从 `GET /api/v1/session` 的 `data.csrf` 获取
- axios 拦截器自动注入

### 路径参数

- 数字 ID：`:id(\\d+)` —— 非数字返 404

---

## 端点索引

### 通用

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/ping` | 健康检查 + 服务版本 |
| GET | `/api/v1/session` | 当前会话、用户、账本、CSRF、AI 状态 |

### 交易

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/transactions` | 列表（分页 + 过滤） |
| GET | `/api/v1/transactions/:id` | 单笔详情 + 附件 + 分账 |
| POST | `/api/v1/transactions` | 新建 |
| PUT | `/api/v1/transactions/:id` | 全量更新 |
| PATCH | `/api/v1/transactions/:id` | 局部更新（note/tags/status/reimbursable/category_id/account_id） |
| DELETE | `/api/v1/transactions/:id` | 软删除 |
| POST | `/api/v1/transactions/bulk` | 批量（delete/category/tag/reimburse/reimbursable/restore） |
| GET | `/api/v1/transactions/-form-data` | 表单选项（账户/分类/成员/标签/币种等） |

**列表查询参数**：`page, pageSize, type, kind, category_id, account_id, member_id, tag_id, source, month, from, to, q, reimbursable, sort`

### 账户 / 分类 / 标签

| 方法 | 路径 |
|---|---|
| GET/POST/PUT/DELETE | `/api/v1/accounts` 与 `/api/v1/accounts/:id` |
| GET/POST/DELETE | `/api/v1/accounts/:id`（详情 + 流水） |
| POST | `/api/v1/accounts/:id/archive` |
| POST | `/api/v1/accounts/:id/adjust`（余额调整） |
| GET/POST/PUT/DELETE | `/api/v1/categories[/:id]` |
| GET/POST/PUT/DELETE | `/api/v1/tags[/:id]` |

### 预算 / 周期 / 借贷 / 目标

| 方法 | 路径 |
|---|---|
| GET/POST/PUT/DELETE | `/api/v1/budgets[/:id]` |
| POST | `/api/v1/budgets/:id/toggle` |
| GET/POST/PUT/DELETE | `/api/v1/recurring[/:id]` |
| POST | `/api/v1/recurring/:id/{toggle,run}` |
| GET/POST | `/api/v1/debts[/:id]` |
| POST | `/api/v1/debts/:id/settle` |
| DELETE | `/api/v1/debts/:id` |
| GET/POST/DELETE | `/api/v1/goals[/:id]` |
| POST | `/api/v1/goals/:id/deposit` |

### 订阅

| 方法 | 路径 |
|---|---|
| GET/POST | `/api/v1/subscriptions` |
| GET/PUT/DELETE | `/api/v1/subscriptions/:id` |
| POST | `/api/v1/subscriptions/:id/{charge,skip,toggle,cancel}` |

### 总览 / 日历 / 搜索 / 通知

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/dashboard` |
| GET | `/api/v1/dashboard/calendar` |
| GET | `/api/v1/dashboard/search` |
| GET | `/api/v1/dashboard/notifications` |
| POST | `/api/v1/dashboard/notifications/read-all` |
| POST | `/api/v1/dashboard/notifications/:id/read` |

### 报表

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/reports`（含 `?kind=expense\|income&preset=month\|year\|quarter\|custom\|all&month=YYYY-MM&year=YYYY&from=...&to=...`） |

### 设置 / 账本 / 成员

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/admin/settings` |
| GET | `/api/v1/admin/settings/api-tokens/new`（取一次性明文） |
| POST | `/api/v1/admin/settings/api-tokens` |
| POST | `/api/v1/admin/settings/api-tokens/:id/revoke` |
| PATCH | `/api/v1/admin/settings/profile` |
| POST | `/api/v1/admin/settings/avatar` / `…/clear` |
| POST | `/api/v1/admin/settings/password` |
| PUT | `/api/v1/admin/settings/theme` |
| PUT | `/api/v1/admin/settings/ai`（admin） |
| PUT | `/api/v1/admin/settings/site`（admin） |
| POST | `/api/v1/admin/settings/ai/test`（admin） |
| POST | `/api/v1/admin/settings/ai/models`（admin） |
| GET/POST/PUT/DELETE | `/api/v1/admin/ledgers[/:id]` |
| POST | `/api/v1/admin/ledgers/:id/archive` |
| GET/POST/PATCH/DELETE | `/api/v1/admin/members[/:id]`（含 `members/invite`, `members/invites/:id`） |

### 导入 / 导出

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/admin/import/jobs` |
| POST | `/api/v1/admin/import/preview` |
| POST | `/api/v1/admin/import/commit` |
| GET | `/api/v1/admin/export/years` |
| GET | `/export/csv` 与 `/export/json`（**保持 SSR**，因浏览器文件下载不便走 fetch） |

### 备份 / 恢复

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/backup/db` | 直下载（VACUUM INTO → 文件流） |
| POST | `/api/v1/admin/backup/db` | 备份元信息 + 临时文件 |
| POST | `/api/v1/admin/backup/restore` | 上传 + 校验 + 热切换 |

### 系统管理

| 方法 | 路径 |
|---|---|
| POST | `/api/v1/admin/admin/users/:id/action`（action: promote/demote/disable/enable/reset/delete） |
| POST | `/api/v1/admin/admin/run-scheduler` |

### AI

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/ai/config` |
| POST | `/api/v1/ai/scan`（截图/文本 → 识别结果，不入库） |
| POST | `/api/v1/ai/confirm`（确认入库） |
| POST | `/api/v1/ai/text`（纯文本识别） |
| POST | `/api/v1/ai/chat`（一步：识别+自动入库，浮动助手用） |
| GET | `/api/v1/ai/attachments` |
| DELETE | `/api/v1/ai/attachments/:id` |

---

## 联调示例

```bash
# 1. 拿 CSRF
CSRF=$(curl -sc cookies.txt http://localhost:5111/api/v1/session | jq -r .data.csrf)

# 2. 登录
curl -sb cookies.txt -c cookies.txt \
  -X POST -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=YOUR_PASS&_csrf=$CSRF" \
  http://localhost:5111/login -o /dev/null

# 3. 拿新 CSRF（登录后 session 已重置）
CSRF=$(curl -sb cookies.txt http://localhost:5111/api/v1/session | jq -r .data.csrf)

# 4. 写操作
curl -sb cookies.txt -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: $CSRF" \
  -d "name=测试账户&type=cash" \
  http://localhost:5111/api/v1/accounts | jq
```

---

## 阶段 1 变更摘要

- **新增**：`src/lib/api.js` 统一响应工具
- **新增**：`src/routes/apiV1.js` 主路由 + 8 个 `api.v1.*.js` 子模块（~2.6K 行）
- **改造**：`src/lib/auth.js` — `requireAdmin/requireLedgerWrite/requireLedgerManage` 接受 JSON 请求时返 JSON
- **改造**：`server.js` — 挂载 `/api/v1`、SPA fallback 后置、`/api/*` 404 返 JSON
- **保留**：所有原 SSR 路由继续工作（向后兼容旧使用方）
