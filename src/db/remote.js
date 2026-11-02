'use strict';
/**
 * MySQL / PostgreSQL 驱动：主线程同步 API 桥接
 *
 * 背景：mysql2 与 pg 都是异步驱动，而本项目全代码库以同步方式调用 all/get/run/tx
 *（约 200+ 处）。为了不改写业务代码，这里把真正的驱动调用放进 worker 线程异步执行，
 * 主线程通过 SharedArrayBuffer + Atomics.wait 阻塞等待结果，对外保持与 SQLite
 * 完全一致的同步语义（单线程 + 顺序执行，事务内不存在并发交错）。
 *
 * SAB 布局（Int32 索引 / 字节偏移）：
 *   [0]/0   任务序号 seq（每次调用 +1）
 *   [1]/4   状态：0 执行中 / 1 成功 / 2 失败
 *   [2]/8   任务 JSON 字节长度
 *   [3]/12  结果 JSON 字节长度
 *   16~     数据区（growable SAB，最大 256MB，任一线程可 grow）
 */
const { Worker } = require('node:worker_threads');
const path = require('node:path');

const HEADER = 16;
const MAX_BYTES = 256 * 1024 * 1024;

module.exports = function createRemoteDriver({ dialect, config }) {
  const sab = new SharedArrayBuffer(1024 * 1024, { maxByteLength: MAX_BYTES });
  const i32 = new Int32Array(sab);
  let workerAlive = true;

  const worker = new Worker(process.env.DB_WORKER_OVERRIDE || path.join(__dirname, 'worker.js'), {
    workerData: { dialect, config, sab },
  });
  worker.on('exit', () => { workerAlive = false; });
  worker.on('error', (e) => {
    workerAlive = false;
    console.error('[db] 数据库 worker 异常退出：', e);
  });

  // 启动握手：同步等待 worker 完成连接池创建与建表迁移。
  // 连接失败（密码错误/库不存在等）会在此处直接抛出，让进程带着明确原因启动失败。
  call('__ready__');

  /** 同步执行一个 worker 任务（阻塞直至结果返回） */
  function call(op, kind = null, sql = null, params = [], rows = null) {
    if (!workerAlive) throw new Error('[db] 数据库 worker 已退出，无法执行查询');
    const job = Buffer.from(JSON.stringify({ op, kind, sql, params, rows }), 'utf8');
    const need = HEADER + job.length;
    if (sab.byteLength < need) sab.grow(need);
    new Uint8Array(sab).set(job, HEADER);
    Atomics.store(i32, 2, job.length);
    Atomics.store(i32, 1, 0);
    Atomics.add(i32, 0, 1);
    Atomics.notify(i32, 0);
    for (;;) {
      const r = Atomics.wait(i32, 1, 0, 1000);
      if (r === 'ok' || r === 'not-equal') break;
      // 超时唤醒：确认 worker 还活着就继续等（对应长事务/慢查询）
      if (!workerAlive) throw new Error('[db] 数据库 worker 已退出，查询中止');
    }
    const status = Atomics.load(i32, 1);
    const len = Atomics.load(i32, 3);
    const payload = JSON.parse(Buffer.from(new Uint8Array(sab, HEADER, len)).toString('utf8'));
    if (status === 2) throw new Error(payload.error || '[db] 未知数据库错误');
    return payload.result;
  }

  let txDepth = 0;
  function tx(fn) {
    // 可重入：与 SQLite 版语义一致，嵌套调用直接沿用当前事务
    if (txDepth > 0) return fn();
    call('tx-begin');
    txDepth = 1;
    try {
      const r = fn();
      call('tx-commit');
      return r;
    } catch (e) {
      try { call('tx-rollback'); } catch { /* ignore */ }
      throw e;
    } finally {
      txDepth = 0;
    }
  }

  function tableColumns(table) {
    const sql = dialect === 'mysql'
      ? 'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
      : 'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position';
    return call('query', 'all', sql, [table]).map((r) => String(r.name));
  }

  function ensureColumn(table, column, ddl) {
    if (tableColumns(table).includes(column)) return false;
    call('query', 'run', `ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`, []);
    return true;
  }

  const driver = {
    dialect,
    all: (sql, ...p) => call('query', 'all', sql, p),
    get: (sql, ...p) => call('query', 'get', sql, p),
    run: (sql, ...p) => call('query', 'run', sql, p),
    // 批量插入：一次往返写多行，把远程驱动的往返次数从「每条一次」降到「每批一次」
    runBatch: (sql, rows) => call('bulk', null, sql, [], rows),
    tx,
    prep: () => { throw new Error('MySQL/PostgreSQL 驱动不支持 prep（预编译由驱动内部管理）'); },
    db: null, // 无原始句柄；备份/恢复等 SQLite 专属功能已在路由层拦截
    DB_FILE: null,
    tableColumns, ensureColumn,
    reopenDatabase: () => { throw new Error('整库备份/恢复仅支持 SQLite 数据库'); },
    init() { /* 连接与建表在 worker 启动握手时完成 */ },
  };
  return driver;
};
