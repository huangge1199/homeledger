'use strict';
/**
 * /api/v1/about —— 「关于」页数据
 *
 * 老版 src/routes/about.js 把 APP/FEATURES/CHANGELOG/TECH/issuesUrl 直接渲染进 EJS，
 * 迁移到 SPA 后这些静态数据需要一个 JSON 出口，本文件负责补上。
 *
 * 口径对齐老版：
 *   - stats 与老版一致（记录笔数 / 账本数 / 陪伴天数 / 数据体积），**不做 isAdmin 门控**
 *     —— 老版 about 路由只要求登录，任何成员都能看到这些统计。
 *   - envInfo 同样对所有登录用户可见。
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { get, DATA_DIR, DB_FILE } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const about = require('../lib/about');

const router = express.Router();

const VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
).version;

function safeSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) total += dirSize(p);
      else { try { total += fs.statSync(p).size; } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  return total;
}

/** 字节数 → 人类可读（对齐老版 about.js 的 fmtSize） */
function fmtSize(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

// 注意：本文件在 apiV1.js 中以 router.use('/about', ...) 挂载，
// 前缀已被剥掉，这里必须挂 '/'，否则实际路径会变成 /api/v1/about/about 而 404。
router.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const isAdmin = !!(res.locals.user && res.locals.user.is_admin);
  const dbSize = safeSize(DB_FILE);
  const uploadsSize = dirSize(path.join(DATA_DIR, 'uploads'));
  const stats = {
    txns: Number(get('SELECT COUNT(*) AS c FROM transactions WHERE deleted_at IS NULL')?.c || 0),
    ledgers: Number(get('SELECT COUNT(*) AS c FROM ledgers')?.c || 0),
    attachments: Number(get('SELECT COUNT(*) AS c FROM attachments')?.c || 0),
    dataSize: dbSize + uploadsSize,
    dbSize,
    uploadsSize,
  };
  // 运行天数：从第一笔记账（或首个账本创建）算起（created_at 为本地时间）
  const first = get(
    `SELECT MIN(created_at) AS t FROM (
       SELECT created_at FROM transactions UNION ALL
       SELECT created_at FROM ledgers
     )`
  );
  let days = 1;
  if (first && first.t) {
    const ms = Date.now() - new Date(String(first.t).replace(' ', 'T')).getTime();
    if (Number.isFinite(ms) && ms > 0) days = Math.max(1, Math.floor(ms / 86400000) + 1);
  }

  api.ok(res, {
    version: VERSION,
    app: about.APP,
    upstream: about.UPSTREAM,
    features: about.FEATURES,
    changelog: about.CHANGELOG,
    tech: about.TECH,
    issuesUrl: about.issuesUrl(),
    stats: { ...stats, days, sizeLabel: fmtSize(stats.dataSize) },
    // 用户数属于全局管理信息，仅管理员可见（老版 about 页无此项，新版沿用 admin.stats 口径）
    users: isAdmin ? Number(get('SELECT COUNT(*) AS c FROM users')?.c || 0) : null,
    envInfo: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      mem: Math.round(process.memoryUsage().rss / 1024 / 1024),
      dataDir: DATA_DIR,
      uptime: Math.round(process.uptime()),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}));

module.exports = router;
