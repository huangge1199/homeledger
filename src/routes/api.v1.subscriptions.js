'use strict';
/** /api/v1/subscriptions —— 订阅扣费 */
const express = require('express');
const router = express.Router();
const { get, run, nowStr, todayStr } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const subs = require('../lib/subscriptions');
const u = require('../lib/util');

const PRESETS = [
  { name: 'Netflix', icon: '🎬', cycle: 'monthly' },
  { name: 'Spotify', icon: '🎵', cycle: 'monthly' },
  { name: 'YouTube Premium', icon: '▶️', cycle: 'monthly' },
  { name: 'iCloud+', icon: '☁️', cycle: 'monthly' },
  { name: '百度网盘', icon: '🗂️', cycle: 'yearly' },
  { name: '爱奇艺', icon: '📺', cycle: 'monthly' },
  { name: '腾讯视频', icon: '📺', cycle: 'monthly' },
  { name: 'ChatGPT Plus', icon: '🤖', cycle: 'monthly' },
  { name: 'Adobe 全家桶', icon: '🎨', cycle: 'yearly' },
  { name: 'Notion', icon: '📝', cycle: 'monthly' },
  { name: '1Password', icon: '🔐', cycle: 'yearly' },
  { name: '域名 / 服务器', icon: '🌐', cycle: 'yearly' },
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function readForm(body, userId) {
  const name = String(body.name || '').trim();
  const amount = u.parseAmountToCents(body.amount);
  const cycle = subs.cycleOf(body.cycle);
  const cycleN = Math.max(1, Math.min(12, Number(body.cycle_n) || 1));
  const anchorMonth = body.anchor_month ? Math.max(1, Math.min(12, Number(body.anchor_month))) : null;
  const trialEnds = DAY_RE.test(String(body.trial_ends_on || '')) ? body.trial_ends_on : null;
  const status = ['trial', 'active', 'paused'].includes(body.status) ? body.status : 'active';
  let next;
  if (cycle === 'none') {
    next = '9999-12-31';
  } else if (cycle === 'fixed') {
    next = DAY_RE.test(String(body.next_charge_at || '')) ? body.next_charge_at : todayStr();
  } else {
    next = DAY_RE.test(String(body.next_charge_at || '')) ? body.next_charge_at : (trialEnds || todayStr());
    let guard = 0;
    while (next < todayStr() && guard++ < 500) next = subs.advance(next, { cycle, cycle_n: cycleN });
  }
  const anchorDay = Math.max(1, Math.min(31, Number(next.slice(8, 10)) || 1));
  return {
    name: name.slice(0, 40),
    icon: String(body.icon || '🧾').slice(0, 8) || '🧾',
    plan: body.plan ? String(body.plan).slice(0, 40) : null,
    vendor_url: u.safeExternalUrl(body.vendor_url),
    amount_cents: Math.abs(amount),
    currency: body.currency || 'CNY',
    cycle, cycle_n: cycleN,
    anchor_month: anchorMonth, anchor_day: anchorDay,
    account_id: body.account_id ? Number(body.account_id) : null,
    category_id: body.category_id ? Number(body.category_id) : null,
    auto_renew: body.auto_renew ? 1 : 0,
    trial_ends_on: trialEnds,
    next_charge_at: next,
    reminder_days: Math.max(0, Math.min(60, Number(body.reminder_days ?? 3) || 0)),
    status,
    note: body.note ? String(body.note).slice(0, 200) : null,
    created_by_user_id: userId,
  };
}

router.get('/', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { items: [], overview: {}, presets: PRESETS });
  const ledgerId = Number(ledger.id);
  const sums = subs.overview(ledgerId);
  // 列表直接 JOIN 出账户名 / 分类名（含分类图标），与老版列表页展示口径一致
  const items = require('../db').all(
    `SELECT s.*, a.name AS account_name, c.name AS category_name, c.icon AS category_icon
     FROM subscriptions s
     LEFT JOIN accounts a ON a.id = s.account_id
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.ledger_id = ?
     ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
              s.next_charge_at, s.id`,
    ledgerId
  ).map((row) => subs.decorate(row, { charge_count: Number(row.charge_count) || 0 }));
  api.ok(res, { items, overview: sums, presets: PRESETS });
}));

router.get('/:id(\\d+)', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const row = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!row) return api.notFound(res, '订阅不存在');
  api.ok(res, { sub: subs.decorate(row), history: subs.chargesOf(ledgerId, row.id) });
}));

router.post('/', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const d = readForm(req.body, req.session.userId);
  if (!d.name) return api.badRequest(res, '请填写订阅名称');
  if (!d.amount_cents) return api.badRequest(res, '请填写每期扣费金额');
  const info = run(
    `INSERT INTO subscriptions (ledger_id, name, icon, plan, vendor_url, amount_cents, currency, cycle, cycle_n,
      anchor_month, anchor_day, account_id, category_id, auto_renew, trial_ends_on, next_charge_at,
      reminder_days, status, note, created_by_user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, d.name, d.icon, d.plan, d.vendor_url, d.amount_cents, d.currency, d.cycle, d.cycle_n,
    d.anchor_month, d.anchor_day, d.account_id, d.category_id, d.auto_renew, d.trial_ends_on, d.next_charge_at,
    d.reminder_days, d.status, d.note, d.created_by_user_id, nowStr()
  );
  auth.audit(req, 'subscription.create', { entity: 'subscription', entityId: info.lastInsertRowid, ledgerId, detail: d.name });
  api.created(res, { id: info.lastInsertRowid, next_charge_at: d.next_charge_at });
}));

router.put('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const old = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!old) return api.notFound(res, '订阅不存在');
  const d = readForm(req.body, req.session.userId);
  if (!d.name || !d.amount_cents) return api.badRequest(res, '名称与金额不能为空');
  if (old.status === 'canceled') d.status = 'canceled';
  run(
    `UPDATE subscriptions SET name=?, icon=?, plan=?, vendor_url=?, amount_cents=?, currency=?, cycle=?, cycle_n=?,
      anchor_month=?, anchor_day=?, account_id=?, category_id=?, auto_renew=?, trial_ends_on=?, next_charge_at=?,
      reminder_days=?, status=?, note=? WHERE id=? AND ledger_id=?`,
    d.name, d.icon, d.plan, d.vendor_url, d.amount_cents, d.currency, d.cycle, d.cycle_n,
    d.anchor_month, d.anchor_day, d.account_id, d.category_id, d.auto_renew, d.trial_ends_on, d.next_charge_at,
    d.reminder_days, d.status, d.note, id, ledgerId
  );
  auth.audit(req, 'subscription.update', { entity: 'subscription', entityId: id, ledgerId, detail: d.name });
  api.saved(res, '订阅已更新');
}));

router.post('/:id(\\d+)/charge', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const sub = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!sub) return api.notFound(res, '订阅不存在');
  if (sub.status === 'canceled') return api.badRequest(res, '该订阅已取消，请先恢复');
  const txnId = subs.charge(sub, req.session.userId, { date: DAY_RE.test(String(req.body.date || '')) ? req.body.date : todayStr() });
  if (!txnId) return api.badRequest(res, '订阅金额为 0，无法记账');
  auth.audit(req, 'subscription.charge', { entity: 'subscription', entityId: sub.id, ledgerId, detail: String(sub.amount_cents) });
  api.created(res, { txn_id: txnId });
}));

router.post('/:id(\\d+)/skip', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const sub = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!sub) return api.notFound(res, '订阅不存在');
  const next = subs.advance(sub.next_charge_at, sub);
  run('UPDATE subscriptions SET next_charge_at = ? WHERE id = ?', next, sub.id);
  api.ok(res, { next_charge_at: next });
}));

router.post('/:id(\\d+)/toggle', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const sub = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!sub) return api.notFound(res, '订阅不存在');
  const back = sub.status === 'paused' || sub.status === 'canceled';
  run(
    'UPDATE subscriptions SET status = ?, canceled_at = ? WHERE id = ?',
    back ? 'active' : 'paused', back ? null : sub.canceled_at, sub.id
  );
  auth.audit(req, 'subscription.toggle', { entity: 'subscription', entityId: sub.id, ledgerId, detail: sub.name });
  api.ok(res, { status: back ? 'active' : 'paused' });
}));

router.post('/:id(\\d+)/cancel', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const sub = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!sub) return api.notFound(res, '订阅不存在');
  run("UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE id = ?", nowStr(), sub.id);
  auth.audit(req, 'subscription.cancel', { entity: 'subscription', entityId: sub.id, ledgerId, detail: sub.name });
  api.ok(res, { status: 'canceled' });
}));

router.delete('/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const sub = get('SELECT * FROM subscriptions WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!sub) return api.notFound(res, '订阅不存在');
  run('DELETE FROM subscriptions WHERE id = ? AND ledger_id = ?', sub.id, ledgerId);
  auth.audit(req, 'subscription.delete', { entity: 'subscription', entityId: sub.id, ledgerId, detail: sub.name });
  api.deleted(res, '订阅已删除');
}));

module.exports = router;
