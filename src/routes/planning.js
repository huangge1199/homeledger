'use strict';
/** 预算 / 周期账单 / 借贷台账 / 储蓄目标 */
const express = require('express');
const { all, get, run, tx, nowStr, todayStr } = require('../db');
const auth = require('../lib/auth');
const txn = require('../lib/txn');
const fd = require('../lib/formdata');
const u = require('../lib/util');
const sch = require('../lib/scheduler');

const router = express.Router();

/* ---------------------------------- 预算 ---------------------------------- */

router.get('/budgets', auth.requireLogin, (req, res, next) => {
  const ledger = res.locals.ledger;
  if (!ledger) return res.redirect('/');
  // SPA 时代：交给前端路由 /budgets 渲染（数据由 /api/v1/planning/budgets 拉取）
  next();
});

function remainingDays(b, range) {
  const today = todayStr();
  if (today < range.start) return 30;
  if (today > range.end) return 1;
  const d1 = new Date(`${today}T00:00:00`);
  const d2 = new Date(`${range.end}T00:00:00`);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

/** 分类须为系统分类或本账本自建（防跨账本/已停用 id 混入预算） */
function validCategoryId(ledgerId, rawId) {
  if (!rawId) return null;
  const c = get('SELECT id FROM categories WHERE id = ? AND is_archived = 0 AND (ledger_id IS NULL OR ledger_id = ?)', Number(rawId), ledgerId);
  return c ? Number(c.id) : null;
}
function validAccountId(ledgerId, rawId) {
  if (!rawId) return null;
  const a = get('SELECT id FROM accounts WHERE id = ? AND ledger_id = ? AND is_archived = 0', Number(rawId), ledgerId);
  return a ? Number(a.id) : null;
}

router.post('/budgets', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  const amount = u.parseAmountToCents(req.body.amount);
  if (!name || !amount) { res.flash('error', '请填写预算名称与金额'); return res.redirect('/budgets'); }
  const scope = ['overall', 'category', 'account'].includes(req.body.scope) ? req.body.scope : 'overall';
  run(
    `INSERT INTO budgets (ledger_id, name, scope, category_id, account_id, period, amount_cents, currency,
      trigger_type, rollover, alert_pct, start_date, end_date, is_active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
    ledgerId, name.slice(0, 30), scope,
    scope === 'category' ? validCategoryId(ledgerId, req.body.category_id) : null,
    scope === 'account' ? validAccountId(ledgerId, req.body.account_id) : null,
    ['monthly', 'yearly', 'weekly', 'custom'].includes(req.body.period) ? req.body.period : 'monthly',
    amount, req.body.currency || 'CNY',
    req.body.trigger_type === 'income' ? 'income' : 'expense',
    req.body.rollover ? 1 : 0,
    Number(req.body.alert_pct) || 80,
    req.body.start_date || null, req.body.end_date || null, nowStr()
  );
  auth.audit(req, 'budget.create', { entity: 'budget', ledgerId, detail: name });
  res.flash('success', `预算「${name}」已创建`);
  res.redirect('/budgets');
});

router.post('/budgets/:id', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const b = get('SELECT * FROM budgets WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!b) { res.flash('error', '预算不存在'); return res.redirect('/budgets'); }
  const effScope = ['overall', 'category', 'account'].includes(req.body.scope) ? req.body.scope : b.scope;
  run(
    `UPDATE budgets SET name=?, scope=?, category_id=?, account_id=?, period=?, amount_cents=?, trigger_type=?,
      rollover=?, alert_pct=?, start_date=?, end_date=?, is_active=? WHERE id=?`,
    String(req.body.name || b.name).slice(0, 30),
    effScope,
    effScope === 'category' ? validCategoryId(ledgerId, req.body.category_id) : null,
    effScope === 'account' ? validAccountId(ledgerId, req.body.account_id) : null,
    ['monthly', 'yearly', 'weekly', 'custom'].includes(req.body.period) ? req.body.period : b.period,
    req.body.amount ? u.parseAmountToCents(req.body.amount) : Number(b.amount_cents),
    req.body.trigger_type === 'income' ? 'income' : 'expense',
    req.body.rollover ? 1 : 0,
    Number(req.body.alert_pct) || Number(b.alert_pct),
    req.body.start_date || null, req.body.end_date || null,
    req.body.is_active ? 1 : 0, id
  );
  res.flash('success', '预算已更新');
  res.redirect('/budgets');
});

router.post('/budgets/:id/delete', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  run('DELETE FROM budgets WHERE id = ? AND ledger_id = ?', Number(req.params.id), Number(res.locals.ledger.id));
  res.flash('success', '预算已删除');
  res.redirect('/budgets');
});

router.post('/budgets/:id/toggle', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const b = get('SELECT * FROM budgets WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (b) run('UPDATE budgets SET is_active = ? WHERE id = ?', b.is_active ? 0 : 1, b.id);
  res.redirect('/budgets');
});

/* -------------------------------- 周期账单 -------------------------------- */

router.get('/recurring', auth.requireLogin, (req, res, next) => {
  const ledger = res.locals.ledger;
  if (!ledger) return res.redirect('/');
  // SPA 时代：交给前端路由 /recurring 渲染（数据由 /api/v1/planning/recurring 拉取）
  next();
});

router.post('/recurring', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  if (!name) { res.flash('error', '请填写账单名称'); return res.redirect('/recurring'); }
  const types = [].concat(req.body.item_type || []);
  const amounts = [].concat(req.body.item_amount || []);
  const cats = [].concat(req.body.item_category_id || []);
  const accs = [].concat(req.body.item_account_id || []);
  const notes = [].concat(req.body.item_note || []);
  const items = [];
  types.forEach((t, i) => {
    const amt = u.parseAmountToCents(amounts[i]);
    if (!amt) return;
    items.push({
      type: t || 'expense', amount_cents: amt,
      category_id: cats[i] ? Number(cats[i]) : null,
      account_id: accs[i] ? Number(accs[i]) : null,
      note: notes[i] || name,
      currency: 'CNY',
    });
  });
  if (!items.length) { res.flash('error', '请至少填写一项金额'); return res.redirect('/recurring'); }

  const frequency = ['daily', 'weekly', 'monthly', 'yearly'].includes(req.body.frequency) ? req.body.frequency : 'monthly';
  let next = /^d{4}-d{2}-d{2}$/.test(String(req.body.next_run_at || '')) ? req.body.next_run_at : todayStr();
  // 若首次执行日已过，自动推到下一个周期
  let guard = 0;
  while (next < todayStr() && guard++ < 400) next = sch.advanceDate(next, { frequency, interval_n: Number(req.body.interval_n) || 1, day_of_month: req.body.day_of_month });

  run(
    `INSERT INTO recurring_rules (ledger_id, name, payload, frequency, interval_n, day_of_month, next_run_at,
      auto_post, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    ledgerId, name.slice(0, 40), JSON.stringify({ items, user_id: req.session.userId }),
    frequency, Math.max(1, Number(req.body.interval_n) || 1),
    req.body.day_of_month ? Number(req.body.day_of_month) : Number(next.slice(8, 10)),
    next, req.body.auto_post ? 1 : 0, nowStr()
  );
  auth.audit(req, 'recurring.create', { entity: 'recurring', ledgerId, detail: name });
  res.flash('success', `周期账单「${name}」已创建，下次执行 ${next}`);
  res.redirect('/recurring');
});

router.post('/recurring/:id/toggle', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const r = get('SELECT * FROM recurring_rules WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (r) run('UPDATE recurring_rules SET is_active = ? WHERE id = ?', r.is_active ? 0 : 1, r.id);
  res.redirect('/recurring');
});

router.post('/recurring/:id/run', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const r = get('SELECT * FROM recurring_rules WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!r) { res.flash('error', '规则不存在'); return res.redirect('/recurring'); }
  const items = sch.ruleItems(r.payload);
  tx(() => {
    for (const p of items) {
      const amt = Math.abs(Number(p.amount_cents) || 0);
      if (!amt) continue;
      run(
        `INSERT INTO transactions (ledger_id, type, amount_cents, currency, rate, amount_base_cents, account_id,
          to_account_id, category_id, user_id, txn_date, note, merchant, status, source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ledgerId, p.type || 'expense', amt, 'CNY', 1, amt, p.account_id || null, null, p.category_id || null,
        req.session.userId, todayStr(), p.note || r.name, null, 'cleared', 'recurring', nowStr(), nowStr()
      );
    }
    run('UPDATE recurring_rules SET last_run_at = ?, next_run_at = ? WHERE id = ?', nowStr(), sch.advanceDate(r.next_run_at, r), r.id);
  });
  require('../db').recalcBalances(ledgerId);
  res.flash('success', '已立即记账一笔，下次执行日已顺延');
  res.redirect('/recurring');
});

router.post('/recurring/:id/delete', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  run('DELETE FROM recurring_rules WHERE id = ? AND ledger_id = ?', Number(req.params.id), Number(res.locals.ledger.id));
  res.flash('success', '周期账单已删除');
  res.redirect('/recurring');
});

/* -------------------------------- 借贷台账 -------------------------------- */

router.get('/debts', auth.requireLogin, (req, res, next) => {
  const ledger = res.locals.ledger;
  if (!ledger) return res.redirect('/');
  // SPA 时代：交给前端路由 /debts 渲染（数据由 /api/v1/planning/debts 拉取）
  next();
});

router.post('/debts', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const counterparty = String(req.body.counterparty || '').trim();
  const amount = u.parseAmountToCents(req.body.amount);
  const direction = req.body.direction === 'receivable' ? 'receivable' : 'payable';
  if (!counterparty || !amount) { res.flash('error', '请填写对方名称与金额'); return res.redirect('/debts'); }

  if (req.body.create_txn) {
    txn.createTransaction(ledgerId, req.session.userId, {
      type: direction === 'receivable' ? 'lend' : 'borrow',
      amount_cents: amount,
      account_id: req.body.account_id || null,
      txn_date: req.body.date || todayStr(),
      merchant: counterparty,
      note: req.body.note || (direction === 'receivable' ? '借出' : '借入'),
      source: 'manual',
    });
    res.flash('success', '已记一笔并同步到借贷台账');
    return res.redirect('/debts');
  }
  run(
    `INSERT INTO debts (ledger_id, direction, counterparty, principal_cents, balance_cents, currency, account_id, due_date, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ledgerId, direction, counterparty.slice(0, 40), amount, amount, req.body.currency || 'CNY',
    req.body.account_id || null, req.body.due_date || null, 'open',
    req.body.note ? String(req.body.note).slice(0, 200) : null, nowStr()
  );
  res.flash('success', '已新增台账记录（未生成流水）');
  res.redirect('/debts');
});

/** 收/还款：核销台账 + 生成流水 */
router.post('/debts/:id/settle', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const d = get('SELECT * FROM debts WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!d) { res.flash('error', '台账不存在'); return res.redirect('/debts'); }
  const amount = Math.min(u.parseAmountToCents(req.body.amount) || Number(d.balance_cents), Number(d.balance_cents));
  if (!amount) { res.flash('error', '金额无效'); return res.redirect('/debts'); }

  txn.createTransaction(ledgerId, req.session.userId, {
    type: d.direction === 'receivable' ? 'repay_receive' : 'repay_pay',
    amount_cents: amount,
    account_id: req.body.account_id || d.account_id,
    txn_date: req.body.date || todayStr(),
    merchant: d.counterparty,
    note: (d.direction === 'receivable' ? '收回借款 · ' : '偿还借款 · ') + d.counterparty,
    source: 'manual',
  });
  // 优先核销手工台账
  const newBalance = Math.max(0, Number(d.balance_cents) - amount);
  if (d.note !== '系统自动汇总') {
    run('UPDATE debts SET balance_cents = ?, status = ? WHERE id = ?', newBalance, newBalance <= 0 ? 'closed' : 'open', id);
  } else {
    txn.syncDebts(ledgerId);
  }
  auth.audit(req, 'debt.settle', { entity: 'debt', entityId: id, ledgerId, detail: String(amount) });
  res.flash('success', `已${d.direction === 'receivable' ? '收款' : '还款'} ${u.money(amount)}`);
  res.redirect('/debts');
});

router.post('/debts/:id/delete', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  run('DELETE FROM debts WHERE id = ? AND ledger_id = ? AND note != ?', Number(req.params.id), Number(res.locals.ledger.id), '系统自动汇总');
  res.flash('success', '台账已删除');
  res.redirect('/debts');
});

/* -------------------------------- 储蓄目标 -------------------------------- */

router.get('/goals', auth.requireLogin, (req, res, next) => {
  const ledger = res.locals.ledger;
  if (!ledger) return res.redirect('/');
  // SPA 时代：交给前端路由 /goals 渲染（数据由 /api/v1/planning/goals 拉取）
  next();
});

router.post('/goals', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const name = String(req.body.name || '').trim();
  const target = u.parseAmountToCents(req.body.target_amount);
  if (!name || !target) { res.flash('error', '请填写目标名称与目标金额'); return res.redirect('/goals'); }
  run(
    'INSERT INTO goals (ledger_id, name, icon, target_cents, saved_cents, account_id, target_date, status, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ledgerId, name.slice(0, 30), req.body.icon || '🎯', target, u.parseAmountToCents(req.body.saved_amount),
    req.body.account_id || null, req.body.target_date || null, 'active',
    req.body.note ? String(req.body.note).slice(0, 200) : null, nowStr()
  );
  res.flash('success', `储蓄目标「${name}」已创建`);
  res.redirect('/goals');
});

router.post('/goals/:id/deposit', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const g = get('SELECT * FROM goals WHERE id = ? AND ledger_id = ?', Number(req.params.id), ledgerId);
  if (!g) { res.flash('error', '目标不存在'); return res.redirect('/goals'); }
  const delta = u.parseAmountToCents(req.body.amount);
  if (!delta) { res.flash('error', '请填写金额（取出请填负数）'); return res.redirect('/goals'); }
  const saved = Math.max(0, Number(g.saved_cents) + delta);
  const status = saved >= Number(g.target_cents) ? 'done' : 'active';
  run('UPDATE goals SET saved_cents = ?, status = ? WHERE id = ?', saved, status, g.id);
  if (req.body.create_txn) {
    txn.createTransaction(ledgerId, req.session.userId, {
      type: delta > 0 ? 'expense' : 'income',
      amount_cents: Math.abs(delta),
      account_id: req.body.account_id || g.account_id || null,
      txn_date: todayStr(),
      note: `储蓄目标「${g.name}」${delta > 0 ? '存入' : '取出'}`,
      source: 'manual',
    });
  }
  if (status === 'done') {
    for (const uid of auth.ledgerWriterIds(ledgerId)) {
      auth.notify(uid, { kind: 'success', ledgerId, title: `🎉 储蓄目标达成：${g.name}`, link: '/goals' });
    }
  }
  res.flash('success', status === 'done' ? '目标已达成 🎉' : '进度已更新');
  res.redirect('/goals');
});

router.post('/goals/:id/delete', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  run('DELETE FROM goals WHERE id = ? AND ledger_id = ?', Number(req.params.id), Number(res.locals.ledger.id));
  res.flash('success', '目标已删除');
  res.redirect('/goals');
});

module.exports = router;
