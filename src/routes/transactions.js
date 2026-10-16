'use strict';
/** 交易：列表 / 记一笔 / 编辑 / 批量操作 / 报销（v2 SPA：仅保留接口语义） */
const express = require('express');
const { all, get, run, todayStr, TXN_TYPE_MAP } = require('../db');
const auth = require('../lib/auth');
const txn = require('../lib/txn');
const fd = require('../lib/formdata');
const u = require('../lib/util');
const att = require('../lib/attachments');

const router = express.Router();

/** 从表单解析出标准记账号 */
function readForm(body) {
  const splits = [];
  const names = [].concat(body.split_name || []);
  const amounts = [].concat(body.split_amount || []);
  names.forEach((n, i) => {
    const amt = u.parseAmountToCents(amounts[i]);
    if (n && amt) splits.push({ member_name: String(n).slice(0, 30), share_cents: amt });
  });
  return {
    // type 走白名单：透传任意值会在编辑失败回显时进入内嵌 <script> 的 JSON
    type: TXN_TYPE_MAP[body.type] ? body.type : 'expense',
    amount_cents: u.parseAmountToCents(body.amount),
    currency: body.currency || 'CNY',
    rate: body.rate ? Number(body.rate) : 1,
    account_id: body.account_id || null,
    to_account_id: body.to_account_id || null,
    category_id: body.category_id || null,
    txn_date: body.txn_date || todayStr(),
    note: body.note || '',
    merchant: body.merchant || '',
    status: body.status || 'cleared',
    is_reimbursable: body.is_reimbursable ? 1 : 0,
    tags: body.tags || '',
    splits,
    group_id: body.group_id || null,
    source: body.source || 'manual',
  };
}

/** back 只接受站内相对路径，避免 POST 参数被构造成开放重定向 */
function safeBack(back) {
  const s = String(back || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/transactions';
}

/* ---------------------------------- 列表 ---------------------------------- */

/* 单笔详情（列表行点击弹窗用）：字段与列表同源，另带附件清单 */
router.get('/:id/json', auth.requireLogin, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const t = txn.getTransaction(Number(req.params.id), ledgerId);
  if (!t) return res.status(404).json({ ok: false, error: '记录不存在' });
  res.json({ ok: true, txn: t, attachments: att.listByTxn(t.id) });
});

router.get('/', auth.requireLogin, (req, res, next) => {
  const ledger = res.locals.ledger;
  if (!ledger) return res.redirect('/');
  // SPA 时代：交给前端路由 /transactions 渲染（数据由 /api/v1/transactions 拉取）
  next();
});

/* --------------------------------- 记一笔 --------------------------------- */

router.get('/new', auth.requireLogin, auth.requireLedgerWrite, (req, res, next) => {
  // SPA 时代：交给前端路由 /transactions/new 渲染（前端 NewTxnView 自行填 prefilled 数据）
  next();
});

router.post('/', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const data = readForm(req.body);
  const wantsJson = req.body._json === '1' || (req.headers.accept || '').includes('application/json');
  try {
    const id = txn.createTransaction(ledgerId, req.session.userId, data);
    auth.audit(req, 'txn.create', { entity: 'transaction', entityId: id, ledgerId, detail: `${data.type} ${(data.amount_cents / 100).toFixed(2)}` });
    if (wantsJson) return res.json({ ok: true, id, redirect: '/transactions' });
    res.flash('success', '已记一笔 ✓');
    res.redirect(safeBack(req.body.back));
  } catch (e) {
    if (wantsJson) return res.status(400).json({ ok: false, error: e.message });
    res.flash('error', e.message || '保存失败');
    res.status(400).redirect(safeBack(req.body.back));
  }
});

/* ---------------------------------- 编辑 ---------------------------------- */

router.get('/:id/edit', auth.requireLogin, auth.requireLedgerWrite, (req, res, next) => {
  const ledgerId = Number(res.locals.ledger.id);
  const t = txn.getTransaction(Number(req.params.id), ledgerId);
  if (!t) {
    res.flash('error', '该笔记录可能已被删除。');
    return res.status(404).redirect('/transactions');
  }
  // SPA 时代：交给前端路由 /transactions/:id/edit 渲染
  next();
});

/* --------------------------------- 批量操作 -------------------------------- */
/* 注意：必须注册在 POST /:id 之前——Express 按注册顺序匹配，/bulk 会被 /:id
   捕获成 id=NaN，此前批量删除一直报「记录不存在」就是这个原因 */

router.post('/bulk', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
  const action = req.body.action || '';
  if (!ids.length) {
    res.flash('error', '请先勾选记录');
    return res.redirect(safeBack(req.body.back));
  }
  const placeholders = ids.map(() => '?').join(',');
  switch (action) {
    case 'delete': {
      const n = txn.bulkDelete(ids, ledgerId);
      res.flash('success', `已删除 ${n} 笔记录`);
      break;
    }
    case 'category': {
      const cid = req.body.category_id ? Number(req.body.category_id) : null;
      const c = cid ? get('SELECT id FROM categories WHERE id = ? AND (ledger_id IS NULL OR ledger_id = ?)', cid, ledgerId) : null;
      if (!c) { res.flash('error', '请选择要改成的分类'); break; }
      run(`UPDATE transactions SET category_id = ?, updated_at = ? WHERE ledger_id = ? AND id IN (${placeholders})`, cid, require('../db').nowStr(), ledgerId, ...ids);
      res.flash('success', `已修改 ${ids.length} 笔的分类`);
      break;
    }
    case 'tag': {
      const tag = String(req.body.tag || '').trim();
      if (!tag) { res.flash('error', '请输入标签名'); break; }
      for (const id of ids) txn.applyTags(id, ledgerId, tag, false);
      res.flash('success', `已为 ${ids.length} 笔添加标签「${tag}」`);
      break;
    }
    case 'reimburse': {
      try {
        // 未选入账账户时回落到账本第一个可用账户，避免报销收入悬空（与开放 API 行为一致）
        const reimburseAcc = req.body.account_id
          ? Number(req.body.account_id)
          : Number(get('SELECT id FROM accounts WHERE ledger_id = ? AND is_archived = 0 ORDER BY sort_order, id LIMIT 1', ledgerId)?.id) || null;
        const r = txn.markReimbursed(ids, ledgerId, req.session.userId, reimburseAcc);
        res.flash('success', `已标记 ${r.count} 笔为已报销，生成入账 ${(r.total / 100).toFixed(2)}`);
      } catch (e) {
        res.flash('error', e.message);
      }
      break;
    }
    case 'reimbursable': {
      run(`UPDATE transactions SET is_reimbursable = 1, updated_at = ? WHERE ledger_id = ? AND id IN (${placeholders})`, require('../db').nowStr(), ledgerId, ...ids);
      res.flash('success', `已标记 ${ids.length} 笔为待报销`);
      break;
    }
    case 'restore': {
      run(`UPDATE transactions SET deleted_at = NULL WHERE ledger_id = ? AND id IN (${placeholders})`, ledgerId, ...ids);
      require('../db').recalcBalances(ledgerId);
      // 恢复借贷类交易后同步重建台账（与开放 API 恢复路径一致）
      txn.syncDebts(ledgerId);
      res.flash('success', '已恢复');
      break;
    }
    default:
      res.flash('error', '未知操作');
  }
  res.redirect(safeBack(req.body.back));
});

router.post('/:id', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const data = readForm(req.body);
  try {
    txn.updateTransaction(id, ledgerId, req.session.userId, data);
    auth.audit(req, 'txn.update', { entity: 'transaction', entityId: id, ledgerId });
    res.flash('success', '已保存修改');
    res.redirect(safeBack(req.body.back));
  } catch (e) {
    res.flash('error', e.message || '保存失败');
    res.status(400).redirect(safeBack(req.body.back));
  }
});

router.post('/:id/delete', auth.requireLogin, auth.requireLedgerWrite, (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const ok = txn.softDelete(Number(req.params.id), ledgerId);
  auth.audit(req, 'txn.delete', { entity: 'transaction', entityId: Number(req.params.id), ledgerId });
  if (req.body._json === '1') return res.json({ ok });
  res.flash(ok ? 'success' : 'error', ok ? '已删除' : '记录不存在');
  res.redirect(safeBack(req.body.back));
});

module.exports = router;
