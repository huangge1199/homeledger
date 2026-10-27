'use strict';
/** /api/v1/{accounts,categories,tags} —— 账户 / 分类 / 标签管理 */
const express = require('express');
const router = express.Router();
const accounts = express.Router();
const categories = express.Router();
const tags = express.Router();

const { all, get, run, nowStr, todayStr, ACCOUNT_TYPE_MAP } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const txn = require('../lib/txn');
const attach = require('../lib/attachments');
const u = require('../lib/util');

/* ===================================================== 账户 ===================================================== */
accounts.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { accounts: [], archived: [], groups: {}, overview: { net: 0, assets: 0, liabilities: 0 }, budgetsByAccount: [] });
  const ledgerId = Number(ledger.id);
  const overview = txn.accountOverview(ledgerId);
  const fd = require('../lib/formdata');
  const archived = fd.archivedAccounts(ledgerId);
  const flows = all(
    `SELECT account_id,
            COALESCE(SUM(CASE WHEN type IN ('expense','lend','repay_pay','fee') THEN amount_base_cents ELSE 0 END),0) AS out,
            COALESCE(SUM(CASE WHEN type IN ('income','borrow','repay_receive','reimburse','refund','interest') THEN amount_base_cents ELSE 0 END),0) AS inflow
     FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL AND txn_date >= date(?, '-30 day')
     GROUP BY account_id`, ledgerId, todayStr());
  const flowMap = new Map(flows.map((f) => [Number(f.account_id), f]));
  const list = overview.accounts.map((a) => ({
    ...a,
    flow: flowMap.get(Number(a.id)) || { out: 0, inflow: 0 },
    typeLabel: ACCOUNT_TYPE_MAP[a.type]?.label || a.type,
    isLiability: ['credit', 'loan', 'payable'].includes(a.type),
  }));
  const groups = {};
  for (const a of list) (groups[a.type] = groups[a.type] || []).push(a);
  // 已停用账户同样补上类型信息与近 30 天流水，前端渲染归档区时口径与在用账户一致
  const archivedList = archived.map((a) => ({
    ...a,
    flow: flowMap.get(Number(a.id)) || { out: 0, inflow: 0 },
    typeLabel: ACCOUNT_TYPE_MAP[a.type]?.label || a.type,
    isLiability: ['credit', 'loan', 'payable'].includes(a.type),
  }));
  const budgetsByAccount = all("SELECT * FROM budgets WHERE ledger_id = ? AND scope = 'account' AND is_active = 1", ledgerId);
  api.ok(res, { accounts: list, archived: archivedList, groups, overview, budgetsByAccount });
}));

accounts.get('/:id(\\d+)', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const acc = get('SELECT * FROM accounts WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!acc) return api.notFound(res, '账户不存在');
  const f = {
    accountId: Number(acc.id),
    from: req.query.from || '',
    to:   req.query.to || '',
    page: Number(req.query.page) || 1,
    pageSize: 40,
    sort: 'date_desc',
  };
  const result = txn.listTransactions(ledgerId, f);
  // 补「关联了几张账单截图」，前端列表据此显示 📎 标记（与交易列表接口一致）
  attach.attachCounts(result.rows);
  api.ok(res, { account: acc, f, items: result.rows, total: result.total, totalPages: result.pages, groups: txn.groupByDate(result.rows) });
}));

accounts.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  if (!name) return api.badRequest(res, '请填写账户名称');
  const type = ACCOUNT_TYPE_MAP[req.body.type] ? req.body.type : 'cash';
  const initial = u.parseAmountToCents(req.body.initial_balance);
  const info = run(
    `INSERT INTO accounts (ledger_id, name, type, icon, currency, initial_cents, balance_cents, credit_limit,
      bill_day, due_day, institution, card_no, note, include_in_net, sort_order, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, name.slice(0, 30), type, req.body.icon || ACCOUNT_TYPE_MAP[type].icon, req.body.currency || 'CNY',
    initial, initial,
    req.body.credit_limit ? u.parseAmountToCents(req.body.credit_limit) : null,
    req.body.bill_day ? Number(req.body.bill_day) : null,
    req.body.due_day ? Number(req.body.due_day) : null,
    req.body.institution ? String(req.body.institution).slice(0, 40) : null,
    req.body.card_no ? String(req.body.card_no).slice(-4) : null,
    req.body.note ? String(req.body.note).slice(0, 200) : null,
    req.body.include_in_net === undefined ? 1 : (req.body.include_in_net ? 1 : 0),
    Number(req.body.sort_order) || 50, nowStr()
  );
  auth.audit(req, 'account.create', { entity: 'account', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

accounts.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const acc = get('SELECT * FROM accounts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!acc) return api.notFound(res, '账户不存在');
  const initial = req.body.initial_balance !== undefined ? u.parseAmountToCents(req.body.initial_balance) : Number(acc.initial_cents);
  run(
    `UPDATE accounts SET name=?, type=?, icon=?, currency=?, initial_cents=?, credit_limit=?, bill_day=?, due_day=?,
      institution=?, note=?, include_in_net=?, sort_order=? WHERE id=?`,
    String(req.body.name || acc.name).slice(0, 30),
    ACCOUNT_TYPE_MAP[req.body.type] ? req.body.type : acc.type,
    req.body.icon || acc.icon,
    req.body.currency || acc.currency,
    initial,
    req.body.credit_limit ? u.parseAmountToCents(req.body.credit_limit) : null,
    req.body.bill_day ? Number(req.body.bill_day) : null,
    req.body.due_day ? Number(req.body.due_day) : null,
    req.body.institution ? String(req.body.institution).slice(0, 40) : null,
    req.body.note ? String(req.body.note).slice(0, 200) : null,
    req.body.include_in_net ? 1 : 0,
    Number(req.body.sort_order) || acc.sort_order,
    id
  );
  require('../db').recalcBalances(ledgerId);
  auth.audit(req, 'account.update', { entity: 'account', entityId: id, ledgerId });
  api.saved(res, '账户已更新');
}));

accounts.post('/:id(\\d+)/archive', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const acc = get('SELECT * FROM accounts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!acc) return api.notFound(res, '账户不存在');
  run('UPDATE accounts SET is_archived = ? WHERE id = ?', acc.is_archived ? 0 : 1, id);
  api.ok(res, { archived: !acc.is_archived });
}));

accounts.post('/:id(\\d+)/adjust', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const acc = get('SELECT * FROM accounts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!acc) return api.notFound(res, '账户不存在');
  const actual = u.parseAmountToCents(req.body.actual_balance);
  const delta = actual - Number(acc.balance_cents);
  if (delta === 0) return api.ok(res, { delta: 0 }, 200);
  const adjId = txn.createTransaction(ledgerId, req.session.userId, {
    type: 'adjust',
    amount_cents: delta,
    account_id: id,
    txn_date: req.body.adjust_date || todayStr(),
    note: `余额调整：${u.fmtAmount(acc.balance_cents)} → ${u.fmtAmount(actual)}${req.body.note ? ' · ' + req.body.note : ''}`,
    source: 'manual',
  });
  auth.audit(req, 'account.adjust', { entity: 'account', entityId: id, ledgerId, detail: String(delta) });
  api.created(res, { id: adjId, delta });
}));

accounts.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const used = Number(get('SELECT COUNT(*) AS c FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL AND (account_id = ? OR to_account_id = ?)', ledgerId, id, id)?.c || 0);
  if (used > 0) return api.conflict(res, `该账户下有 ${used} 笔记录，无法删除。可改为「停用」。`);
  run('DELETE FROM accounts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  auth.audit(req, 'account.delete', { entity: 'account', entityId: id, ledgerId });
  api.deleted(res, '账户已删除');
}));

/* ===================================================== 分类 ===================================================== */
categories.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const fd = require('../lib/formdata');
  const expenseTree = fd.categoryTree(ledgerId, 'expense');
  const incomeTree  = fd.categoryTree(ledgerId, 'income');
  const stats = all(
    `SELECT category_id, COUNT(*) AS cnt, COALESCE(SUM(amount_base_cents),0) AS total
     FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL AND txn_date >= date('now','-365 day')
     GROUP BY category_id`, ledgerId);
  const statMap = new Map(stats.map((s) => [Number(s.category_id), s]));
  const decorate = (node) => ({ ...node, stat: statMap.get(Number(node.id)) || { cnt: 0, total: 0 }, children: (node.children || []).map(decorate) });
  api.ok(res, {
    expense: expenseTree.map(decorate),
    income:  incomeTree.map(decorate),
    flat: all('SELECT * FROM categories WHERE ledger_id IS NULL OR ledger_id = ? ORDER BY kind, sort_order, id', ledgerId),
  });
}));

categories.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  if (!name) return api.badRequest(res, '请填写分类名称');
  const kind = req.body.kind === 'income' ? 'income' : 'expense';
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  const color = u.safeColor(req.body.color || (parentId ? (get('SELECT color FROM categories WHERE id = ?', parentId) || {}).color : null), '#8c8c8c');
  const info = run(
    'INSERT INTO categories (ledger_id, name, kind, parent_id, icon, color, is_system, sort_order) VALUES (?,?,?,?,?,?,0,?)',
    ledgerId, name.slice(0, 20), kind, parentId, req.body.icon || '🏷️', color, 999
  );
  auth.audit(req, 'category.create', { entity: 'category', entityId: info.lastInsertRowid, ledgerId, detail: name });
  api.created(res, { id: info.lastInsertRowid });
}));

categories.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const c = get('SELECT * FROM categories WHERE id = ?', id);
  if (!c || c.is_system || c.ledger_id === null || Number(c.ledger_id) !== ledgerId) {
    return api.forbidden(res, '系统内置分类不可修改（可新建自己的分类）');
  }
  run('UPDATE categories SET name=?, icon=?, color=? WHERE id = ?',
    String(req.body.name || c.name).slice(0, 20), req.body.icon || c.icon, u.safeColor(req.body.color || c.color, c.color), id);
  api.saved(res, '分类已更新');
}));

categories.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const c = get('SELECT * FROM categories WHERE id = ?', id);
  if (!c || Number(c.ledger_id) !== ledgerId) return api.forbidden(res, '系统内置分类不可删除');
  const used = Number(get('SELECT COUNT(*) AS c FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL AND category_id = ?', ledgerId, id)?.c || 0);
  if (used > 0) {
    run('UPDATE categories SET is_archived = 1 WHERE id = ?', id);
    return api.ok(res, { archived: true, message: '该分类下已有记录，已改为「归档」不再出现在选择列表' });
  }
  run('DELETE FROM categories WHERE id = ?', id);
  run('DELETE FROM categories WHERE parent_id = ?', id);
  api.deleted(res, '分类已删除');
}));

/* ===================================================== 标签 ===================================================== */
tags.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const list = all(
    `SELECT t.*, (SELECT COUNT(*) FROM transaction_tags tt WHERE tt.tag_id = t.id) AS cnt,
       (SELECT COALESCE(SUM(x.amount_base_cents),0) FROM transaction_tags tt JOIN transactions x ON x.id = tt.transaction_id
         WHERE tt.tag_id = t.id AND x.deleted_at IS NULL) AS total
     FROM tags t WHERE t.ledger_id = ? ORDER BY cnt DESC, t.id`, ledgerId);
  api.ok(res, { tags: list });
}));

tags.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  if (!name) return api.badRequest(res, '请填写标签名');
  if (get('SELECT id FROM tags WHERE ledger_id = ? AND name = ?', ledgerId, name)) return api.conflict(res, '标签已存在');
  const info = run('INSERT INTO tags (ledger_id, name, color) VALUES (?,?,?)', ledgerId, name.slice(0, 20), u.safeColor(req.body.color, u.colorFor(name)));
  api.created(res, { id: info.lastInsertRowid });
}));

tags.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('UPDATE tags SET name = ?, color = ? WHERE id = ? AND ledger_id = ?',
    String(req.body.name || '').slice(0, 20), u.safeColor(req.body.color, '#4f7cff'), id, ledgerId);
  api.saved(res, '标签已更新');
}));

tags.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('DELETE FROM transaction_tags WHERE tag_id = ?', id);
  run('DELETE FROM tags WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '标签已删除');
}));

// 三个子路由分别通过 apiV1.js 挂到对应路径，这里只导出供主入口使用
module.exports = router;
module.exports.accounts   = accounts;
module.exports.categories = categories;
module.exports.tags       = tags;
