'use strict';
/**
 * /api/v1/* 主入口 —— 把 11 个业务模块的 JSON 端点统一挂在 /api/v1
 * 各模块 router 在原文件基础上新增 apiV1 子路由（保持原 SSR 路由不动）
 */
const express = require('express');
const router = express.Router();

const auth = require('../lib/auth');
const api = require('../lib/api');

// 简易健康检查
router.get('/ping', (req, res) => api.ok(res, { app: 'homeledger', version: require('../../package.json').version, time: new Date().toISOString() }));

// 在 v1 路由内启用 CSRF 校验（与 /api/open 的 Bearer 风格解耦）
// 注意：必须在所有 mutation 之前挂载；GET/HEAD/OPTIONS 在 csrfProtect 内部放行
router.use(auth.csrfProtect);

// 当前会话信息（无登录返 200 ok=false，方便前端判别场景）
router.get('/session', (req, res) => {
  const u = res.locals.user || null;
  // 账本行补 camelCase 别名：前端 store 的 Ledger 接口声明 isArchived，
  // 而 res.locals.ledgers 是数据库原始行（is_archived），漏补会导致
  // 「归档账本只读」判定失效（canWrite / canManage 恒为真）
  const mapLedger = (l) => (l ? { ...l, isArchived: !!l.is_archived } : l);
  api.ok(res, {
    // 前端 store 按 camelCase 消费（见 web/src/stores/session.ts），此处补齐别名
    user: u ? { ...u, displayName: u.display_name || u.username, isAdmin: !!u.is_admin } : null,
    ledger: mapLedger(res.locals.ledger),
    ledgers: (res.locals.ledgers || []).map(mapLedger),
    csrf: auth.csrfToken(req),
    aiUsable: !!res.locals.aiUsable,
    needsSetup: !!res.locals.needsSetup,
    siteName: res.locals.siteName,
    baseCurrency: res.locals.baseCurrency,
    unreadCount: Number(res.locals.unreadCount || 0),
  });
});

// 业务子模块
const accMod = require('./api.v1.accounts');
router.use('/transactions',  require('./api.v1.transactions'));
router.use('/accounts',      accMod.accounts);
router.use('/categories',    accMod.categories);
router.use('/tags',          accMod.tags);

const planMod = require('./api.v1.planning');
router.use('/budgets',       planMod.budgets);
router.use('/recurring',     planMod.recurring);
router.use('/debts',         planMod.debts);
router.use('/goals',         planMod.goals);

router.use('/subscriptions', require('./api.v1.subscriptions'));
router.use('/dashboard',     require('./api.v1.dashboard'));
router.use('/reports',       require('./api.v1.reports'));
router.use('/admin',         require('./api.v1.admin'));
router.use('/ai',            require('./api.v1.ai'));

// 404 兜底
router.use((req, res) => api.notFound(res, `API 端点不存在：${req.method} ${req.originalUrl}`));

module.exports = router;
