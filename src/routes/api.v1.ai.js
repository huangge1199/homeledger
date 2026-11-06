'use strict';
/** /api/v1/ai —— AI 截图 / 文本识别 / 小助手对话 / 附件 */
const express = require('express');
const router = express.Router();
const { all, get, run, todayStr } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const ai = require('../lib/ai');
const txn = require('../lib/txn');
const fd = require('../lib/formdata');
const att = require('../lib/attachments');
const storage = require('../lib/storage');

router.get('/config', auth.requireLogin, api.asyncHandler((req, res) => {
  // 只回传页面需要的字段：apiKey 属敏感信息，不下发到浏览器
  const c = ai.getAiConfig();
  api.ok(res, {
    config: {
      enabled: c.enabled,
      baseUrl: c.baseUrl,
      model: c.model,
      vision: c.vision,
      autoSave: c.autoSave,
    },
    ready: ai.isAiReady(),
    usable: ai.isAiUsable(),
  });
}));

router.post('/scan', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler(async (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 6) : [];
  const text = String(req.body.text || '').slice(0, 4000);
  if (!images.length && !text) return api.badRequest(res, '请上传账单截图或输入账单文字');

  // 逐张处理，顺序与前端传入的 images 严格一一对应（saved[i] 对应 images[i]）：
  //   带 id 的 = 上次已存过的附件，服务器直接从存储取图（识别失败重试不再重复上传）
  //   不带 id 的 = 本次新传，落盘（内容完全相同的会自动复用已有附件，不会重复存）
  const saved = new Array(images.length).fill(null);
  const modelImages = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const id = Number(img.id) || 0;
    let row = null;
    let dataUrl = '';
    if (id) {
      const found = await att.readDataUrl(ledgerId, id);
      if (found) { row = found.row; dataUrl = found.dataUrl; }
    }
    if (!row) {
      if (!img.dataUrl) continue;
      row = await att.saveDataUrlImage({ dataUrl: img.dataUrl, ledgerId, userId: req.session.userId, name: img.name });
      dataUrl = img.dataUrl;
    }
    saved[i] = row;
    modelImages.push(dataUrl);
  }

  const result = await ai.analyzeBill({ images: modelImages, text, ledgerId });
  const firstSaved = saved.find(Boolean);
  if (firstSaved) run('UPDATE attachments SET ai_status = ? WHERE id = ?', result.engine === 'llm' ? 'recognized' : 'rule', firstSaved.id);
  const categories = fd.flatCategories(ledgerId);
  const accounts = fd.accounts(ledgerId);
  const items = result.items.map((it) => ({
    ...it,
    category_path: categories.find((c) => Number(c.id) === Number(it.category_id))?.path || (it.category_name || '未分类'),
    account_name_resolved: accounts.find((a) => Number(a.id) === Number(it.account_id))?.name || '',
    kind: it.type === 'income' ? 'income' : 'expense',
  }));
  auth.audit(req, 'ai.scan', {
    entity: 'attachment', entityId: firstSaved?.id || null, ledgerId,
    detail: `${result.engine} 识别 ${items.length} 笔`,
  });
  api.ok(res, {
    engine: result.engine,
    model: result.model || null,
    // images 与请求里的 images 按位对应（第 i 项就是第 i 张图），前端据此回写附件 id
    items, images: saved,
    warnings: result.warnings || [],
    autoSave: ai.getAiConfig().autoSave,
  });
}));

router.post('/confirm', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const imageIds = (Array.isArray(req.body.image_ids) ? req.body.image_ids : []).map(Number).filter(Boolean);
  if (!items.length) return api.badRequest(res, '没有可保存的记录');
  const created = []; const errors = [];
  for (const it of items) {
    try {
      created.push(txn.createTransaction(ledgerId, req.session.userId, {
        type: it.type || 'expense',
        amount_cents: Number(it.amount_cents) || 0,
        currency: it.currency || 'CNY',
        account_id: it.account_id || null,
        category_id: it.category_id || null,
        txn_date: it.txn_date || todayStr(),
        txn_time: it.txn_time || '',
        note: it.note || '',
        merchant: it.merchant || '',
        tags: it.tags || '',
        is_reimbursable: it.is_reimbursable ? 1 : 0,
        source: req.body.source || 'ai_screenshot',
        ai_json: JSON.stringify(it.raw || it).slice(0, 4000),
      }));
    } catch (e) {
      errors.push(`${it.merchant || it.note || '一笔'}：${e.message}`);
    }
  }
  const linked = att.linkImagesToTxns({ ledgerId, imageIds, txnIds: created });
  auth.audit(req, 'ai.confirm', { ledgerId, detail: `入库 ${created.length} 笔，失败 ${errors.length}` });
  api.ok(res, { created: created.length, ids: created, linked, errors, redirect: errors.length ? null : '/transactions' });
}));

router.post('/text', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler(async (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const text = String(req.body.text || '').slice(0, 4000);
  if (!text.trim()) return api.badRequest(res, '请输入账单内容');
  const result = await ai.analyzeBill({ images: [], text, ledgerId });
  const categories = fd.flatCategories(ledgerId);
  api.ok(res, {
    engine: result.engine,
    warnings: result.warnings || [],
    items: result.items.map((it) => ({
      ...it,
      category_path: categories.find((c) => Number(c.id) === Number(it.category_id))?.path || (it.category_name || '未分类'),
    })),
  });
}));

router.post('/chat', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler(async (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 6) : [];
  const text = String(req.body.text || '').slice(0, 4000).trim();
  if (!images.length && !text) return api.badRequest(res, '说一句消费（如「午饭 35 元」）或发一张账单截图');
  // 与 /scan 同一套语义：带 id 的复用已存附件（不重复上传），不带 id 的新存
  const saved = new Array(images.length).fill(null);
  const modelImages = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const id = Number(img.id) || 0;
    let row = null;
    let dataUrl = '';
    if (id) {
      const found = await att.readDataUrl(ledgerId, id);
      if (found) { row = found.row; dataUrl = found.dataUrl; }
    }
    if (!row) {
      if (!img.dataUrl) continue;
      row = await att.saveDataUrlImage({ dataUrl: img.dataUrl, ledgerId, userId: req.session.userId, name: img.name });
      dataUrl = img.dataUrl;
    }
    saved[i] = row;
    modelImages.push(dataUrl);
  }
  const result = await ai.analyzeBill({ images: modelImages, text, ledgerId });
  const firstSaved = saved.find(Boolean);
  if (firstSaved) run('UPDATE attachments SET ai_status = ? WHERE id = ?', result.engine === 'llm' ? 'recognized' : 'rule', firstSaved.id);
  const categories = fd.flatCategories(ledgerId);
  const accountList = fd.accounts(ledgerId);
  const fallbackAccountId = accountList.length ? Number(accountList[0].id) : null;
  const items = result.items.map((it) => {
    const accountId = it.account_id || fallbackAccountId;
    return {
      ...it,
      account_id: accountId,
      category_path: categories.find((c) => Number(c.id) === Number(it.category_id))?.path || (it.category_name || '未分类'),
      account_name_resolved: accountList.find((a) => Number(a.id) === Number(accountId))?.name || '',
    };
  });
  const created = []; const errors = [];
  for (const it of items) {
    try {
      created.push(txn.createTransaction(ledgerId, req.session.userId, {
        type: it.type || 'expense',
        amount_cents: Number(it.amount_cents) || 0,
        currency: it.currency || 'CNY',
        account_id: it.account_id || null,
        category_id: it.category_id || null,
        txn_date: it.txn_date || todayStr(),
        txn_time: it.txn_time || '',
        note: it.note || '',
        merchant: it.merchant || '',
        tags: it.tags || '',
        is_reimbursable: it.is_reimbursable ? 1 : 0,
        source: 'ai_chat',
        ai_json: JSON.stringify(it.raw || it).slice(0, 4000),
      }));
    } catch (e) {
      errors.push(`${it.merchant || it.note || '一笔'}：${e.message}`);
    }
  }
  const linked = att.linkImagesToTxns({ ledgerId, imageIds: saved.filter(Boolean).map((s) => s.id), txnIds: created });
  auth.audit(req, 'ai.chat', { ledgerId, detail: `${result.engine} 识别 ${items.length} 笔，入库 ${created.length}` });
  api.ok(res, {
    engine: result.engine,
    model: result.model || null,
    items, created: created.length, ids: created, linked, errors,
    warnings: result.warnings || [], images: saved,
  });
}));

/* 附件 */
router.get('/attachments', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 36;
  const total = Number(get('SELECT COUNT(*) AS c FROM attachments WHERE ledger_id = ?', ledgerId)?.c || 0);
  const rows = all(
    // linked_txn_id：关联交易「存在且未软删」时才非空，前端据此决定是否给出「查看记录」入口
    `SELECT a.*, t.id AS linked_txn_id, t.amount_cents, t.txn_date, t.merchant,
            c.name AS category_name, c.icon AS category_icon
     FROM attachments a
     LEFT JOIN transactions t ON t.id = a.txn_id AND t.deleted_at IS NULL
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE a.ledger_id = ? ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ledgerId, pageSize, (page - 1) * pageSize);
  // 补静态访问地址，前端可直接 <img src>
  for (const r of rows) r.url = att.webUrl(r.rel_path);
  api.ok(res, {
    items: rows, page, total, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
    // 附件实际存放位置（本地目录 / 对象存储），前端据此显示文案
    storage: storage.describe(),
  });
}));

router.delete('/attachments/:id(\\d+)', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler(async (req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const ok = await att.removeById(ledgerId, Number(req.params.id));
  if (ok) auth.audit(req, 'attachment.delete', { ledgerId, entity: 'attachment', entityId: Number(req.params.id) });
  api.ok(res, { removed: ok });
}));

module.exports = router;
