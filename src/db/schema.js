'use strict';
/**
 * 数据库 Schema 源（以 SQLite 方言书写，三库通用建表的唯一来源）
 * - 类型规则：定长/可索引字段用 VARCHAR(n)（SQLite 中等价 TEXT，不影响现有库）；
 *   长文本用 TEXT；毫秒时间戳用 BIGINT（MySQL/PG 的 INT 是 32 位会溢出）。
 * - MySQL/PG 由 worker.js 按方言转换本文件内容后执行。
 */

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      VARCHAR(255) NOT NULL UNIQUE,
  email         VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  avatar_color  VARCHAR(16) NOT NULL DEFAULT '#4f7cff',
  theme         VARCHAR(16) NOT NULL DEFAULT 'light',
  is_admin      INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  last_login_at VARCHAR(32),
  created_at    VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sid        VARCHAR(64) PRIMARY KEY,
  user_id    INTEGER,
  expires_at BIGINT NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledgers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        VARCHAR(255) NOT NULL,
  kind        VARCHAR(16) NOT NULL DEFAULT 'personal',
  currency    VARCHAR(8) NOT NULL DEFAULT 'CNY',
  icon        VARCHAR(8) NOT NULL DEFAULT '📒',
  color       VARCHAR(16) NOT NULL DEFAULT '#4f7cff',
  owner_id    INTEGER NOT NULL,
  note        TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  role      VARCHAR(16) NOT NULL DEFAULT 'member',
  nickname  VARCHAR(255),
  joined_at VARCHAR(32) NOT NULL,
  UNIQUE(ledger_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lm_user ON ledger_members(user_id);

CREATE TABLE IF NOT EXISTS ledger_invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id  INTEGER NOT NULL,
  code       VARCHAR(64) NOT NULL UNIQUE,
  role       VARCHAR(16) NOT NULL DEFAULT 'member',
  created_by INTEGER NOT NULL,
  expires_at VARCHAR(32),
  used_by    INTEGER,
  used_at    VARCHAR(32),
  created_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id       INTEGER NOT NULL,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(16) NOT NULL DEFAULT 'cash',
  icon            VARCHAR(8) NOT NULL DEFAULT '💵',
  currency        VARCHAR(8) NOT NULL DEFAULT 'CNY',
  initial_cents   INTEGER NOT NULL DEFAULT 0,
  balance_cents   INTEGER NOT NULL DEFAULT 0,
  credit_limit    INTEGER,
  bill_day        INTEGER,
  due_day         INTEGER,
  institution     VARCHAR(255),
  card_no         VARCHAR(255),
  note            TEXT,
  include_in_net  INTEGER NOT NULL DEFAULT 1,
  is_archived     INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_acc_ledger ON accounts(ledger_id);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id  INTEGER,
  name       VARCHAR(255) NOT NULL,
  kind       VARCHAR(16) NOT NULL DEFAULT 'expense',
  parent_id  INTEGER,
  icon       VARCHAR(8) NOT NULL DEFAULT '🏷️',
  color      VARCHAR(16) NOT NULL DEFAULT '#8c8c8c',
  is_system  INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cat_kind ON categories(kind, parent_id);

CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id INTEGER NOT NULL,
  name      VARCHAR(255) NOT NULL,
  color     VARCHAR(16) NOT NULL DEFAULT '#4f7cff',
  UNIQUE(ledger_id, name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id        INTEGER NOT NULL,
  type             VARCHAR(16) NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         VARCHAR(8) NOT NULL DEFAULT 'CNY',
  rate             REAL NOT NULL DEFAULT 1,
  amount_base_cents INTEGER NOT NULL,
  account_id       INTEGER,
  to_account_id    INTEGER,
  category_id      INTEGER,
  user_id          INTEGER NOT NULL,
  txn_date         VARCHAR(10) NOT NULL,
  txn_time         VARCHAR(8),
  note             TEXT,
  merchant         VARCHAR(255),
  status           VARCHAR(16) NOT NULL DEFAULT 'cleared',
  is_reimbursable  INTEGER NOT NULL DEFAULT 0,
  reimbursed_at    VARCHAR(32),
  related_id       INTEGER,
  group_id         VARCHAR(64),
  source           VARCHAR(16) NOT NULL DEFAULT 'manual',
  ai_json          TEXT,
  created_at       VARCHAR(32) NOT NULL,
  updated_at       VARCHAR(32) NOT NULL,
  deleted_at       VARCHAR(32)
);
CREATE INDEX IF NOT EXISTS idx_txn_ledger_date ON transactions(ledger_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_txn_cat ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_txn_group ON transactions(group_id);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INTEGER NOT NULL,
  tag_id         INTEGER NOT NULL,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS splits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     VARCHAR(64) NOT NULL,
  transaction_id INTEGER,
  ledger_id    INTEGER NOT NULL,
  user_id      INTEGER,
  member_name  VARCHAR(255) NOT NULL,
  share_cents  INTEGER NOT NULL,
  is_settled   INTEGER NOT NULL DEFAULT 0,
  settled_at   VARCHAR(32),
  created_at   VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_split_group ON splits(group_id);

CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id  INTEGER NOT NULL,
  txn_id     INTEGER,
  user_id    INTEGER NOT NULL,
  kind       VARCHAR(16) NOT NULL DEFAULT 'screenshot',
  file_name  VARCHAR(255) NOT NULL,
  rel_path   VARCHAR(512) NOT NULL,
  mime       VARCHAR(128),
  size       INTEGER,
  ai_status  VARCHAR(16) NOT NULL DEFAULT 'none',
  created_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_txn ON attachments(txn_id);

CREATE TABLE IF NOT EXISTS budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id   INTEGER NOT NULL,
  name        VARCHAR(255) NOT NULL,
  scope       VARCHAR(16) NOT NULL DEFAULT 'overall',
  category_id INTEGER,
  account_id  INTEGER,
  period      VARCHAR(16) NOT NULL DEFAULT 'monthly',
  amount_cents INTEGER NOT NULL,
  currency    VARCHAR(8) NOT NULL DEFAULT 'CNY',
  trigger_type VARCHAR(16) NOT NULL DEFAULT 'expense',
  rollover    INTEGER NOT NULL DEFAULT 0,
  alert_pct   INTEGER NOT NULL DEFAULT 80,
  start_date  VARCHAR(10),
  end_date    VARCHAR(10),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id   INTEGER NOT NULL,
  name        VARCHAR(255) NOT NULL,
  payload     TEXT NOT NULL,
  frequency   VARCHAR(16) NOT NULL DEFAULT 'monthly',
  interval_n  INTEGER NOT NULL DEFAULT 1,
  day_of_month INTEGER,
  weekday     INTEGER,
  next_run_at VARCHAR(32) NOT NULL,
  last_run_at VARCHAR(32),
  auto_post   INTEGER NOT NULL DEFAULT 1,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id     INTEGER NOT NULL,
  name          VARCHAR(255) NOT NULL,
  icon          VARCHAR(8) NOT NULL DEFAULT '🎯',
  target_cents  INTEGER NOT NULL,
  saved_cents   INTEGER NOT NULL DEFAULT 0,
  account_id    INTEGER,
  target_date   VARCHAR(10),
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  note          TEXT,
  created_at    VARCHAR(32) NOT NULL
);

-- 订阅扣费：软件 / 网站 / 会员的周期性自动扣费管理
--   cycle 计费周期（monthly/quarterly/half_yearly/yearly/weekly），cycle_n 为「每 N 个周期」
--   anchor_month + anchor_day 描述扣费锚点（年付时 anchor_month 决定扣费月份）
--   status：trial 试用中 / active 生效 / paused 暂停 / canceled 已取消
CREATE TABLE IF NOT EXISTS subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id     INTEGER NOT NULL,
  name          VARCHAR(255) NOT NULL,
  icon          VARCHAR(8) NOT NULL DEFAULT '🧾',
  plan          VARCHAR(64),
  vendor_url    VARCHAR(512),
  amount_cents  INTEGER NOT NULL,
  currency      VARCHAR(8) NOT NULL DEFAULT 'CNY',
  cycle         VARCHAR(16) NOT NULL DEFAULT 'monthly',
  cycle_n       INTEGER NOT NULL DEFAULT 1,
  anchor_month  INTEGER,
  anchor_day    INTEGER,
  account_id    INTEGER,
  category_id   INTEGER,
  auto_renew    INTEGER NOT NULL DEFAULT 1,
  trial_ends_on VARCHAR(10),
  next_charge_at VARCHAR(32) NOT NULL,
  last_charge_at VARCHAR(32),
  reminder_days INTEGER NOT NULL DEFAULT 3,
  charge_count  INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  note          TEXT,
  created_by_user_id INTEGER,
  canceled_at   VARCHAR(32),
  created_at    VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_ledger ON subscriptions(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_next ON subscriptions(next_charge_at);

CREATE TABLE IF NOT EXISTS debts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id     INTEGER NOT NULL,
  direction     VARCHAR(16) NOT NULL,
  counterparty  VARCHAR(255) NOT NULL,
  principal_cents INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL,
  currency      VARCHAR(8) NOT NULL DEFAULT 'CNY',
  account_id    INTEGER,
  due_date      VARCHAR(10),
  status        VARCHAR(16) NOT NULL DEFAULT 'open',
  note          TEXT,
  created_at    VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  ledger_id  INTEGER,
  kind       VARCHAR(16) NOT NULL DEFAULT 'info',
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  link       VARCHAR(255),
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  ledger_id  INTEGER,
  action     VARCHAR(64) NOT NULL,
  entity     VARCHAR(32),
  entity_id  INTEGER,
  detail     TEXT,
  ip         VARCHAR(64),
  ua         TEXT,
  created_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  base   VARCHAR(8) NOT NULL,
  quote  VARCHAR(8) NOT NULL,
  rate   REAL NOT NULL,
  noted_at VARCHAR(10) NOT NULL,
  UNIQUE(base, quote)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id  INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  source     VARCHAR(32) NOT NULL,
  file_name  VARCHAR(255),
  total      INTEGER NOT NULL DEFAULT 0,
  imported   INTEGER NOT NULL DEFAULT 0,
  skipped    INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  status     VARCHAR(16) NOT NULL DEFAULT 'done',
  message    TEXT,
  created_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  ledger_id    INTEGER,
  name         VARCHAR(255) NOT NULL,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,
  token_tail   VARCHAR(16) NOT NULL,
  last_used_at VARCHAR(32),
  revoked_at   VARCHAR(32),
  created_at   VARCHAR(32) NOT NULL
);
`;

/** 只加不改的增量迁移（老库升级可安全重复执行） */
const MIGRATIONS = [
  { table: 'transactions', column: 'subscription_id', ddl: 'INTEGER' },
  // 消费时刻（HH:mm，可空）：txn_date 只到天，消费时刻需单独记录
  { table: 'transactions', column: 'txn_time', ddl: 'TEXT' },
  { table: 'users', column: 'avatar_path', ddl: 'VARCHAR(255)' },
  { table: 'users', column: 'avatar_ver', ddl: 'BIGINT' },
];

/** 必须在建表/迁移之后创建的索引 */
const EXTRA_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_txn_subscription ON transactions(subscription_id);',
];

/** 无自增 id 主键的表（PostgreSQL 的 INSERT 不能为它们追加 RETURNING id） */
const TABLES_WITHOUT_ID = new Set(['sessions', 'settings', 'transaction_tags']);

module.exports = { SCHEMA_DDL, MIGRATIONS, EXTRA_INDEXES, TABLES_WITHOUT_ID };
