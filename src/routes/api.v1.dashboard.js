'use strict';
/** /api/v1/{dashboard,calendar,search,notifications} —— 仪表盘/日历/搜索/通知 */
const express = require('express');
const router = express.Router();
const { all, get, run, todayStr } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const txn = require('../lib/txn');
const u = require('../lib/util');
const att = require('../lib/attachments');
const { budgetPeriodRange, budgetUsedInRange } = require('../lib/scheduler');

function monthOfToday() { return todayStr().slice(0, 7); }

router.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { hasLedger: false });
  const ledgerId = Number(ledger.id);
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : monthOfToday();
  const range = { start: `${month}-01`, end: `${month}-31` };
  const cur = txn.summary(ledgerId, range.start, range.end);
  const prevMonth = u.addMonths(month, -1);
  const prev = txn.summary(ledgerId, `${prevMonth}-01`, `${prevMonth}-31`);
  const daily = txn.dailyBreakdown(ledgerId, range.start, range.end);
  const trend = txn.monthlyTrend(ledgerId, 6);
  const cats = txn.categoryBreakdown(ledgerId, range.start, range.end, 'expense').slice(0, 8);
  const incomeCats = txn.categoryBreakdown(ledgerId, range.start, range.end, 'income').slice(0, 6);
  const overview = txn.accountOverview(ledgerId);
  const budgets = all(
    `SELECT b.*, c.name AS category_name, c.icon AS category_icon, a.name AS account_name FROM budgets b
     LEFT JOIN categories c ON c.id = b.category_id LEFT JOIN accounts a ON a.id = b.account_id
     WHERE b.ledger_id = ? AND b.is_active = 1 ORDER BY b.id LIMIT 4`, ledgerId
  ).map((b) => {
    const r = budgetPeriodRange(b, new Date());
    const used = budgetUsedInRange(b, r.start, r.end);
    return { ...b, used, ratio: b.amount_cents > 0 ? (used / Number(b.amount_cents)) * 100 : 0, rangeLabel: r.label };
  });
  const recent = txn.listTransactions(ledgerId, { pageSize: 8, page: 1 }).rows;
  att.attachCounts(recent);
  const todayList = txn.listTransactions(ledgerId, { from: todayStr(), to: todayStr(), pageSize: 100 }).rows;
  const debts = all(
    "SELECT direction, COUNT(*) AS cnt, COALESCE(SUM(balance_cents),0) AS total FROM debts WHERE ledger_id = ? AND status = 'open' GROUP BY direction", ledgerId);
  const goals = all("SELECT * FROM goals WHERE ledger_id = ? AND status = 'active' ORDER BY id LIMIT 3", ledgerId);
  const upcoming = all('SELECT * FROM recurring_rules WHERE ledger_id = ? AND is_active = 1 ORDER BY next_run_at LIMIT 4', ledgerId);
  const pendingReimburse = get(
    'SELECT COUNT(*) AS c, COALESCE(SUM(amount_base_cents),0) AS s FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL AND is_reimbursable = 1 AND reimbursed_at IS NULL', ledgerId);
  const subsOverview = require('../lib/subscriptions').overview(ledgerId);

  api.ok(res, {
    hasLedger: true,
    month, monthLabel: u.monthLabel(month), daysInMonth: u.daysInMonth(month),
    cur, prev, prevMonth, daily, trend,
    cats, incomeCats, overview, budgets, recent, todayList,
    debts, goals, upcoming,
    pendingReimburse: { count: Number(pendingReimburse?.c || 0), sum: Number(pendingReimburse?.s || 0) },
    subs: subsOverview,
    aiReady: require('../lib/ai').isAiUsable(),
  });
}));

router.get('/calendar', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { cells: [], days: [], monthSummary: {} });
  const ledgerId = Number(ledger.id);
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : monthOfToday();
  const days = txn.dailyBreakdown(ledgerId, `${month}-01`, `${month}-31`);
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const cells = [];
  const first = u.firstWeekday(month);
  const total = u.daysInMonth(month);
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const date = `${month}-${u.pad(d)}`;
    const info = dayMap.get(date) || { expense: 0, income: 0, count: 0, date };
    cells.push({ ...info, day: d, date });
  }
  const monthSummary = txn.summary(ledgerId, `${month}-01`, `${month}-31`);
  const maxExpense = Math.max(...days.map((d) => d.expense), 1);
  const selected = req.query.date || todayStr();
  const selectedRows = txn.listTransactions(ledgerId, { from: selected, to: selected, pageSize: 100 }).rows;
  api.ok(res, { month, monthLabel: u.monthLabel(month), cells, days, monthSummary, maxExpense, selected, selectedRows, weekdays: u.WEEKDAYS });
}));

router.get('/search', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [], total: 0, sum: {} });
  const ledgerId = Number(ledger.id);
  const f = {
    keyword: String(req.query.q || '').trim(),
    type: req.query.type || '',
    categoryId: req.query.category_id ? Number(req.query.category_id) : null,
    accountId: req.query.account_id ? Number(req.query.account_id) : null,
    memberId: req.query.member_id ? Number(req.query.member_id) : null,
    tagId: req.query.tag_id ? Number(req.query.tag_id) : null,
    source: req.query.source || '',
    from: req.query.from || '',
    to: req.query.to || '',
    minCents: req.query.min ? u.parseAmountToCents(req.query.min) : null,
    maxCents: req.query.max ? u.parseAmountToCents(req.query.max) : null,
    sort: req.query.sort || 'date_desc',
    page: Number(req.query.page) || 1,
    pageSize: 30,
  };
  // 「有无筛选条件」只看业务筛选项，不看 page/pageSize/sort 等分页排序参数。
  // 老版用 Object.values(f).some(v => v !== 1 && v !== 30 ...) 判断，会把
  // memberId === 1（第一个成员）误判成「没有条件」，导致按成员筛选永远返回空。
  const hasQuery = [
    f.keyword, f.type, f.categoryId, f.accountId, f.memberId,
    f.tagId, f.source, f.from, f.to, f.minCents, f.maxCents,
  ].some((v) => v !== '' && v !== null && v !== undefined && v !== 0);
  const result = hasQuery || f.keyword
    ? txn.listTransactions(ledgerId, f)
    : { rows: [], total: 0, page: 1, pages: 1, sum: { income: 0, expense: 0 } };
  api.ok(res, { f, result, hasQuery, groups: txn.groupByDate(result.rows) });
}));

router.get('/notifications', auth.requireLogin, api.asyncHandler((req, res) => {
  const rows = all(
    `SELECT n.*, l.name AS ledger_name FROM notifications n LEFT JOIN ledgers l ON l.id = n.ledger_id
     WHERE n.user_id = ? ORDER BY n.is_read, n.id DESC LIMIT 200`, req.session.userId);
  api.ok(res, { items: rows, unreadCount: rows.filter((n) => !n.is_read).length });
}));

router.post('/notifications/read-all', auth.requireLogin, api.asyncHandler((req, res) => {
  run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.session.userId);
  api.ok(res, { updated: true });
}));

router.post('/notifications/:id(\\d+)/read', auth.requireLogin, api.asyncHandler((req, res) => {
  const n = get('SELECT link FROM notifications WHERE id = ? AND user_id = ?', Number(req.params.id), req.session.userId);
  if (!n) return api.notFound(res, '通知不存在');
  run('UPDATE notifications SET is_read = 1 WHERE id = ?', Number(req.params.id));
  api.ok(res, { link: n.link });
}));

module.exports = router;
