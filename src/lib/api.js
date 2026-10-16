'use strict';
/**
 * /api/v1/* 统一响应工具
 * 约定：
 *   - 成功：{ ok: true,  data: ... }
 *   - 失败：{ ok: false, error: '人类可读', code?: 'INVALID', details?: ... }
 *   - 分页：{ ok: true, data: { items, total, page, pageSize } }
 *   - 列表/字典：直接 data 里给业务字段
 *   - 写操作：data 可空；附带 message 表示成功提示
 */

function ok(res, data = null, status = 200) {
  if (data && typeof data === 'object' && !Array.isArray(data) && Object.prototype.hasOwnProperty.call(data, 'ok')) {
    return res.status(status).json(data); // 已是约定格式
  }
  return res.status(status).json({ ok: true, data });
}

function created(res, data = null) {
  return ok(res, data, 201);
}

function noContent(res) {
  return res.status(204).end();
}

function fail(res, status, error, opts = {}) {
  const body = { ok: false, error };
  if (opts.code) body.code = opts.code;
  if (opts.details !== undefined) body.details = opts.details;
  if (opts.fields) body.fields = opts.fields;
  return res.status(status).json(body);
}

function badRequest(res, error, details) {
  return fail(res, 400, error || '请求参数有误', { code: 'BAD_REQUEST', details });
}

function unauthorized(res, error = '未登录') {
  return fail(res, 401, error, { code: 'UNAUTHORIZED', redirect: '/login' });
}

function forbidden(res, error = '无权限') {
  return fail(res, 403, error, { code: 'FORBIDDEN' });
}

function notFound(res, error = '资源不存在') {
  return fail(res, 404, error, { code: 'NOT_FOUND' });
}

function conflict(res, error = '资源冲突', details) {
  return fail(res, 409, error, { code: 'CONFLICT', details });
}

function serverError(res, err) {
  // 生产环境不要把堆栈暴露到前端；只在 console 打
  console.error('[api]', err);
  return fail(res, 500, '服务器内部错误', { code: 'INTERNAL' });
}

/** 写操作成功（带 message） */
function saved(res, message = '已保存', data = null) {
  return res.status(200).json({ ok: true, data, message });
}

function deleted(res, message = '已删除') {
  return res.status(200).json({ ok: true, data: null, message });
}

/** 当前请求是否要求 JSON 响应（避免误把 HTML 给到 API 客户端） */
function wantsJson(req) {
  if (req.xhr) return true;
  const accept = String(req.headers.accept || '');
  if (accept.includes('application/json')) return true;
  // 路径以 /api/ 开头默认就当 JSON
  if ((req.path || '').startsWith('/api/')) return true;
  return false;
}

/**
 * asyncHandler(fn) —— 自动捕获异步错误转给 next(err)
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  ok,
  created,
  noContent,
  fail,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  saved,
  deleted,
  wantsJson,
  asyncHandler,
};
