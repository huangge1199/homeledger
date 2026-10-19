'use strict';
/** /api/v1/transactions —— 交易 CRUD + 列表 + 批量 */
const express = require('express');
const router = express.Router();

const { all, get, run, nowStr, todayStr, TXN_TYPE_MAP } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const txn = require('../lib/txn');
const u = require('../lib/util');
const att = require('../lib/attachments');

/** 列表查询参数（与原 SSR 一致） */
function readListFilter(query) {
  return {
    type:          query.type || '',
    kind:          query.kind || '',
    categoryId:    query.category_id ? Number(query.category_id) : null,
    accountId:     query.account_id  ? Number(query.account_id)  : null,
    memberId:      query.member_id   ? Number(query.member_id)   : null,
    tagId:         query.tag_id      ? Number(query.tag_id)      : null,
    source:        query.source || '',
    month:         query.month || '',
    from:          query.from || '',
    to:            query.to || '',
    keyword:       query.q || '',
    // URL 写 1 / true / yes 都映射到 yes；'' / undefined 为空
    reimbursable:  ['1', 'true', 'yes'].includes(String(query.reimbursable)) ? 'yes' : (query.reimbursable || ''),
    sort:          query.sort || 'date_desc',
    page:          Math.max(1, Number(query.page) || 1),
    pageSize:      Math.min(200, Math.max(10, Number(query.pageSize) || 40)),
  };
}

/** 表单解析（与原 SSR 同源） */
function readForm(body) {
  const splits = [];
  const names = [].concat(body.split_name || []);
  const amounts = [].concat(body.split_amount || []);
  names.forEach((n, i) => {
    const amt = u.parseAmountToCents(amounts[i]);
    if (n && amt) splits.push({ member_name: String(n).slice(0, 30), share_cents: amt });
  });
  return {
    type:           TXN_TYPE_MAP[body.type] ? body.type : 'expense',
    amount_cents:   u.parseAmountToCents(body.amount),
    currency:       body.currency || 'CNY',
    rate:           body.rate ? Number(body.rate) : 1,
    account_id:     body.account_id || null,
    to_account_id:  body.to_account_id || null,
    category_id:    body.category_id || null,
    txn_date:       body.txn_date || todayStr(),
    txn_time:       body.txn_time ?? '',
    note:           body.note || '',
    merchant:       body.merchant || '',
    status:         body.status || 'cleared',
    is_reimbursable: body.is_reimbursable ? 1 : 0,
    tags:           body.tags || '',
    splits,
    group_id:       body.group_id || null,
    source:         body.source || 'manual',
  };
}

/* ----------------------------- 列表 ----------------------------- */
router.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [], total: 0, page: 1, pageSize: 40, totalPages: 0, sum: { income: 0, expense: 0 } });
  const f = readListFilter(req.query);
  const result = txn.listTransactions(Number(ledger.id), f);
  api.ok(res, {
    items: result.rows,
    total: result.total,
    page: f.page,
    pageSize: f.pageSize,
    totalPages: result.pages,
    sum: result.sum,
    groups: txn.groupByDate(result.rows),
  });
}));

/* ----------------------------- 单笔 ----------------------------- */
router.get('/:id(\\d+)', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const t = txn.getTransaction(Number(req.params.id), ledgerId);
  if (!t) return api.notFound(res, '记录不存在');
  api.ok(res, { txn: t, attachments: att.listByTxn(t.id), splits: txn.splitsOf(t.id) });
}));

/* ----------------------------- 新建 ----------------------------- */
router.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const data = readForm(req.body);
  try {
    const id = txn.createTransaction(ledgerId, req.session.userId, data);
    auth.audit(req, 'txn.create', { entity: 'transaction', entityId: id, ledgerId, detail: `${data.type} ${(data.amount_cents / 100).toFixed(2)}` });
    api.created(res, { id, redirect: '/transactions' });
  } catch (e) {
    api.badRequest(res, e.message);
  }
}));

/* ----------------------------- 更新 ----------------------------- */
router.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const data = readForm(req.body);
  try {
    txn.updateTransaction(id, ledgerId, req.session.userId, data);
    auth.audit(req, 'txn.update', { entity: 'transaction', entityId: id, ledgerId });
    api.saved(res, '已保存', { id });
  } catch (e) {
    api.badRequest(res, e.message);
  }
}));
router.patch('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  // PATCH 支持部分更新：note / tags / is_reimbursable / status 等单字段
  const sets = [];
  const args = [];
  if (req.body.note !== undefined)              { sets.push('note = ?');            args.push(String(req.body.note)); }
  if (req.body.merchant !== undefined)          { sets.push('merchant = ?');        args.push(String(req.body.merchant)); }
  if (req.body.status !== undefined)            { sets.push('status = ?');          args.push(String(req.body.status)); }
  if (req.body.is_reimbursable !== undefined)   { sets.push('is_reimbursable = ?'); args.push(req.body.is_reimbursable ? 1 : 0); }
  if (req.body.category_id !== undefined)       { sets.push('category_id = ?');     args.push(req.body.category_id || null); }
  if (req.body.account_id !== undefined)        { sets.push('account_id = ?');      args.push(req.body.account_id || null); }
  if (!sets.length) return api.badRequest(res, '没有可更新的字段');
  sets.push('updated_at = ?'); args.push(nowStr());
  args.push(id, ledgerId);
  const r = run(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND ledger_id = ? AND deleted_at IS NULL`, ...args);
  if (!r.changes) return api.notFound(res, '记录不存在');
  auth.audit(req, 'txn.patch', { entity: 'transaction', entityId: id, ledgerId });
  api.saved(res, '已更新');
}));

/* ----------------------------- 删除 ----------------------------- */
router.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const ok = txn.softDelete(id, ledgerId);
  if (!ok) return api.notFound(res, '记录不存在');
  auth.audit(req, 'txn.delete', { entity: 'transaction', entityId: id, ledgerId });
  api.deleted(res, '已删除');
}));

/* ----------------------------- 批量 ----------------------------- */
router.post('/bulk', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
  const action = String(req.body.action || '');
  if (!ids.length) return api.badRequest(res, '请先勾选记录');
  const placeholders = ids.map(() => '?').join(',');

  switch (action) {
    case 'delete': {
      const n = txn.bulkDelete(ids, ledgerId);
      return api.ok(res, { affected: n });
    }
    case 'category': {
      const cid = req.body.category_id ? Number(req.body.category_id) : null;
      const c = cid ? get('SELECT id FROM categories WHERE id = ? AND (ledger_id IS NULL OR ledger_id = ?)', cid, ledgerId) : null;
      if (!c) return api.badRequest(res, '请选择要改成的分类');
      run(`UPDATE transactions SET category_id = ?, updated_at = ? WHERE ledger_id = ? AND id IN (${placeholders})`, cid, nowStr(), ledgerId, ...ids);
      return api.ok(res, { affected: ids.length });
    }
    case 'tag': {
      const tag = String(req.body.tag || '').trim();
      if (!tag) return api.badRequest(res, '请输入标签名');
      for (const id of ids) txn.applyTags(id, ledgerId, tag, false);
      return api.ok(res, { affected: ids.length });
    }
    case 'reimburse': {
      try {
        const reimburseAcc = req.body.account_id
          ? Number(req.body.account_id)
          : Number(get('SELECT id FROM accounts WHERE ledger_id = ? AND is_archived = 0 ORDER BY sort_order, id LIMIT 1', ledgerId)?.id) || null;
        const r = txn.markReimbursed(ids, ledgerId, req.session.userId, reimburseAcc);
        return api.ok(res, r);
      } catch (e) {
        return api.badRequest(res, e.message);
      }
    }
    case 'reimbursable': {
      run(`UPDATE transactions SET is_reimbursable = 1, updated_at = ? WHERE ledger_id = ? AND id IN (${placeholders})`, nowStr(), ledgerId, ...ids);
      return api.ok(res, { affected: ids.length });
    }
    case 'restore': {
      run(`UPDATE transactions SET deleted_at = NULL WHERE ledger_id = ? AND id IN (${placeholders})`, ledgerId, ...ids);
      require('../db').recalcBalances(ledgerId);
      txn.syncDebts(ledgerId);
      return api.ok(res, { affected: ids.length });
    }
    default:
      return api.badRequest(res, '未知操作');
  }
}));

/* ----------------------------- 表单选项 ----------------------------- */
router.get('/-form-data', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  // 复用 formdata 库
  const fd = require('../lib/formdata');
  api.ok(res, fd.txFormData(ledgerId, req.session.userId));
}));

module.exports = router;
