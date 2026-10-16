'use strict';
/**
 * 家账簿 HomeLedger —— 服务端入口
 * v2.0+：纯后端 JSON API + 静态资源托管。
 * 前端为 Vue 3 SPA（web/dist），由 SPA fallback 接住所有 GET 路径。
 * 不再使用 EJS 模板渲染（已退役）。
 */
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const db = require('./src/db');
const auth = require('./src/lib/auth');
const scheduler = require('./src/lib/scheduler');
const util = require('./src/lib/util');

const PORT = Number(process.env.PORT || 5111);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

/* ---------------------------------- 初始化 --------------------------------- */

db.init();
bootstrapAdmin();

/** 首次启动且库中无任何用户时，按环境变量自动创建管理员 */
function bootstrapAdmin() {
  const c = db.get('SELECT COUNT(*) AS c FROM users');
  if (Number(c?.c || 0) > 0) return;
  const username = (process.env.ADMIN_USER || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'admin888';
  const info = db.run(
    'INSERT INTO users (username, password_hash, display_name, avatar_color, is_admin, created_at) VALUES (?,?,?,?,1,?)',
    username, auth.hashPassword(password), username, util.colorFor(username), db.nowStr()
  );
  db.createDefaultLedger(info.lastInsertRowid, username);
  db.setSetting('site.initialized', 'true');
  console.log('');
  console.log('  ✅ 已为你创建初始管理员账号');
  console.log(`     用户名：${username}`);
  console.log(`     密  码：${password}`);
  console.log('     ⚠️  请登录后立即在「设置 → 账号安全」中修改密码');
  console.log('');
}

/* ---------------------------------- 应用 ---------------------------------- */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
// SPA 时代：不再配置 EJS view engine（视图文件已退役）
app.use(express.urlencoded({ extended: false, limit: '30mb' }));
app.use(express.json({ limit: '30mb' }));
app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '7d' }));
// SVG 可内嵌脚本：上传侧已禁止，历史遗留的 .svg 附件也一律不再回显
app.use('/uploads', (req, res, next) => {
  if (/\.svg$/i.test(req.path || '')) return res.status(403).end('Forbidden');
  next();
});
app.use('/uploads', express.static(path.join(db.DATA_DIR, 'uploads'), { maxAge: '30d' }));

/* ---------- v2 前端构建产物（web/dist） ----------
 * 阶段 0：仅提供静态文件 + SPA fallback。
 * 业务 SSR 路由仍可用（仅做向后兼容）；阶段 1 起逐步退役 EJS 视图。 */
const WEB_DIST = path.join(ROOT, 'web', 'dist');
const fs = require('node:fs');
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { maxAge: '7d', index: false }));
  // SPA fallback 留到所有路由之后挂载（在下面"404 兜底"之前），避免抢 API 请求
  console.log('  🧩 已挂载前端构建产物：' + WEB_DIST);
} else {
  console.log('  ⚠️  未检测到 web/dist/，请先 `cd web && npm run build`');
}

app.use(
  session({
    name: 'hl.sid',
    store: new auth.SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || 'homeledger-dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: String(process.env.COOKIE_SECURE || 'false') === 'true',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

/* --------------------------------- 全局上下文 -------------------------------- */

app.use((req, res, next) => {
  // 一次性提示消息
  if (req.session?.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  } else {
    res.locals.flash = null;
  }
  auth.context(req, res, next);
});

app.use((req, res, next) => {
  // SPA 时代：不再注入 res.locals（视图已退役）
  next();
});

/** 开放 API（小龙虾等外部工具）：Bearer 令牌鉴权，不走会话与 CSRF，需在 csrfProtect 之前挂载 */
app.use('/api/open', require('./src/routes/openapi'));

/** v1 JSON API（阶段 1：自研 SPA 前端专用；保留 /api/open 兼容外部工具）
 *  注意：/api/v1 故意挂在 csrfProtect 之前，让 SPA 通过 Bearer 风格的鉴权+CSRF 豁免来对接。
 *  当前 v1 仍走 cookie session；CSRF 保护由客户端 axios 从 cookie/header 注入（meta csrf）。 */
app.use('/api/v1', require('./src/routes/apiV1'));

app.use(auth.csrfProtect);

/** 通用：注入提示消息 */
app.use((req, res, next) => {
  res.flash = (type, message) => {
    if (req.session) req.session.flash = { type, message };
  };
  next();
});

/** 首次运行且无用户 → 强制进入初始化 */
app.use((req, res, next) => {
  const hasUser = Number(db.get('SELECT COUNT(*) AS c FROM users')?.c || 0) > 0;
  res.locals.needsSetup = !hasUser;
  if (!hasUser && !['/setup', '/healthz'].includes(req.path) && !req.path.startsWith('/static')) {
    return res.redirect('/setup');
  }
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true, app: 'homeledger', time: db.nowStr() }));

/* ---------------------------------- 路由 ---------------------------------- */

app.use('/', require('./src/routes/auth'));
app.use('/', require('./src/routes/dashboard'));
app.use('/transactions', require('./src/routes/transactions'));
app.use('/', require('./src/routes/accounts'));
app.use('/', require('./src/routes/planning'));
app.use('/', require('./src/routes/subscriptions'));
app.use('/', require('./src/routes/ai'));
app.use('/', require('./src/routes/reports'));
app.use('/', require('./src/routes/admin'));
app.use('/', require('./src/routes/about'));

/* --------------------------------- 错误处理 -------------------------------- */

/** SPA fallback：未被任何路由匹配的 GET 路径返回 index.html（让前端路由接管）
 *  必须在所有 API 路由之后挂载，否则会抢 /api/v1/* 的响应。 */
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if ((req.path || '').startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: `API 端点不存在：${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
  }
  if (!fs.existsSync(WEB_DIST)) return res.status(503).send('前端未构建，请先 `cd web && npm run build`');
  res.sendFile(path.join(WEB_DIST, 'index.html'), (err) => { if (err) next(); });
});

/** 全局错误处理：统一返 JSON，避免模板引擎错误。 */
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  const status = Number(err.status || err.statusCode) >= 400 ? Number(err.status || err.statusCode) : 500;
  const message = err?.message || '服务器内部错误';
  res.status(status).json({ ok: false, error: message, code: 'INTERNAL' });
});

/* ---------------------------------- 启动 ---------------------------------- */

const server = app.listen(PORT, HOST, () => {
  const name = db.getSetting('site.name', '家账簿');
  console.log('');
  console.log(`  📒 ${name} 已启动`);
  console.log(`     本机访问：http://localhost:${PORT}`);
  console.log(`     局域网/ NAS 访问：http://<设备IP>:${PORT}`);
  console.log(`     数据目录：${db.DATA_DIR}`);
  console.log('');
});

scheduler.initScheduler();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n正在关闭服务…');
    server.close(() => {
      try { db.db.close(); } catch { /* ignore */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref?.();
  });
}

module.exports = app;
