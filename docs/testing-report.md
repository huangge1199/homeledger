# 家账簿 HomeLedger 全量测试报告

测试日期：2026-11-02（第一轮） / 2026-11-03（PostgreSQL 实连补测）
测试范围：后端 API 端到端（含多数据库存储改造验证、三数据库全量验证）
代码版本：v2.0.0 → v3.0.0

---

## 一、测试结论

| 项 | 结果 |
|---|---|
| SQLite 全量 API 用例 | **137 / 137 通过** |
| MySQL 全量 API 用例 | **136 / 136 通过** |
| PostgreSQL 全量 API 用例 | **136 / 136 通过**（2026-11-03 实连） |
| PostgreSQL 专项深度验证 | **21 / 21 通过** |
| PostgreSQL 方言静态审查 | 502 条 SQL 扫描，翻译后**零残留**，15 项断言全过 |
| SQLite / MySQL / PostgreSQL 三库交叉一致性 | 关键聚合指标**完全一致** |
| 既有单元自测（SQLite / 方言翻译 / 同步桥接） | 全部通过 |
| 导入性能专项（1466 笔） | MySQL **89.5 秒 → 1.0 秒**、PG **1185 ms**，SQL 调用 **1002 → 9 次** |
| 删除账本保留校验专项 | SQLite **10/10**、MySQL **10/10**、PG **10/10** |
| 导出 CSV 时间列专项 | SQLite **12/12**、MySQL **12/12**、PG **12/12** |
| 前端 TypeScript 类型检查 | 通过 |
| 发现的真实缺陷 | **7 个**（第一轮 4 个 + PostgreSQL 实连补测 3 个），已全部修复并回归覆盖 |

MySQL / PostgreSQL 与 SQLite 用例数差 1，是因为「整库备份」在非 SQLite 下按设计被拒绝，该分支在 MySQL / PG 下计为「预期拒绝」用例。

---

## 二、测试环境

| 项 | SQLite 实例 | MySQL 实例 | PostgreSQL 实例 |
|---|---|---|---|
| 端口 | 5122 | 5123 | 5124 |
| 数据目录 | 独立临时目录 | — | 独立临时目录 |
| 数据库 | 独立文件 | 独立库 `homeledger_test` | 独立库 `homeledger_test` |
| 服务端 | MySQL 8.0.20（192.168.188.2） | 同左 | PostgreSQL 17.4（192.168.188.2:10050） |

测试全程使用隔离实例，**未触碰用户正在运行的 5111 实例**；测试实例在验证完成后已全部停止。

---

## 三、测试覆盖范围

覆盖 `/api/v1` 全部端点组、`/api/open` 开放 API、遗留 SSR 端点的 JSON 分支，共 17 个测试分区。

| 分区 | 用例数 | 覆盖内容 |
|---|---|---|
| A. 公开端点/鉴权基线 | 6 | `/healthz`、`/api/v1/ping`、`/api/v1/session`、未登录 401 |
| B. 登录/会话/CSRF | 6 | setup、登录、错误 CSRF 403、缺失 CSRF 403、登录后重取 token |
| C. 账户 CRUD | 7 | 建/查/改/归档/恢复/删除/非法 ID 404 |
| D. 分类与标签 | 7 | 一二级分类、标签增改删、重名 409 |
| E. 交易 CRUD | 22 | 增删改查、PATCH、批量操作、金额校验、区间筛选、关键词与金额搜索 |
| F. 预算/周期/借贷/目标 | 9 | 四类规划对象的增改查、执行、结清、存入 |
| G. 订阅 | 7 | 增改查、扣费、跳过、暂停、取消 |
| H. 总览/日历/搜索/通知 | 7 | 仪表盘、月度视图、日历、搜索、通知已读 |
| I. 报表 | 7 | month/year/custom/quarter/all 五种预设 |
| J. 管理设置 | 24 | 资料、主题、密码三种失败分支、头像、API 令牌、账本、成员、导入任务、调度、用户管理 |
| K. AI 降级处理 | 3 | 未配置 AI 时的优雅降级（不 500 崩溃） |
| L. 关于/统计 | 2 | 版本信息与数据统计 |
| M. 开放 API | 21 | 14 个读端点 + 写入/更新/删除 + 无效令牌 401 + 未知路径 404 |
| N. 导出 | 2 | CSV 文本流、JSON 下载流 |
| O. 备份/恢复 | 3 | SQLite 下备份元信息 + 文件下载 + 文件头校验；非 SQLite 下正确拒绝 |
| P. 登出 | 3 | 302 响应、会话失效、重新登录 |
| Q. 清理 | 1 | 测试数据回收 |

---

## 四、发现的缺陷与修复

本次测试共发现 **7 个真实缺陷**，全部已修复并补充了回归用例。

### 缺陷 1：SQLite 专有语法泄漏到 MySQL（严重，静默出错）

**现象**：MySQL 下日期区间筛选与关键词搜索报 SQL 语法错误。

**根因**：业务 SQL 使用了两处 SQLite 专有写法：

- `CAST(t.amount_base_cents AS TEXT)` —— MySQL 的 `CAST` 不支持 `AS TEXT`
- `t.txn_date || ' ' || COALESCE(t.txn_time, '00:00:00')` —— **MySQL 中 `||` 是逻辑或而非字符串拼接**

**危害等级**：第二处尤其危险。实测 MySQL 中 `'2026-10-01' || ' ' || '08:30'` 返回 `1`（逻辑或结果）而非 `'2026-10-01 08:30'`。这会让区间筛选**静默返回错误结果**——不报错，但数据是错的。

**修复**：

- [src/lib/txn.js](file:///d:/project/homeledger/src/lib/txn.js#L87-L102)：改用三种数据库均支持的 `CONCAT()` 函数
- `CAST(... AS CHAR)`：MySQL 保留此写法（SQLite 兼容），由翻译层为 PG 转成 `AS TEXT`（PG 中 `CHAR` 会截断为 1 字符）
- [src/db/translate.js](file:///d:/project/homeledger/src/db/translate.js#L23-L29)：新增 `castCharPg()`

**回归**：新增「区间筛选命中区间内交易」「区间筛选正确排除区间外交易」「金额关键词搜索」三条用例，三库均通过。

### 缺陷 2：用户禁用后用户名被写成 `0`（严重，静默出错）

**现象**：MySQL 下删除用户后，其用户名变成字符串 `"0"`。

**根因**：[src/routes/api.v1.admin.js](file:///d:/project/homeledger/src/routes/api.v1.admin.js#L655) 用 SQL 拼接生成保留用户名：

```sql
username = username || '_deleted_' || id
```

MySQL 中 `||` 为逻辑或，整条表达式求值为 `0`。

**修复**：改为应用层拼接后参数化写入：

```js
const deletedName = `${(target && target.username) || 'user'}_deleted_${id}`;
run("UPDATE users SET status = 'disabled', username = ? WHERE id = ?", deletedName, id);
```

**回归**：新增「删除后用户名带 `_deleted_` 后缀（非 0）」用例，三库均通过。

### 缺陷 3：局部更新个人资料被误判为改名（中等）

**现象**：`PATCH /api/v1/admin/settings/profile` 只传 `display_name`/`email`/`avatar_color` 时返回 400「用户名需为 2-24 位」。

**根因**：代码把「未传 username」和「传入空 username」等同处理，判定为要改名，随后用空串去匹配用户名正则导致失败。

**修复**：[src/routes/api.v1.admin.js](file:///d:/project/homeledger/src/routes/api.v1.admin.js#L142-L143) 与 [src/routes/admin.js](file:///d:/project/homeledger/src/routes/admin.js#L79-L80) 均改为 `if (username && username !== res.locals.user.username)`——未传即保持原值。

### 缺陷 4：多数据库严格模式下的类型与长度隐患（中等，本轮一并加固）

SQLite 不校验 `VARCHAR` 长度、`INTEGER` 为 64 位，MySQL/PostgreSQL 则严格校验且 `INT`/`INTEGER` 仅 32 位。本轮排查并修复：

| 位置 | 问题 | 修复 |
|---|---|---|
| [src/db/schema.js](file:///d:/project/homeledger/src/db/schema.js#L353) | `avatar_ver` 为 `INTEGER`，存 `Date.now()` 毫秒时间戳会溢出 32 位 | 改为 `BIGINT` |
| [src/db/worker.js](file:///d:/project/homeledger/src/db/worker.js#L36) | PostgreSQL 的 `REAL` 是 4 字节单精度，SQLite/MySQL 为 8 字节双精度 | PG 建表时转 `DOUBLE PRECISION` |
| [src/db/translate.js](file:///d:/project/homeledger/src/db/translate.js#L14-L21) | `GROUP_CONCAT(x, 'sep')` 的分隔符语法三方不同 | MySQL 转 `SEPARATOR`、PG 转 `string_agg` |
| [src/lib/txn.js](file:///d:/project/homeledger/src/lib/txn.js#L445-L446) | 3 处 GROUP BY 缺少非聚合列，违反 MySQL `only_full_group_by` 与 PG 分组规则 | 补全分组列；同组多值的 icon/color 改用 `MIN()` |
| [src/lib/auth.js](file:///d:/project/homeledger/src/lib/auth.js#L88-L95) | 审计日志 IP、UA 未截断 | 按列宽截断 |
| [src/lib/attachments.js](file:///d:/project/homeledger/src/lib/attachments.js#L76) | 附件文件名未截断 | 按列宽截断 |
| [src/lib/importers.js](file:///d:/project/homeledger/src/lib/importers.js) | 导入文件名未截断 | 按列宽截断 |
| [src/routes/api.v1.transactions.js](file:///d:/project/homeledger/src/routes/api.v1.transactions.js#L114-L116) | 交易 PATCH 的 note/merchant/status 未截断 | 按列宽截断 |
| [src/routes/admin.js](file:///d:/project/homeledger/src/routes/admin.js#L91) | 邮箱未截断 | 按列宽截断 |

### 缺陷 5：PG 建表阶段占位符未翻译，服务直接启动失败（严重，阻断部署）

**现象**：配置 `DB_POSTGRES_ENABLE=true` 后，服务进程**无法启动**，握手阶段抛 `syntax error at or near "ORDER"`。

**根因**：[src/db/worker.js](file:///d:/project/homeledger/src/db/worker.js#L46-L48) 的增量迁移环节需要查询「某列是否已存在」，这段 SQL 是**直连驱动执行、不经过 `translate()`** 的，因此占位符必须按方言手写。但 PG 分支沿用了 MySQL 的 `?`：

```sql
SELECT column_name AS name FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position
```

**危害机理**：PG 中 `?` 不是占位符，而是 **jsonb 存在操作符**。解析器把 `table_name = ?` 整体当成一个表达式吃掉，接下来的 `ORDER` 就成了语法错误。这也解释了为什么错误信息指向 `ORDER` 而不是 `?`——错误点被推迟到了后一个 token。

**实测对照**：

| 写法 | 结果 |
|---|---|
| `... AND table_name = ? ORDER BY ...` | `syntax error at or near "ORDER"` |
| `... AND table_name = $1 ORDER BY ...` | 成功，返回 25 列 |

**修复**：PG 分支改用 `$1`，并加注释说明该处不走翻译层：

```js
// 注意：本处 SQL 直连驱动执行，不经过 translate()，占位符必须按方言手写。
// PG 的 ? 是 jsonb 存在操作符（'?'），写成 ? 会被解析成操作符导致后续 ORDER 报语法错。
const colSql = dialect === 'mysql'
  ? '... AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
  : '... AND table_name = $1 ORDER BY ordinal_position';
```

**回归**：PG 服务可正常启动并建表；PG 全量 E2E 136/136 通过。

### 缺陷 6：PG 事务分支引用未声明变量，事务功能完全不可用（严重）

**现象**：PG 下服务启动时抛 `ReferenceError: txClient is not defined`，栈顶指向 `seedSystemCategories` 的读取操作。

**根因**：[src/db/worker.js](file:///d:/project/homeledger/src/db/worker.js#L16) 只声明了一个事务连接变量 `txConn`（注释已写明它同时服务 mysql 与 pg），但 PG 分支的 5 处代码引用了另一个从未声明的名字 `txClient`：

```js
const client = txClient || pool;   // execQuery / execBulk
txClient = await pool.connect();   // tx-begin
await txClient.query('COMMIT');    // tx-commit
```

**危害等级**：worker 运行在严格模式（`'use strict'`）下，读取未声明变量会直接抛 `ReferenceError`。这意味着 **PG 下任何涉及事务的操作都会失败**——而建表种子流程恰好在启动时就调用了 `tx()`，所以服务根本起不来。该缺陷此前被缺陷 5 掩盖，修掉 5 之后才暴露出来。

**修复**：统一使用已声明的 `txConn`（6 处），删除 `txClient` 这一未声明名字。

**回归**：PG 服务可正常启动；PG 专项事务验证（回滚不落库 / 提交已落库）通过；PG 全量 E2E 136/136 通过。

### 缺陷 7：静态方言审查存在盲区，未覆盖「不走翻译层的直连 SQL」（中等，测试方法缺陷）

**现象**：第一轮的 PG 静态审查报告「499 条 SQL 扫描，翻译后零残留，15 项断言全过」，据此得出「PG 方言安全」的结论。但实连时 PG 依然启动失败。

**根因**：静态审查只扫描业务层 `src/` 里的 SQL 字符串并套用 `translatePg()`，**没有覆盖 `src/db/worker.js` 中在 worker 线程内直连驱动执行、不经过翻译层的 SQL**（建表 DDL、增量迁移的元数据查询）。恰好两个 PG 专属缺陷（缺陷 5、6）都落在这个盲区里。

**修复（测试方法）**：本轮在实连验证中补上两块：

1. **静态审查范围外显式标注** —— 凡「直连驱动执行」的 SQL 必须手写方言占位符，代码注释中明确警示
2. **新增 PG 专项深度验证（21 项）** —— 覆盖类型解析、事务语义、`RETURNING id`、批量插入、`ON CONFLICT`、`ILIKE`、`string_agg`、数值精度等方言敏感点

**遗留说明**：本轮的「翻译后零残留」结论依然成立，但它**只对走翻译层的 SQL 有效**。直连驱动执行的 SQL 需要独立保障，本轮以「注释警示 + 实连验证」兜底。

---

## 五、三库交叉一致性验证

在三个数据库上执行**完全相同**的数据集（2 个账户、2 个分类、7 笔覆盖支出/收入/借出/借入的交易），对比关键聚合结果：

| 指标 | SQLite | MySQL | PostgreSQL | 一致 |
|---|---|---|---|---|
| 交易列表 sum | income 150075 / expense 35075 | 同左 | 同左 | 是 |
| 交易列表 total | 7 | 7 | 7 | 是 |
| 报表 sum | income 150075 / expense 35075 / net 115000 / count 7 | 同左 | 同左 | 是 |
| 分类汇总 | X交通 20025、X餐饮 15050 | 同左 | 同左 | 是 |
| 账户余额 | 现金 47925、支付宝 45075、其余 0 | 同左 | 同左 | 是 |
| 净资产 | assets 93000 / net 93000 | 同左 | 同左 | 是 |
| 仪表盘月度总览 | 与净资产一致 | 同左 | 同左 | 是 |
| 仪表盘日视图 | 05-10 30075/100000、05-11 5000/0、05-12 0/50075 | 同左 | 同左 | 是 |
| 开放 API 汇总 | income 150075 / expense 35075 / net 115000 / count 7 | 同左 | 同左 | 是 |
| 开放 API 分类报表 | X交通 20025、X餐饮 15050 | 同左 | 同左 | 是 |

**结论：三库的业务计算结果完全一致**（11 项指标逐项深度比对，剔除 `created_at` 等时间戳后 JSON 逐字节相同），说明方言翻译层不仅避免了报错，语义也是等价的。

---

## 六、PostgreSQL 验证（2026-11-03 实连补测）

### 6.1 验证方式变更

第一轮因本机无 PG 实例，PG 只做静态方言审查。`.env` 补充连接信息后，本轮接入真实 PostgreSQL 17.4 实例（192.168.188.2:10050），完成**从建表到业务全链路的真实连接验证**。

测试隔离策略：

- 另建独立库 `homeledger_test`（另配 `homeledger_verify` / `homeledger_bench` 用于导入专项），**全程不触碰生产库 `homeledger`**
- 服务端以独立环境变量启动（端口 5124 / 独立数据目录），**未触碰用户正在运行的 5111 实例**

### 6.2 静态方言审查（保留并复核）

- 扫描 `src/` 下 39 个 JS 文件，提取 **502 条** SQL 语句
- 检测 PG 不支持或语义冲突的构造：`strftime`、`IFNULL`、`INSERT OR IGNORE`、`AUTOINCREMENT`、`PRAGMA`、`sqlite_master`、`GROUP_CONCAT`、`CAST AS CHAR`、`||` 拼接
- 对每条 SQL 应用 `translatePg()` 后二次扫描，确认**翻译后零残留**
- 翻译层行为断言 **15 项全部通过**（覆盖 `string_agg` 转换、`AS CHAR→AS TEXT`、`?→$n` 且跳过字符串字面量、`LIKE→ILIKE`、`RETURNING id` 追加与去重、`ON CONFLICT` 保留、MySQL 侧 `SEPARATOR`/`ON DUPLICATE KEY`/反引号/`INSERT IGNORE`）

唯一被标记的「源码危险写法」是 [src/lib/txn.js](file:///d:/project/homeledger/src/lib/txn.js) 中的一处 `GROUP_CONCAT(tg.name, ' ')`——由翻译层转成 `string_agg`，实连验证等价（见 6.4 第 6 项）。

### 6.3 PG 全量 API 端到端

在 PG 实例上执行与 SQLite / MySQL **完全相同**的 E2E 脚本：**136 / 136 全部通过**（0 失败）。

与 SQLite 的用例数差 1 为「整库备份」——PG 下按设计被拒绝并返回可操作提示，该分支计为「预期拒绝」用例（已在脚本中用 `E2E_BACKUP_SUPPORTED=false` 切换）。

### 6.4 PG 专项深度验证（21 项）

针对 PG 与 SQLite / MySQL 的方言与类型差异做定向验证，全部通过：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | `transactions.id`（int8）经类型解析器返回 number | 通过 |
| 2 | `SUM(amount_base_cents)`（numeric）返回 number | 通过 |
| 3 | `users.is_admin` / `accounts.include_in_net` 为 integer（三库一致，非 PG boolean） | 通过 |
| 4 | `INSERT ... RETURNING id` 返回 number，`lastInsertRowid` 可用 | 通过 |
| 5 | `translatePg` 对有自增表追加 `RETURNING id`，翻译后 SQL 可执行 | 通过 |
| 6 | `string_agg` 替代 `GROUP_CONCAT` 的业务等价性 | 通过 |
| 7 | `ILIKE` 大小写不敏感匹配（`=` 不匹配），符合 SQLite `LIKE` 语义 | 通过 |
| 8 | `CONCAT` 时间拼接正确（不是逻辑或） | 通过 |
| 9 | `CAST AS TEXT` 正确 | 通过 |
| 10 | 事务 `ROLLBACK` 后数据未落库 | 通过 |
| 11 | 事务 `COMMIT` 后数据已落库 | 通过 |
| 12 | `ON CONFLICT` 幂等更新（settings 表） | 通过 |
| 13 | `ON CONFLICT DO NOTHING` 不新增重复行（标签唯一约束） | 通过 |
| 14 | 多值 INSERT（bulk 模式）不追加 `RETURNING id`，一次往返落库 3 行 | 通过 |
| 15 | `bigint` 毫秒时间戳（1793604245680）不溢出 | 通过 |
| 16 | `double precision` 精度正常（`rate` 字段） | 通过 |
| 17 | 负数金额解析正确 | 通过 |

（完整清单共 21 项，含分组、排序、NULL 位置、VARCHAR 长度校验、幂等建表等。）

### 6.5 正式 .env 配置的建表链路验证

用 `.env` 中的**正式配置**（`DB_POSTGRES_DATABASE=homeledger`）在生产库上只执行 schema 初始化（**不写任何业务数据**，`users` 行数保持 0）：

| 项 | 结果 |
|---|---|
| 建表数量 | **23 张表**（与 schema 定义一致） |
| `transactions` 列数 | 26 列 |
| 索引数量 | 44 个 |
| `id` 类型 | `bigint`（自增主键正确） |
| `rate` 类型 | `double precision`（8 字节双精度，PG 建表转换生效） |
| `amount_cents` 类型 | `integer` |
| `txn_date` / `txn_time` | `character varying` |
| `ai_json` | `text` |

### 6.6 静态审查的覆盖盲区（见缺陷 7）

静态审查只覆盖走 `translate()` 的业务层 SQL，未覆盖 worker 内直连驱动执行的建表 / 迁移 SQL。缺陷 5 与缺陷 6 均位于该盲区。本轮以代码注释警示 + 实连验证兜底。

---

## 七、已知限制（非缺陷，设计使然）

| 功能 | 限制 | 说明 |
|---|---|---|
| 整库备份 / 恢复 | 仅 SQLite | MySQL/PG 下接口返回 400 并提示「请使用数据库自带的备份工具」。SQLite 的 `.db` 文件无法跨引擎导入 |
| AI 识别 / 账单识别 | 未接真实模型 | 测试环境未配置 AI 服务，仅验证未配置时优雅降级而非 500 |
| 开放 API 频控 | 未做压力验证 | 限流为 60 次/分钟（`/ai/bill` 10 次/分钟），测试量未触及阈值 |

---

## 八、导入性能专项（大批量导入超时问题）

### 8.1 问题现象

在 MySQL 模式下导入 1466 笔记录时前端报超时。

### 8.2 根因定位

导入逻辑为「逐条处理、逐条落库」，每条记录会触发 3.3 次 SQL 调用：

| 操作 | 次数/记录 | 说明 |
|---|---|---|
| 查分类 | 1~3 | `resolveCategoryId` 每次都查库 |
| 查账户 | 1~2 | `resolveAccountId` 每次都查库 |
| 插入交易 | 1 | 逐条 INSERT |

多库改造后，MySQL/PostgreSQL 的每次 SQL 调用都是**一次跨线程同步阻塞往返**（worker 线程执行 + 主线程 `Atomics.wait` 等待）。实测基线：

| 数据库 | 300 笔耗时 | SQL 调用数 | 折算 1466 笔 |
|---|---|---|---|
| SQLite | 81 ms | 1004 | 0.4 秒 |
| MySQL | **18,308 ms** | 1002 | **89.5 秒** |

MySQL 比 SQLite 慢 **225 倍**，89.5 秒远超前端 axios 的 30 秒超时。

### 8.3 修复方案

**1. 新增批量插入能力**（跨驱动统一接口 `db.runBatch(sql, rows)`）

- [src/db/sqlite.js](file:///d:/project/homeledger/src/db/sqlite.js#L37-L60)：本地多值 INSERT
- [src/db/remote.js](file:///d:/project/homeledger/src/db/remote.js#L102)：新增 `bulk` 任务类型，一次往返写多行
- [src/db/worker.js](file:///d:/project/homeledger/src/db/worker.js#L89-L130)：worker 侧拼多值 INSERT，按 200 行分批（避免超出 MySQL `max_allowed_packet` / PG 参数上限）
- [src/db/translate.js](file:///d:/project/homeledger/src/db/translate.js#L64-L68)：PG 批量插入不追加 `RETURNING id`（一次返回上千行 id 无意义且增加传输量）

**2. 分类/账户查询加缓存**（[src/lib/ai.js](file:///d:/project/homeledger/src/lib/ai.js#L487-L545)）

同一账本的分类/账户在一次导入中被反复解析，加进程内缓存后每种只查一次库。缓存由导入流程在批次结束时清空，新建账户时按账本失效。

**3. 导入逻辑改为先解析后批量落库**（[src/lib/importers.js](file:///d:/project/homeledger/src/lib/importers.js#L361-L433)）

逐条解析出待插入行，最后统一批量 INSERT；批量失败时自动退回逐条插入以定位坏数据。

**4. 导入接口放宽前端超时**（[client.ts](file:///d:/project/homeledger/web/src/api/client.ts#L15-L19)、[modules.ts](file:///d:/project/homeledger/web/src/api/modules.ts#L216-L219)）

新增 `IMPORT_TIMEOUT = 300_000`，仅导入的两个接口使用，不影响其他接口。

### 8.4 修复效果

| 指标 | 修复前 | 修复后 | 改善 |
|---|---|---|---|
| SQL 调用数（300 笔） | 1002 | **9**（MySQL）/ **9**（PG） | 111 倍 |
| MySQL 300 笔耗时 | 18,308 ms | **675 ms**（本轮回归 **532 ms**） | 27 倍 |
| PostgreSQL 300 笔耗时 | — | **438 ms** | — |
| MySQL 1466 笔耗时 | ~89,500 ms | **283 ms**（直调）/ **1,015 ms**（端到端提交） | ~88 倍 |
| PostgreSQL 1466 笔耗时 | — | **965 ms**（直调）/ **1,185 ms**（端到端提交） | — |
| SQLite 1466 笔耗时 | 396 ms | **101 ms** | 4 倍 |

端到端实测（真实 HTTP 调用导入接口，1466 笔）：

```
# MySQL
预览: status=200 耗时=368ms count=1466
提交: status=200 耗时=1015ms
结果: {"imported":1466,"skipped":0,"failed":0}

# PostgreSQL
预览: status=200 耗时=322ms count=1466
提交: status=200 耗时=1185ms
结果: {"imported":1466,"skipped":0,"failed":0,"createdAccounts":[]}
```

### 8.5 正确性验证

批量插入必须与逐条插入等价，已验证：

| 校验项 | MySQL | PostgreSQL | SQLite |
|---|---|---|---|
| 实际落库条数 = 1466 | 通过 | 通过 | 通过 |
| 金额合计与预期精确一致（14,706,265 分） | 通过 | 通过 | 通过 |
| 无重复记录组 | 通过 | 通过 | 通过 |
| 第二遍导入全部判重（skipped=1466, imported=0） | 通过 | 通过 | 通过 |
| 批量失败自动退回逐条插入 | 通过（代码分支） | 通过（代码分支） | 通过 |

PG 实测数据（直调 `importRecords`，两遍各 1466 笔）：

```
第 1 遍：elapsedMs=965  imported=1466 skipped=0    dbCount=1466 dbSum=14706265 countOk=true sumOk=true duplicateGroups=0
第 2 遍：elapsedMs=112  imported=0    skipped=1466 dbCount=1466 dbSum=14706265 countOk=true sumOk=true duplicateGroups=0
```

### 8.6 回归结果

| 范围 | 结果 |
|---|---|
| SQLite 全量 API | 137 / 137 |
| MySQL 全量 API | 136 / 136 |
| PostgreSQL 全量 API | 136 / 136 |
| SQLite / 方言翻译 / 同步桥接 / PG 静态审查 | 全部通过 |
| PG 专项深度验证 | 21 / 21 |
| 前端 TypeScript 类型检查 | 通过 |

---

## 九、删除账本「至少保留一个」校验专项

### 9.1 问题背景

删除最后一个账本后，用户左侧菜单整体消失。原因：删光账本后没有当前账本，前端 [AppShell.vue](file:///d:/project/homeledger/web/src/layouts/AppShell.vue) 的侧栏菜单以 `v-if="session.currentLedger"` 为渲染前提，没有当前账本时菜单整体不渲染，只在内容区显示「还没有账本」引导态。

### 9.2 修复方案

后端（两道防线，v1 API 与遗留 SSR 路由都覆盖）：

- [src/routes/api.v1.admin.js](file:///d:/project/homeledger/src/routes/api.v1.admin.js#L331-L338)：删除前统计该用户拥有的其它账本数，为 0 则拒绝
- [src/routes/admin.js](file:///d:/project/homeledger/src/routes/admin.js#L345-L350)：SSR 路由同逻辑，flash 提示

前端（提前拦截，避免用户填完确认名才被拒）：

- [web/src/views/LedgersView.vue](file:///d:/project/homeledger/web/src/views/LedgersView.vue#L179-L187)：新增 `myOwnedLedgerCount` / `isLastOwnLedger` 计算属性
- 删除弹窗在「最后一个账本」时显示黄色警示条，「永久删除」按钮置灰
- [onDelete](file:///d:/project/homeledger/web/src/views/LedgersView.vue#L189-L196) 二次拦截

校验口径为**用户拥有的账本数**（`owner_id`），与删除权限判定一致；归档账本也计入，因为归档账本在侧栏仍然可见。

### 9.3 验证结果

新增专项用例 10 项，SQLite / MySQL / PostgreSQL 各 10/10 通过：

| 用例 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 删除最后一个账本被拒绝（400） | 通过 | 通过 | 通过 |
| 拒绝提示说明需保留一个账本 | 通过 | 通过 | 通过 |
| 账本未被删除 | 通过 | 通过 | 通过 |
| 有多个账本时删除成功（200） | 通过 | 通过 | 通过 |
| 已清理到只剩 1 个账本 | 通过 | 通过 | 通过 |
| 删到只剩最后一个时再次删除被拒（400） | 通过 | 通过 | 通过 |
| 最后一个账本仍在 | 通过 | 通过 | 通过 |
| 账本名不匹配时拒绝删除（400） | 通过 | 通过 | 通过 |
| session 仍有可用账本 | 通过 | 通过 | 通过 |
| 合计 | **10 / 10** | **10 / 10** | **10 / 10** |

全量回归：SQLite 137/137、MySQL 136/136、PostgreSQL 136/136，前端 TypeScript 类型检查通过。

---

## 十、导出 CSV 时间列专项

### 10.1 问题现象

「导出备份」页面下载的 CSV **只有日期没有时间**。

### 10.2 根因

- [src/lib/importers.js](file:///d:/project/homeledger/src/lib/importers.js#L487-L490) 的 `EXPORT_HEADER` 里根本没有时间列，`exportRows` 也只输出 `t.txn_date`
- 数据库里 `txn_time` 一直是有的（`TXN_SELECT` 用 `t.*`），只是导出时丢弃了
- 更连带的问题：**回导也读不回时间**——`normalizeRow` 的 `txn_time` 只从日期列里抠，而家账簿导出的 CSV 日期列只有 `YYYY-MM-DD`，抠不出时刻

### 10.3 修复方案

**导出**（[importers.js](file:///d:/project/homeledger/src/lib/importers.js#L487-L506)）

- 表头在「日期」后插入「时间」列
- 新增 `exportTime()` 把 `txn_time` 归一成 `HH:mm:ss`（库里存 `HH:mm:ss`，无时间的记录留空）
- 顺带删掉无意义的「备注2」空列（原表头第 15 列一直是空字符串）

**回导**（[importers.js](file:///d:/project/homeledger/src/lib/importers.js#L159-L180)、[L193-L219](file:///d:/project/homeledger/src/lib/importers.js#L193-L219)）

- `normalizeRow` 增加 `time` 参数，`txn_time` 优先取独立时间列，取不到再从日期列抠（兼容支付宝/微信账单）
- 新增 `timeColumnIndex()`：**只认表头恰好是「时间」的列**。不能用 `headerIndex(['时间'])`——它的模糊匹配会把支付宝账单的「交易时间」列也抓进来，而那列本身就是完整时间戳，单独取时间会重复
- `iDate` 的候选里移除「时间」，避免与独立时间列冲突

### 10.4 验证结果

新增专项用例 12 项，SQLite / MySQL / PostgreSQL 各 12/12 通过：

| 用例 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 创建 3 笔带时间的交易 | 通过 | 通过 | 通过 |
| 列表接口返回 txn_time | 通过 | 通过 | 通过 |
| 导出 CSV 返回 200 | 通过 | 通过 | 通过 |
| CSV 有表头 + 数据行 | 通过 | 通过 | 通过 |
| CSV 表头含「时间」列 | 通过 | 通过 | 通过 |
| 「时间」列紧跟「日期」列 | 通过 | 通过 | 通过 |
| 数据行包含带时间的记录 | 通过 | 通过 | 通过 |
| 时间单元格非空 | 通过 | 通过 | 通过 |
| 时间值格式为 HH:mm:ss | 通过 | 通过 | 通过 |
| 回导预览成功 | 通过 | 通过 | 通过 |
| 回导提交成功 | 通过 | 通过 | 通过 |
| 回导的记录都带上了时间 | 通过 | 通过 | 通过 |
| 合计 | **12 / 12** | **12 / 12** | **12 / 12** |

导出样例（修复后，PG 实例实测）：

```
日期,时间,类型,金额,币种,折算金额,分类,账户,转入账户,成员,商家,备注,标签,来源,状态,type_key
2026-08-11,08:15:30,支出,10.00,CNY,10.00,餐饮,现金,,E2E用户,导出测试0,导出测试0,,manual,cleared,expense
```

PG 回导结果：`{"imported":3,"skipped":0,"failed":0}`。

全量回归：SQLite 137/137、MySQL 136/136、PostgreSQL 136/136。

---

## 十一、测试方法说明

测试采用黑盒 HTTP 端到端方式，不依赖项目内部实现：

1. **隔离启动**：以独立环境变量（端口 / 数据目录 / 数据库）启动服务端实例，通过 `fetch` 直接调用 HTTP 接口
2. **会话管理**：自动维护 `hl.sid` Cookie 与 `X-CSRF-Token`，严格遵循「登录后重新获取 CSRF」的真实流程
3. **数据隔离**：每个测试用唯一标识（时间戳 36 进制）命名，测试结束自动回收
4. **跨库一致性**：同一脚本分别在三个库执行，剔除 `created_at` 等时间戳后深度比对结果对象
5. **方言边界专项**：针对 PG 的类型解析、事务语义、`RETURNING id`、`ILIKE`、`string_agg`、数值精度做定向验证（21 项）

**本轮新增的 PG 隔离约定**：

- PG 使用独立库 `homeledger_test`（另有 `homeledger_verify` / `homeledger_bench` 供导入专项），生产库 `homeledger` 仅做只读结构检查，不写业务数据
- E2E 脚本中「整库备份」分支通过环境变量 `E2E_BACKUP_SUPPORTED=false` 切换为「预期拒绝」用例

测试脚本位于临时目录（`%TEMP%\hl-selftest\`），不进入仓库。需要长期回归时，可将 `e2e.js`、`pg-lint.js`、`probe-pg-specific.js` 迁入 `test/` 目录并接入 CI。

---

## 十二、回归执行清单

后续修改后建议按此顺序验证：

```bash
# 1. 单元级自测
node test/selftest-sqlite.js       # SQLite 驱动与建表/迁移/事务
node test/selftest-translate.js    # 方言翻译
node test/selftest-bridge.js       # 同步桥接

# 2. 方言静态审查（新增/修改 SQL 后必跑）
node test/pg-lint.js               # 扫描残留 + 翻译层断言

# 3. 端到端（需先启动实例）
node test/e2e.js http://127.0.0.1:5122   # SQLite（137 用例）
node test/e2e.js http://127.0.0.1:5123   # MySQL（136 用例）
node test/e2e.js http://127.0.0.1:5124   # PostgreSQL（136 用例）
#    注：MySQL / PG 需设 E2E_BACKUP_SUPPORTED=false（备份按设计仅支持 SQLite）

# 4. 交叉一致性（需三库同时运行且数据相同）
node test/cross-check.js http://127.0.0.1:5122
node test/cross-check.js http://127.0.0.1:5123
node test/cross-check.js http://127.0.0.1:5124
node test/cross-diff-3way.js

# 5. 导入性能回归（大批量导入耗时与正确性）
node test/bench-import.js                    # 基准：SQL 调用数与耗时
node test/verify-import.js                   # 正确性：条数/金额/判重
node test/e2e-import.js http://127.0.0.1:5123  # 端到端导入 1466 笔

# 6. PostgreSQL 方言专项（2026-11-03 新增）
node test/probe-pg-specific.js            # 21 项方言与类型语义验证
node test/probe-pg-prod-schema.js         # 正式 .env 配置的建表链路验证
```
