'use strict';
/**
 * 数据库 worker：在独立线程中执行 mysql2 / pg 的异步调用。
 * 与主线程通过 SharedArrayBuffer + Atomics 通信（协议见 remote.js 头部注释）。
 * 职责：连接管理、方言 SQL 翻译、DDL 转换与建表、增量迁移、事务连接绑定。
 */
const { workerData } = require('node:worker_threads');
const { SCHEMA_DDL, MIGRATIONS, EXTRA_INDEXES, TABLES_WITHOUT_ID } = require('./schema');
const { translateMysql, translatePg, ddlTableMysql, ddlIndexMysql, isDupErr } = require('./translate');

const { dialect, config, sab } = workerData;
const i32 = new Int32Array(sab);
const HEADER = 16;

let pool = null;   // 连接池
let txConn = null; // 事务专用连接（mysql: PoolConnection / pg: PoolClient）

/* -------------------------------- 方言翻译 -------------------------------- */

function translate(sql) {
  return dialect === 'mysql' ? translateMysql(sql) : translatePg(sql, TABLES_WITHOUT_ID);
}

/** 建表 + 幂等迁移（worker 启动时执行一次） */
async function initSchema() {
  const q = (sql, params) => (dialect === 'mysql' ? pool.query(sql, params) : pool.query(sql, params));
  const stmts = SCHEMA_DDL.split(';').map((s) => s.trim()).filter(Boolean);
  for (let stmt of stmts) {
    try {
      if (dialect === 'mysql') {
        if (/^CREATE INDEX/i.test(stmt)) await q(ddlIndexMysql(stmt), []);
        else await q(ddlTableMysql(stmt), []);
      } else {
        stmt = stmt.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY');
        // PG 的 REAL 是 4 字节单精度，SQLite/MySQL 用的都是 8 字节双精度
        stmt = stmt.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
        await q(stmt, []);
      }
    } catch (e) {
      if (!isDupErr(e)) throw e;
    }
  }
  // 增量迁移：列不存在才加
  const colSql = dialect === 'mysql'
    ? 'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
    : 'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position';
  for (const { table, column, ddl } of MIGRATIONS) {
    const res = await q(colSql, [table]);
    const rows = dialect === 'mysql' ? res[0] : res.rows;
    if (!rows.some((r) => String(r.name) === column)) {
      await q(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`, []);
    }
  }
  for (const idx of EXTRA_INDEXES) {
    try {
      if (dialect === 'mysql') await q(ddlIndexMysql(idx), []);
      else await q(idx, []);
    } catch (e) {
      if (!isDupErr(e)) throw e;
    }
  }
}

/* -------------------------------- 查询执行 -------------------------------- */

/** 统一执行；事务进行中时所有查询绑定在事务连接上 */
async function execQuery(kind, sql, params) {
  const t = translate(sql);
  const clean = params.map((p) => (p === undefined ? null : p));
  if (dialect === 'mysql') {
    const conn = txConn || pool;
    const [res] = await conn.query(t, clean);
    if (Array.isArray(res)) {
      if (kind === 'get') return res[0];
      return res;
    }
    return { changes: Number(res.affectedRows || 0), lastInsertRowid: Number(res.insertId || 0) };
  }
  // PostgreSQL
  const client = txClient || pool;
  const res = await client.query(t, clean);
  if (kind === 'run') {
    return { changes: res.rowCount, lastInsertRowid: res.rows[0] ? Number(res.rows[0].id) : 0 };
  }
  if (kind === 'get') return res.rows[0];
  return res.rows;
}

/**
 * 批量插入：把多行拼成一条多值 INSERT，一次往返写完。
 * 大批量导入（上千条）在远程驱动下是性能瓶颈所在——逐条插入意味着每条一次跨线程阻塞。
 */
async function execBulk(sql, rows) {
  if (!rows || !rows.length) return { changes: 0, lastInsertRowid: 0 };
  const m = /\bVALUES\s*(\([^)]*\))/i.exec(sql);
  if (!m) throw new Error('[db] 批量插入需要形如 INSERT ... VALUES (?,?) 的单行模板');
  const placeholder = m[1];
  const colCount = (placeholder.match(/\?/g) || []).length;
  for (const row of rows) {
    if (row.length !== colCount) throw new Error(`[db] 批量插入参数个数不匹配：期望 ${colCount}，实际 ${row.length}`);
  }
  // 分批：避免单条语句过长超出服务端限制（MySQL max_allowed_packet / PG 参数上限）
  const CHUNK = 200;
  let changes = 0;
  let lastInsertRowid = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const flat = [];
    const values = slice.map(() => placeholder).join(',');
    for (const row of slice) for (const v of row) flat.push(v === undefined ? null : v);
    let stmt = `${sql.slice(0, m.index)}VALUES ${values}`;
    if (dialect === 'mysql') {
      stmt = translateMysql(stmt);
    } else {
      stmt = translatePg(stmt, TABLES_WITHOUT_ID, { bulk: true });
    }
    if (dialect === 'mysql') {
      const conn = txConn || pool;
      const [res] = await conn.query(stmt, flat);
      changes += Number(res.affectedRows || 0);
      if (res.insertId) lastInsertRowid = Number(res.insertId);
    } else {
      const client = txClient || pool;
      const res = await client.query(stmt, flat);
      changes += res.rowCount;
      if (res.rows[0] && res.rows[0].id) lastInsertRowid = Number(res.rows[0].id);
    }
  }
  return { changes, lastInsertRowid };
}

async function handle(job) {
  switch (job.op) {
    case '__ready__':
      await initPromise;
      if (initError) throw initError;
      return { dialect };
    case 'query':
      return execQuery(job.kind, job.sql, job.params);
    case 'bulk':
      return execBulk(job.sql, job.rows);
    case 'tx-begin':
      if (dialect === 'mysql') {
        txConn = await pool.getConnection();
        await txConn.beginTransaction();
      } else {
        txClient = await pool.connect();
        await txClient.query('BEGIN');
      }
      return null;
    case 'tx-commit':
      if (dialect === 'mysql') {
        await txConn.commit(); txConn.release(); txConn = null;
      } else {
        await txClient.query('COMMIT'); txClient.release(); txClient = null;
      }
      return null;
    case 'tx-rollback':
      if (dialect === 'mysql') {
        try { await txConn.rollback(); } finally { txConn.release(); txConn = null; }
      } else {
        try { await txClient.query('ROLLBACK'); } finally { txClient.release(); txClient = null; }
      }
      return null;
    default:
      throw new Error(`[db] 未知任务类型：${job.op}`);
  }
}

async function createPool() {
  if (dialect === 'mysql') {
    const mysql = require('mysql2/promise');
    return mysql.createPool({
      host: config.host, port: config.port, user: config.user,
      password: config.password, database: config.database,
      connectionLimit: 10,
      charset: 'utf8mb4',
      dateStrings: true,      // 日期一律返回字符串（本项目的日期本就以字符串存储）
      supportBigNumbers: true,
      decimalNumbers: true,   // SUM 等 DECIMAL 结果返回 number（默认是字符串），对齐 SQLite 行为
      connectTimeout: 10000,  // 连不上时 10 秒内报错，避免启动卡死
    });
  }
  const pg = require('pg');
  // pg 默认把 int8/numeric 返回为字符串，统一转回 number，对齐 SQLite 行为
  pg.types.setTypeParser(20, (v) => parseInt(v, 10));   // int8
  pg.types.setTypeParser(1700, (v) => parseFloat(v));   // numeric
  return new pg.Pool({ ...config, connectionTimeoutMillis: 10000 });
}

/* ------------------------------ 主循环（协议见 remote.js） ------------------------------ */

let initError = null;
const initPromise = (async () => {
  try {
    pool = await createPool();
    await initSchema();
  } catch (e) {
    initError = e;
    console.error(`[db] ${dialect} 连接/建表失败：${e.message}`);
  }
})();

let processed = 0;
(async () => {
for (;;) {
  const seq = Atomics.load(i32, 0);
  if (seq > processed) {
    processed = seq;
    const jobLen = Atomics.load(i32, 2);
    const job = JSON.parse(Buffer.from(new Uint8Array(sab, HEADER, jobLen)).toString('utf8'));
    let payload;
    let st;
    try {
      if (initError) throw initError;
      const result = await handle(job);
      payload = { result };
      st = 1;
    } catch (e) {
      payload = { error: String((e && e.message) || e) };
      st = 2;
    }
    const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const need = HEADER + bytes.length;
    if (sab.byteLength < need) sab.grow(need);
    new Uint8Array(sab).set(bytes, HEADER);
    Atomics.store(i32, 3, bytes.length);
    Atomics.store(i32, 1, st);
    Atomics.notify(i32, 1);
  } else {
    Atomics.wait(i32, 0, seq); // 等待下一个任务（已有新任务时立即返回）
  }
}
})();
