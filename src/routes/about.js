'use strict';
/** 「关于」页：SPA 时代只负责把 /about 交给前端路由，数据由 /api/v1/about 提供 */
const express = require('express');
const auth = require('../lib/auth');

const router = express.Router();

router.get('/about', auth.requireLogin, (req, res, next) => {
  // SPA 时代：交给前端路由 /about 渲染（数据由 /api/v1/about 拉取）
  next();
});

module.exports = router;
