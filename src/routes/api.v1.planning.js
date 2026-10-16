'use strict';
/** /api/v1/{budgets,recurring,debts,goals} —— 预算/周期/借贷/目标 */
const express = require('express');
const router = express.Router();
const budgets   = express.Router();
const recurring = express.Router();
const debts     = express.Router();
const goals     = express.Router();

const { all, get, run, nowStr, todayStr } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const txn = require('../lib/txn');
const u = require('../lib/util');
const sch = require('../lib/scheduler');

function remainingDays(b, range) {
  const today = todayStr();
  if (today < range.start) return 30;
  if (today > range.end) return 1;
  const d1 = new Date(`${today}T00:00:00`);
  const d2 = new Date(`${range.end}T00:00:00`);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

/* ===================================================== 预算 ===================================================== */
budgets.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { budgets: [], overall: {}, totalBudget: 0, month: '' });
  const ledgerId = Number(ledger.id);
  const list = all(
    `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.parent_id AS category_parent_id, a.name AS account_name
     FROM budgets b LEFT JOIN categories c ON c.id = b.category_id LEFT JOIN accounts a ON a.id = b.account_id
     WHERE b.ledger_id = ? ORDER BY b.is_active DESC, b.id`, ledgerId
  ).map((b) => {
    const range = sch.budgetPeriodRange(b, new Date());
    const used = sch.budgetUsedInRange(b, range.start, range.end);
    const amount = Number(b.amount_cents);
    const catLabel = b.scope === 'category'
      ? `分类 · ${b.category_name || '未指定'}${b.category_parent_id === null ? '（整个大分类）' : ''}`
      : null;
    return {
      ...b,
      alert_threshold: b.alert_pct || 80,
      used, rangeLabel: range.label,
      ratio: amount > 0 ? (used / amount) * 100 : 0,
      remain: amount - used,
      dailyAllowance: Math.max(0, Math.round((amount - used) / Math.max(1, remainingDays(b, range)))),
      scopeLabel: b.scope === 'overall' ? '总预算' : catLabel || `账户 · ${b.account_name || '未指定'}`,
      periodLabel: { monthly: '每月', yearly: '每年', weekly: '每周', custom: '自定义' }[b.period] || '每月',
    };
  });
  const month = todayStr().slice(0, 7);
  const overall = txn.summary(ledgerId, `${month}-01`, `${month}-31`);
  const totalBudget = list.filter((b) => b.is_active && b.scope === 'overall').reduce((s, b) => s + Number(b.amount_cents), 0);
  api.ok(res, { budgets: list, overall, totalBudget, month });
}));

budgets.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const amount = u.parseAmountToCents(req.body.amount);
  if (!amount) return api.badRequest(res, '请填写预算金额');
  const name = String(req.body.name || (req.body.scope === 'overall' ? '总预算' : req.body.scope === 'category' ? '分类预算' : '账户预算')).slice(0, 60) || '预算'
  const info = run(
    `INSERT INTO budgets (ledger_id, name, scope, category_id, account_id, amount_cents, currency, period, trigger_type, rollover, alert_pct, is_active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, name,
    ['overall', 'category', 'account'].includes(req.body.scope) ? req.body.scope : 'overall',
    req.body.category_id ? Number(req.body.category_id) : null,
    req.body.account_id  ? Number(req.body.account_id)  : null,
    amount,
    req.body.currency || 'CNY',
    ['monthly', 'yearly', 'weekly', 'custom'].includes(req.body.period) ? req.body.period : 'monthly',
    req.body.trigger_type === 'income' ? 'income' : 'expense',
    req.body.rollover ? 1 : 0,
    Math.min(100, Math.max(50, Number(req.body.alert_threshold) || 80)),
    req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0),
    nowStr()
  );
  auth.audit(req, 'budget.create', { entity: 'budget', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

budgets.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const b = get('SELECT * FROM budgets WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!b) return api.notFound(res, '预算不存在');
  run(
    `UPDATE budgets SET name=?, scope=?, category_id=?, account_id=?, amount_cents=?, currency=?, period=?, trigger_type=?, rollover=?, alert_pct=?, is_active=?
     WHERE id = ?`,
    req.body.name ? String(req.body.name).slice(0, 60) : b.name,
    ['overall', 'category', 'account'].includes(req.body.scope) ? req.body.scope : b.scope,
    req.body.category_id !== undefined ? (req.body.category_id ? Number(req.body.category_id) : null) : b.category_id,
    req.body.account_id  !== undefined ? (req.body.account_id  ? Number(req.body.account_id)  : null) : b.account_id,
    req.body.amount !== undefined ? u.parseAmountToCents(req.body.amount) : b.amount_cents,
    req.body.currency || b.currency,
    ['monthly', 'yearly', 'weekly', 'custom'].includes(req.body.period) ? req.body.period : b.period,
    req.body.trigger_type === 'income' ? 'income' : (b.trigger_type || 'expense'),
    req.body.rollover === undefined ? b.rollover : (req.body.rollover ? 1 : 0),
    req.body.alert_threshold !== undefined
      ? Math.min(100, Math.max(50, Number(req.body.alert_threshold) || 80))
      : (b.alert_pct || 80),
    req.body.is_active === undefined ? b.is_active : (req.body.is_active ? 1 : 0),
    id
  );
  api.saved(res, '预算已更新');
}));

budgets.post('/:id(\\d+)/toggle', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const b = get('SELECT is_active FROM budgets WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!b) return api.notFound(res, '预算不存在');
  run('UPDATE budgets SET is_active = ? WHERE id = ?', b.is_active ? 0 : 1, id);
  api.ok(res, { is_active: !b.is_active });
}));

budgets.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('DELETE FROM budgets WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '预算已删除');
}));

/* ===================================================== 周期账单 ===================================================== */
/** recurring_rules 实际 schema:
 *  id, ledger_id, name, payload (JSON 数组，每项是 { type, amount_cents, currency, account_id, to_account_id, category_id, note, merchant, tags }),
 *  frequency ('monthly'/'weekly'/'yearly'/'daily'), interval_n,
 *  day_of_month, weekday, next_run_at, last_run_at,
 *  auto_post (0/1), is_active (0/1), created_at
 *
 *  payload.items[] 即一笔笔要入的子交易。
 *  为简化前端 API：我们把单条规则视为"一笔周期"，
 *  payload.items 数组只有 1 项，包含 type/amount/category/account/note/merchant/tags。
 */
const VALID_FREQS = ['monthly', 'weekly', 'yearly', 'daily']

function parseRecurringRule(row) {
  let items = []
  try { items = JSON.parse(row.payload || '[]') } catch { items = [] }
  const it = items[0] || {}
  return {
    id: row.id,
    name: row.name,
    type: it.type || 'expense',
    amount_cents: Number(it.amount_cents || 0),
    currency: it.currency || 'CNY',
    account_id: it.account_id || null,
    to_account_id: it.to_account_id || null,
    category_id: it.category_id || null,
    merchant: it.merchant || null,
    note: it.note || null,
    tags: it.tags || null,
    frequency: row.frequency,
    interval_n: row.interval_n,
    day_of_month: row.day_of_month,
    weekday: row.weekday,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    auto_post: !!row.auto_post,
    is_active: !!row.is_active,
    created_at: row.created_at,
  }
}

function buildPayload(it) {
  // 过滤掉 null/undefined
  const cleaned = {}
  for (const [k, v] of Object.entries(it)) {
    if (v !== null && v !== undefined && v !== '') cleaned[k] = v
  }
  return JSON.stringify([cleaned])
}

recurring.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [] });
  const ledgerId = Number(ledger.id);
  const rows = all(`SELECT * FROM recurring_rules WHERE ledger_id = ? ORDER BY is_active DESC, id`, ledgerId);
  // 补全 category_name/icon、account_name
  const result = rows.map((r) => {
    const parsed = parseRecurringRule(r)
    if (parsed.category_id) {
      const c = get('SELECT name, icon, color FROM categories WHERE id = ?', parsed.category_id)
      if (c) Object.assign(parsed, { category_name: c.name, category_icon: c.icon, category_color: c.color })
    }
    if (parsed.account_id) {
      const a = get('SELECT name, icon FROM accounts WHERE id = ?', parsed.account_id)
      if (a) Object.assign(parsed, { account_name: a.name, account_icon: a.icon })
    }
    return parsed
  })
  api.ok(res, { items: result });
}));

recurring.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const amount = u.parseAmountToCents(req.body.amount);
  if (!amount) return api.badRequest(res, '请填写金额');
  const frequency = VALID_FREQS.includes(req.body.frequency) ? req.body.frequency : 'monthly'
  const intervalN = Math.max(1, Math.min(60, Number(req.body.interval_n) || 1))
  const dayOfMonth = req.body.day_of_month ? Math.max(1, Math.min(31, Number(req.body.day_of_month))) : null
  const weekday = req.body.weekday != null && req.body.weekday !== '' ? Math.max(0, Math.min(6, Number(req.body.weekday))) : null
  const nextRunAt = req.body.next_run_at || todayStr()

  const item = {
    type: req.body.type || 'expense',
    amount_cents: amount,
    currency: req.body.currency || 'CNY',
    account_id: req.body.account_id ? Number(req.body.account_id) : null,
    to_account_id: req.body.to_account_id ? Number(req.body.to_account_id) : null,
    category_id: req.body.category_id ? Number(req.body.category_id) : null,
    merchant: req.body.merchant || null,
    note: req.body.note || null,
    tags: req.body.tags || null,
  }
  const info = run(
    `INSERT INTO recurring_rules (ledger_id, name, payload, frequency, interval_n, day_of_month, weekday, next_run_at, auto_post, is_active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, String(req.body.name || '').slice(0, 60) || '周期账单', buildPayload(item),
    frequency, intervalN, dayOfMonth, weekday, nextRunAt,
    req.body.auto_post ? 1 : 0, 1, nowStr()
  );
  auth.audit(req, 'recurring.create', { entity: 'recurring', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

recurring.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const r = get('SELECT * FROM recurring_rules WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!r) return api.notFound(res, '规则不存在');
  let items = []
  try { items = JSON.parse(r.payload || '[]') } catch { items = [] }
  const it = items[0] || {}
  if (req.body.amount !== undefined) it.amount_cents = u.parseAmountToCents(req.body.amount)
  if (req.body.type) it.type = req.body.type
  if (req.body.currency) it.currency = req.body.currency
  if (req.body.account_id !== undefined) it.account_id = req.body.account_id ? Number(req.body.account_id) : null
  if (req.body.to_account_id !== undefined) it.to_account_id = req.body.to_account_id ? Number(req.body.to_account_id) : null
  if (req.body.category_id !== undefined) it.category_id = req.body.category_id ? Number(req.body.category_id) : null
  if (req.body.merchant !== undefined) it.merchant = req.body.merchant || null
  if (req.body.note !== undefined) it.note = req.body.note || null
  if (req.body.tags !== undefined) it.tags = req.body.tags || null

  const frequency = VALID_FREQS.includes(req.body.frequency) ? req.body.frequency : r.frequency
  const intervalN = req.body.interval_n !== undefined ? Math.max(1, Math.min(60, Number(req.body.interval_n))) : r.interval_n
  const dayOfMonth = req.body.day_of_month !== undefined ? (req.body.day_of_month ? Math.max(1, Math.min(31, Number(req.body.day_of_month))) : null) : r.day_of_month
  const weekday = req.body.weekday !== undefined ? (req.body.weekday != null && req.body.weekday !== '' ? Math.max(0, Math.min(6, Number(req.body.weekday))) : null) : r.weekday
  const nextRunAt = req.body.next_run_at || r.next_run_at

  run(
    `UPDATE recurring_rules SET name=?, payload=?, frequency=?, interval_n=?, day_of_month=?, weekday=?, next_run_at=?, auto_post=?, is_active=? WHERE id=?`,
    String(req.body.name || r.name).slice(0, 60), buildPayload(it),
    frequency, intervalN, dayOfMonth, weekday, nextRunAt,
    req.body.auto_post === undefined ? r.auto_post : (req.body.auto_post ? 1 : 0),
    req.body.is_active === undefined ? r.is_active : (req.body.is_active ? 1 : 0),
    id
  )
  api.saved(res, '已更新');
}));

recurring.post('/:id(\\d+)/toggle', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const r = get('SELECT is_active FROM recurring_rules WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!r) return api.notFound(res, '规则不存在');
  run('UPDATE recurring_rules SET is_active = ? WHERE id = ?', r.is_active ? 0 : 1, id);
  api.ok(res, { is_active: !r.is_active });
}));

recurring.post('/:id(\\d+)/run', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const r = get('SELECT * FROM recurring_rules WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!r) return api.notFound(res, '规则不存在');
  // 手动补登：插入一笔交易 + 推进 next_run_at
  const items = (() => { try { return JSON.parse(r.payload || '[]') } catch { return [] } })()
  const it = items[0] || {}
  if (!it.amount_cents) return api.badRequest(res, '规则金额为 0')
  const postDate = String(req.body.post_date || todayStr())
  const txnId = txn.createTransaction(ledgerId, req.session.userId, {
    type: it.type || 'expense',
    amount_cents: Math.abs(Number(it.amount_cents)),
    currency: it.currency || 'CNY',
    account_id: it.account_id || null,
    to_account_id: it.to_account_id || null,
    category_id: it.category_id || null,
    txn_date: postDate,
    note: it.note || r.name,
    merchant: it.merchant || null,
    source: 'recurring',
  })
  if (txnId) {
    require('../db').recalcBalances(ledgerId)
    // 推进 next_run_at
    const adv = sch.advanceDate(r.next_run_at, r)
    run('UPDATE recurring_rules SET last_run_at = ?, next_run_at = ? WHERE id = ?', postDate, adv, r.id)
  }
  if (!txnId) return api.ok(res, { id: null, message: '没有需要补登的' });
  api.created(res, { id: txnId });
}));

recurring.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('DELETE FROM recurring_rules WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '规则已删除');
}));

/* ===================================================== 借贷台账 ===================================================== */
/** debts 实际 schema: id, ledger_id, direction, counterparty, principal_cents, balance_cents,
 *  currency, account_id, due_date, status (open/closed), note, created_at
 *  不存在: interest_rate, start_date, is_settled
 *  status 替代 is_settled (open=未结, closed=已结)
 */
debts.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [] });
  const ledgerId = Number(ledger.id);
  const items = all(
    `SELECT d.*, a.name AS account_name, a.icon AS account_icon
     FROM debts d LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.ledger_id = ? ORDER BY d.status ASC, d.due_date ASC, d.id DESC`, ledgerId)
    .map((d) => ({ ...d, is_settled: d.status === 'closed' }));
  api.ok(res, { items });
}));

debts.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const direction = ['lend', 'borrow'].includes(req.body.direction) ? req.body.direction : 'lend';
  const principal = u.parseAmountToCents(req.body.principal);
  if (!principal) return api.badRequest(res, '请填写本金');
  const info = run(
    `INSERT INTO debts (ledger_id, direction, counterparty, principal_cents, balance_cents, currency, account_id, due_date, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, direction, String(req.body.counterparty || '').slice(0, 30) || '匿名',
    principal, principal, req.body.currency || 'CNY',
    req.body.account_id ? Number(req.body.account_id) : null,
    req.body.due_date || null,
    'open', req.body.note || '', nowStr()
  );
  auth.audit(req, 'debt.create', { entity: 'debt', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

debts.post('/:id(\\d+)/settle', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const d = get('SELECT * FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!d) return api.notFound(res, '台账不存在');
  if (d.status === 'closed') return api.badRequest(res, '已结算');
  const settleAccount = req.body.account_id ? Number(req.body.account_id) : Number(d.account_id);
  if (!settleAccount) return api.badRequest(res, '请指定结算账户');
  // 借出 → 收回借款（repay_receive 收入）；借入 → 偿还借款（repay_pay 支出）
  const type = d.direction === 'lend' ? 'repay_receive' : 'repay_pay';
  const tId = txn.createTransaction(ledgerId, req.session.userId, {
    type,
    amount_cents: d.principal_cents,
    account_id: settleAccount,
    to_account_id: type === 'repay_pay' ? d.counter_account_id : null,
    txn_date: req.body.settle_date || todayStr(),
    note: `结算：${d.counterparty}${req.body.note ? ' · ' + req.body.note : ''}`,
    source: 'manual',
  });
  run('UPDATE debts SET status = ?, balance_cents = 0 WHERE id = ?', 'closed', id);
  auth.audit(req, 'debt.settle', { entity: 'debt', entityId: id, ledgerId });
  api.ok(res, { txn_id: tId });
}));

debts.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('DELETE FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '已删除');
}));

/* ===================================================== 储蓄目标 ===================================================== */
/** goals 实际 schema: id, ledger_id, name, icon, target_cents, saved_cents, account_id, target_date, status, note, created_at
 *  status: 'active' | 'archived' | 'achieved'
 */
goals.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [] });
  const ledgerId = Number(ledger.id);
  const items = all(
    `SELECT g.*, a.name AS account_name, a.icon AS account_icon
     FROM goals g LEFT JOIN accounts a ON a.id = g.account_id
     WHERE g.ledger_id = ? ORDER BY g.status ASC, g.id DESC`, ledgerId);
  api.ok(res, { items });
}));

goals.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const target = u.parseAmountToCents(req.body.target_amount);
  if (!target) return api.badRequest(res, '请填写目标金额');
  const status = ['active', 'archived', 'achieved'].includes(req.body.status) ? req.body.status : 'active';
  const info = run(
    `INSERT INTO goals (ledger_id, name, icon, target_cents, saved_cents, account_id, target_date, status, note, created_at)
     VALUES (?,?,?,?,0,?,?,?,?,?)`,
    ledgerId, String(req.body.name || '').slice(0, 30) || '储蓄目标', req.body.icon || '🎯',
    target,
    req.body.account_id ? Number(req.body.account_id) : null,
    req.body.target_date || null,
    status, req.body.note || '', nowStr()
  );
  auth.audit(req, 'goal.create', { entity: 'goal', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

goals.post('/:id(\\d+)/deposit', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const amount = u.parseAmountToCents(req.body.amount);
  if (!amount) return api.badRequest(res, '请填写金额');
  const g = get('SELECT * FROM goals WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!g) return api.notFound(res, '目标不存在');
  const accountId = req.body.account_id ? Number(req.body.account_id) : g.account_id;
  const tId = txn.createTransaction(ledgerId, req.session.userId, {
    type: 'expense',
    amount_cents: amount,
    account_id: accountId,
    category_id: req.body.category_id ? Number(req.body.category_id) : null,
    txn_date: req.body.deposit_date || todayStr(),
    note: `储蓄目标「${g.name}」存入${req.body.note ? ' · ' + req.body.note : ''}`,
    source: 'manual',
  });
  run('UPDATE goals SET saved_cents = saved_cents + ? WHERE id = ?', amount, id);
  // 达成检测
  const newSaved = Number(g.saved_cents || 0) + amount
  if (newSaved >= Number(g.target_cents)) {
    run(`UPDATE goals SET status = 'achieved' WHERE id = ? AND status = 'active'`, id)
  }
  auth.audit(req, 'goal.deposit', { entity: 'goal', entityId: id, ledgerId, detail: String(amount) });
  api.ok(res, { txn_id: tId });
}));

goals.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  run('DELETE FROM goals WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '已删除');
}));

module.exports = router;
module.exports.budgets   = budgets;
module.exports.recurring = recurring;
module.exports.debts     = debts;
module.exports.goals     = goals;
