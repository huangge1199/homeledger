'use strict';
/** 首页仪表盘 / 记账日历 / 搜索 / 通知中心（v2 SPA：仅保留接口语义与 SPA fallback） */
const express = require('express');
const { run } = require('../db');
const auth = require('../lib/auth');

const router = express.Router();

/* -------------------------------- 首页仪表盘 ------------------------------- */

router.get('/', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 / 渲染（数据由 /api/v1/dashboard 拉取）
  next();
});

/* --------------------------------- 记账日历 -------------------------------- */

router.get('/calendar', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 /calendar 渲染（数据由 /api/v1/calendar 拉取）
  next();
});

/* ---------------------------------- 搜索 --------------------------------- */

router.get('/search', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 /search 渲染（数据由 /api/v1/transactions 拉取）
  next();
});

/* --------------------------------- 通知中心 -------------------------------- */

router.get('/notifications', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 /notifications 渲染（数据由 /api/v1/notifications 拉取）
  next();
});

router.post('/notifications/read-all', auth.requireLogin, (req, res) => {
  run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.session.userId);
  res.redirect('/notifications');
});

router.post('/notifications/:id/read', auth.requireLogin, (req, res) => {
  run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', Number(req.params.id), req.session.userId);
  // SPA 时代：不再查 link 后 302，直接回列表（前端通过 GET /api/v1/notifications/:id 读 link 自行跳转）
  res.redirect('/notifications');
});

module.exports = router;
