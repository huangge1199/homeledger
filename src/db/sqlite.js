'use strict';
/**
 * SQLite 驱动（Node 内置 node:sqlite，同步 API，零原生依赖）
 * 职责：连接管理、建表、幂等迁移、预编译语句缓存、事务、备份恢复用的热重开
 */
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { SCHEMA_DDL, MIGRATIONS, EXTRA_INDEXES } = require('./schema');

module.exports = function createSqliteDriver({ dbFile }) {
  const DB_FILE = dbFile;

  let db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  /* ------------------------------ 预编译语句缓存 ------------------------------ */

  const cache = new Map();
  function prep(sql) {
    let s = cache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  }
  const all = (sql, ...p) => prep(sql).all(...p);
  const get = (sql, ...p) => prep(sql).get(...p);
  const run = (sql, ...p) => {
    const r = prep(sql).run(...p);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  };

  /**
   * 批量插入：把多行数据拼成一条多值 INSERT 语句一次写入。
   * 大批量导入时能显著减少 SQL 往返次数（远程驱动下这是性能瓶颈的唯一解法）。
   * @param {string} sql 形如 `INSERT INTO t (a,b) VALUES (?,?)` 的单行模板
   * @param {Array<Array>} rows 每行一组参数
   * @returns {{changes:number, lastInsertRowid:number}}
   */
  function runBatch(sql, rows) {
    if (!rows || !rows.length) return { changes: 0, lastInsertRowid: 0 };
    const m = /\bVALUES\s*(\([^)]*\))/i.exec(sql);
    if (!m) throw new Error('[db] runBatch 需要形如 INSERT ... VALUES (?,?) 的单行模板');
    const placeholder = m[1];
    const colCount = (placeholder.match(/\?/g) || []).length;
    const head = sql.slice(0, m.index) + 'VALUES ';
    const chunks = [];
    const params = [];
    for (const row of rows) {
      if (row.length !== colCount) throw new Error(`[db] runBatch 参数个数不匹配：期望 ${colCount}，实际 ${row.length}`);
      chunks.push(placeholder);
      params.push(...row);
    }
    const stmt = prep(`${head}${chunks.join(',')}`);
    const r = stmt.run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  function tx(fn) {
    // 可重入：批量操作会在事务里再次调用走 tx 的写入函数（createTransaction → recalcBalances），
    // SQLite 不允许嵌套 BEGIN，此时直接沿用在当前事务内执行。
    let nested = false;
    try {
      db.exec('BEGIN');
    } catch (e) {
      if (/within a transaction/i.test(e.message)) nested = true;
      else throw e;
    }
    if (nested) return fn();
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  /* ---------------------------------- 迁移 ---------------------------------- */

  /** 读出某张表的现有列 */
  function tableColumns(table) {
    return all(`PRAGMA table_info(${table})`).map((r) => String(r.name));
  }

  /** 只加不改：列不存在才 ALTER TABLE，老库升级可安全重复执行 */
  function ensureColumn(table, column, ddl) {
    if (tableColumns(table).includes(column)) return false;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    return true;
  }

  function applySchema() {
    db.exec(SCHEMA_DDL);
    const migrated = [];
    for (const { table, column, ddl } of MIGRATIONS) {
      if (ensureColumn(table, column, ddl)) migrated.push(`${table}.${column}`);
    }
    if (migrated.length) console.log(`[db] 已补齐字段：${migrated.join('、')}`);
    for (const idx of EXTRA_INDEXES) db.exec(idx);
  }
  applySchema();

  /**
   * 关闭当前连接并重新打开（用于备份恢复：文件被外部替换后调用此函数刷新连接）。
   * 清空预编译语句缓存（旧语句绑定在旧连接上）并重跑初始化。
   */
  function reopenDatabase() {
    try { db.close(); } catch { /* ignore */ }
    // 清理 WAL/SHM 残留（旧连接的写入已通过 WAL checkpoint 合并或随 close 丢弃）
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix); } catch { /* ignore */ }
    }
    db = new DatabaseSync(DB_FILE);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    cache.clear();
    applySchema();
  }

  return {
    dialect: 'sqlite',
    all, get, run, runBatch, tx, prep,
    db, DB_FILE,
    tableColumns, ensureColumn, reopenDatabase,
    init() { /* 建表已在模块加载时完成 */ },
  };
};
