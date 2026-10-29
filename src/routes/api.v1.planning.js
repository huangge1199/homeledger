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
 *  不存在: interest_rate, start_date, is_settled, counter_account_id
 *  status 替代 is_settled (open=未结, closed=已结)
 *
 *  direction 口径统一：手工台账写 lend/borrow，而 lib/txn.js 的 syncDebts 自动汇总写
 *  receivable/payable。两套并存会导致前端把自动汇总记录误判成反方向，这里统一归一化成
 *  lend/borrow 再对外返回。
 */
const DEBT_DIR_ALIAS = { receivable: 'lend', payable: 'borrow', lend: 'lend', borrow: 'borrow' };
function normDebtDir(v) { return DEBT_DIR_ALIAS[v] || 'lend'; }
const AUTO_DEBT_NOTE = '系统自动汇总';

debts.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [] });
  const ledgerId = Number(ledger.id);
  // 未结清的排在前面，其余按到期日升序（无到期日排最后），对齐老版 COALESCE(due_date,'9999')
  const items = all(
    `SELECT d.*, a.name AS account_name, a.icon AS account_icon
     FROM debts d LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.ledger_id = ?
     ORDER BY CASE WHEN d.status = 'open' THEN 0 ELSE 1 END ASC,
              COALESCE(d.due_date, '9999-12-31') ASC, d.id DESC
     LIMIT 300`, ledgerId)
    .map((d) => ({
      ...d,
      direction: normDebtDir(d.direction),
      raw_direction: d.direction,
      is_settled: d.status === 'closed',
      is_auto: d.note === AUTO_DEBT_NOTE,
    }));
  api.ok(res, { items });
}));

debts.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const direction = normDebtDir(req.body.direction);
  const principal = u.parseAmountToCents(req.body.principal);
  const counterparty = String(req.body.counterparty || '').trim().slice(0, 40);
  if (!counterparty) return api.badRequest(res, '请填写对方');
  if (!principal) return api.badRequest(res, '请填写本金');

  // 对齐老版：勾选「同时生成账户流水」时只建交易，台账由 syncDebts 自动汇总
  // （若同时插 debts 表，会与自动汇总重复出一条同对手方记录）
  if (req.body.create_txn) {
    const accountId = req.body.account_id ? Number(req.body.account_id) : null;
    if (!accountId) return api.badRequest(res, '生成账户流水需要指定资金账户');
    let tId;
    try {
      tId = txn.createTransaction(ledgerId, req.session.userId, {
        type: direction === 'lend' ? 'lend' : 'borrow',
        amount_cents: principal,
        account_id: accountId,
        txn_date: req.body.date || todayStr(),
        merchant: counterparty,
        note: req.body.note || (direction === 'lend' ? '借出' : '借入'),
        source: 'manual',
      });
    } catch (e) {
      return api.badRequest(res, e.message || '生成流水失败');
    }
    auth.audit(req, 'debt.create', { entity: 'debt', entityId: tId, ledgerId, detail: counterparty });
    return api.created(res, { txn_id: tId, synced_to_debts: true });
  }

  const info = run(
    `INSERT INTO debts (ledger_id, direction, counterparty, principal_cents, balance_cents, currency, account_id, due_date, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, direction, counterparty,
    principal, principal, req.body.currency || 'CNY',
    req.body.account_id ? Number(req.body.account_id) : null,
    req.body.due_date || null,
    'open', req.body.note || '', nowStr()
  );
  auth.audit(req, 'debt.create', { entity: 'debt', entityId: info.lastInsertRowid, ledgerId });
  api.created(res, { id: info.lastInsertRowid });
}));

/** 编辑手工台账：只允许改对方/本金/账户/到期日/备注，不允许改方向。
 *  改本金时余额同步重置为本金（已还部分无法保留，需重新结算）。
 *  自动汇总的台账（note = 系统自动汇总）由 syncDebts 托管，不允许编辑。 */
debts.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const d = get('SELECT * FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!d) return api.notFound(res, '台账不存在');
  if (d.note === AUTO_DEBT_NOTE) return api.badRequest(res, '自动汇总的台账不支持编辑');
  const counterparty = String(req.body.counterparty || '').trim().slice(0, 40);
  if (!counterparty) return api.badRequest(res, '请填写对方');
  const accountId = req.body.account_id ? Number(req.body.account_id) : null;
  const dueDate = req.body.due_date || null;
  const note = String(req.body.note || '').slice(0, 200) || null;
  const principal = u.parseAmountToCents(req.body.principal);
  if (principal && principal !== Number(d.principal_cents)) {
    run(`UPDATE debts SET counterparty = ?, principal_cents = ?, balance_cents = ?, account_id = ?, due_date = ?, note = ?, status = ? WHERE id = ?`,
      counterparty, principal, principal, accountId, dueDate, note, 'open', id);
  } else {
    run(`UPDATE debts SET counterparty = ?, account_id = ?, due_date = ?, note = ? WHERE id = ?`,
      counterparty, accountId, dueDate, note, id);
  }
  auth.audit(req, 'debt.update', { entity: 'debt', entityId: id, ledgerId });
  api.ok(res, { id });
}));

/** 收/还款核销：支持部分核销（对齐老版 amount 可编辑、余额递减、未还完保持 open） */
debts.post('/:id(\\d+)/settle', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const d = get('SELECT * FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!d) return api.notFound(res, '台账不存在');
  if (d.status === 'closed') return api.badRequest(res, '已结算');
  const settleAccount = req.body.account_id ? Number(req.body.account_id) : Number(d.account_id);
  if (!settleAccount) return api.badRequest(res, '请指定结算账户');
  const balance = Number(d.balance_cents) || Number(d.principal_cents) || 0;
  const amount = Math.min(u.parseAmountToCents(req.body.amount) || balance, balance);
  if (!amount || amount <= 0) return api.badRequest(res, '金额无效');
  // 借出 → 收回借款（repay_receive 收入）；借入 → 偿还借款（repay_pay 支出）
  const direction = normDebtDir(d.direction);
  const type = direction === 'lend' ? 'repay_receive' : 'repay_pay';
  const tId = txn.createTransaction(ledgerId, req.session.userId, {
    type,
    amount_cents: amount,
    account_id: settleAccount,
    txn_date: req.body.settle_date || todayStr(),
    merchant: d.counterparty,
    note: `结算：${d.counterparty}${req.body.note ? ' · ' + req.body.note : ''}`,
    source: 'manual',
  });
  const newBalance = Math.max(0, balance - amount);
  run('UPDATE debts SET balance_cents = ?, status = ? WHERE id = ?',
    newBalance, newBalance <= 0 ? 'closed' : 'open', id);
  auth.audit(req, 'debt.settle', { entity: 'debt', entityId: id, ledgerId, detail: String(amount) });
  api.ok(res, { txn_id: tId, amount, balance: newBalance });
}));

debts.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const d = get('SELECT * FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!d) return api.notFound(res, '台账不存在');
  // 自动汇总的台账由 syncDebts 每笔交易后重建，手删会被立刻重建，直接拒绝
  if (d.note === AUTO_DEBT_NOTE) return api.badRequest(res, '自动汇总的台账不支持删除');
  run('DELETE FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  api.deleted(res, '已删除');
}));

/* ===================================================== 储蓄目标 ===================================================== */
/** goals 实际 schema: id, ledger_id, name, icon, target_cents, saved_cents, account_id, target_date, status, note, created_at
 *  status: 'active' | 'done' | 'archived'（兼容历史 achieved，读取/编辑时按已达成处理）
 */
goals.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [] });
  const ledgerId = Number(ledger.id);
  const items = all(
    `SELECT g.*, a.name AS account_name, a.icon AS account_icon
     FROM goals g LEFT JOIN accounts a ON a.id = g.account_id
     WHERE g.ledger_id = ? ORDER BY CASE WHEN g.status = 'active' THEN 0 ELSE 1 END, g.id ASC`, ledgerId);
  api.ok(res, { items });
}));

goals.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const target = u.parseAmountToCents(req.body.target_amount);
  if (!target) return api.badRequest(res, '请填写目标金额');
  const saved = Math.max(0, u.parseAmountToCents(req.body.saved_amount));
  const status = ['active', 'done', 'achieved', 'archived'].includes(req.body.status) ? req.body.status : 'active';
  const finalStatus = saved >= target && status === 'active' ? 'done' : status;
  const info = run(
    `INSERT INTO goals (ledger_id, name, icon, target_cents, saved_cents, account_id, target_date, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, String(req.body.name || '').slice(0, 30) || '储蓄目标', req.body.icon || '🎯',
    target,
    saved,
    req.body.account_id ? Number(req.body.account_id) : null,
    req.body.target_date || null,
    finalStatus, req.body.note || '', nowStr()
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
  // 达成检测：状态统一写 'done'（与老版页面/历史数据一致），并在首次达成时通知账本所有可写成员
  const newSaved = Number(g.saved_cents || 0) + amount
  if (newSaved >= Number(g.target_cents)) {
    run(`UPDATE goals SET status = 'done' WHERE id = ? AND status = 'active'`, id)
    if (g.status === 'active') {
      for (const uid of auth.ledgerWriterIds(ledgerId)) {
        auth.notify(uid, { kind: 'success', ledgerId, title: `🎉 储蓄目标达成：${g.name}`, link: '/goals' });
      }
    }
  }
  auth.audit(req, 'goal.deposit', { entity: 'goal', entityId: id, ledgerId, detail: String(amount) });
  api.ok(res, { txn_id: tId });
}));

/** 编辑目标：直接改字段，不做「新建 + 迁移 + 删除」（老版没有编辑，新版补齐时避免副作用） */
goals.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const g = get('SELECT * FROM goals WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!g) return api.notFound(res, '目标不存在');
  const target = req.body.target_amount !== undefined && req.body.target_amount !== ''
    ? u.parseAmountToCents(req.body.target_amount)
    : Number(g.target_cents);
  if (!target) return api.badRequest(res, '请填写目标金额');
  const status = ['active', 'done', 'achieved', 'archived'].includes(req.body.status) ? req.body.status : g.status;
  run(
    `UPDATE goals SET name = ?, icon = ?, target_cents = ?, account_id = ?, target_date = ?, status = ?, note = ?
     WHERE id = ? AND ledger_id = ?`,
    String(req.body.name || '').trim().slice(0, 30) || g.name,
    req.body.icon || g.icon,
    target,
    req.body.account_id ? Number(req.body.account_id) : null,
    req.body.target_date || null,
    status,
    String(req.body.note || '').slice(0, 200),
    id, ledgerId
  );
  auth.audit(req, 'goal.update', { entity: 'goal', entityId: id, ledgerId });
  api.ok(res, { id });
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
