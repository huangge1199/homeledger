'use strict';
/**
 * SQL 方言翻译（纯函数，便于单测）
 * 业务层统一书写「SQLite/PG 风格」SQL，由这里翻译成 MySQL / PostgreSQL 方言。
 */

/**
 * GROUP_CONCAT 的分隔符语法三方不同：
 *   SQLite  group_concat(x, 'sep')
 *   MySQL   GROUP_CONCAT(x SEPARATOR 'sep')
 *   PG      string_agg(x, 'sep')
 * 业务层统一写 SQLite 风格，这里按方言转换。
 */
function groupConcatMysql(sql) {
  return sql.replace(/GROUP_CONCAT\s*\(\s*([^,()]+?)\s*,\s*'([^']*)'\s*\)/gi, "GROUP_CONCAT($1 SEPARATOR '$2')");
}
function groupConcatPg(sql) {
  return sql
    .replace(/GROUP_CONCAT\s*\(\s*([^,()]+?)\s*,\s*'([^']*)'\s*\)/gi, "string_agg($1, '$2')")
    .replace(/GROUP_CONCAT\s*\(\s*([^,()]+?)\s*\)/gi, "string_agg($1, ',')");
}

/**
 * CAST(... AS CHAR) 只有 MySQL 认；SQLite / PostgreSQL 都用 AS TEXT。
 * 业务层统一写 AS CHAR（避免 MySQL 的 || 被当成逻辑或），这里按方言转换。
 */
function castCharPg(sql) {
  return sql.replace(/\bAS\s+CHAR\b/gi, 'AS TEXT');
}

/**
 * MySQL：SQLite/PG 风格 SQL → MySQL
 * - INSERT OR REPLACE / INSERT OR IGNORE → REPLACE INTO / INSERT IGNORE
 * - ON CONFLICT(cols) DO UPDATE SET a = excluded.a → ON DUPLICATE KEY UPDATE a = VALUES(a)
 * - ON CONFLICT DO NOTHING → INSERT IGNORE
 * - settings 表的 key 列是 MySQL 保留字，统一加反引号
 */
function translateMysql(sql) {
  let s = sql;
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(s)) s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'REPLACE INTO');
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)) s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT IGNORE INTO');
  if (/\bsettings\b/i.test(s)) s = s.replace(/(?<!PRIMARY\s)\bkey\b/gi, '`key`');
  if (/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(s)) {
    s = s.replace(/ON\s+CONFLICT\s+DO\s+NOTHING/i, '');
    if (/^\s*INSERT\s+INTO/i.test(s)) s = s.replace(/^\s*INSERT\s+INTO/i, 'INSERT IGNORE INTO');
  }
  s = s.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/i, 'ON DUPLICATE KEY UPDATE');
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*excluded\.([A-Za-z_][A-Za-z0-9_]*)/g, '$1 = VALUES($2)');
  s = groupConcatMysql(s);
  return s;
}

/**
 * PostgreSQL：
 * - ? 占位符 → $n（跳过字符串字面量）
 * - LIKE → ILIKE（对齐 SQLite LIKE 的大小写不敏感行为）
 * - INSERT 且目标表有自增 id 且未显式 RETURNING：追加 RETURNING id 以支持 lastInsertRowid
 */
function translatePg(sql, tablesWithoutId, opts = {}) {
  let s = sql;
  if (/\bLIKE\b/.test(s)) s = s.replace(/\bLIKE\b/g, 'ILIKE');
  s = groupConcatPg(s);
  s = castCharPg(s);
  const m = /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(s);
  // 批量插入不追加 RETURNING：一次返回上千行 id 没有意义，且白白增加传输量
  if (m && !opts.bulk && !/\bRETURNING\b/i.test(s) && !(tablesWithoutId || new Set()).has(m[1].toLowerCase())) {
    s += ' RETURNING id';
  }
  let out = '';
  let inStr = false;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") { inStr = !inStr; out += ch; continue; }
    if (ch === '?' && !inStr) out += '$' + (++n);
    else out += ch;
  }
  return out;
}

/** 单条 CREATE TABLE → MySQL（AUTO_INCREMENT、DOUBLE、utf8mb4 表选项、key 保留字加反引号） */
function ddlTableMysql(stmt) {
  let s = stmt
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'INT AUTO_INCREMENT PRIMARY KEY')
    .replace(/\bTEXT\s+PRIMARY\s+KEY\b/gi, 'VARCHAR(191) PRIMARY KEY')
    .replace(/\bREAL\b/gi, 'DOUBLE')
    // settings 表的 key 列是 MySQL 保留字（注意不能误伤 PRIMARY KEY）
    .replace(/(?<!PRIMARY\s)\bkey\b/gi, '`key`');
  if (s.endsWith(')')) s = s.slice(0, -1) + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  return s;
}

/** CREATE INDEX IF NOT EXISTS → MySQL 无此语法，去掉并靠捕获重复错误实现幂等 */
function ddlIndexMysql(stmt) {
  return stmt.replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i, 'CREATE INDEX');
}

/** 可忽略的重复对象错误（建表/建索引幂等） */
function isDupErr(e) {
  if (!e) return false;
  if (e.errno === 1061 || e.code === 'ER_DUP_KEYNAME') return true; // MySQL：索引重名
  return ['42P07', '42710'].includes(e.code); // PG：duplicate_table / duplicate_column
}

module.exports = { translateMysql, translatePg, ddlTableMysql, ddlIndexMysql, isDupErr, groupConcatMysql, groupConcatPg, castCharPg };
