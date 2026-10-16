'use strict';
/** 「关于」页：产品介绍 / 功能亮点 / 版本日志 / 隐私声明 / 功能需求反馈 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { get, DATA_DIR, DB_FILE } = require('../db');
const auth = require('../lib/auth');
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

router.get('/about', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 /about 渲染（数据由 /api/v1/about 拉取）
  next();
});

module.exports = router;
