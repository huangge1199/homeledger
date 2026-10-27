'use strict';
/** /api/v1/admin —— 设置 / 账本 / 成员 / 导入 / 导出 / 备份 / 系统 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const router = express.Router();

const { all, get, run, tx, nowStr, todayStr, DATA_DIR, DB_FILE, setSetting, addLedgerMember, createDefaultAccounts } = require('../db');
const auth = require('../lib/auth');
const api = require('../lib/api');
const ai = require('../lib/ai');
const importer = require('../lib/importers');
const fd = require('../lib/formdata');
const u = require('../lib/util');
const txn = require('../lib/txn');

function safeSize(p) { try { return fs.statSync(p).size; } catch { return 0; } }
function dirSize(dir) {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) total += dirSize(p);
      else { try { total += fs.statSync(p).size; } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  return total;
}

function hashToken(plain) { return crypto.createHash('sha256').update(String(plain)).digest('hex'); }

/* ============================================ 设置 ============================================ */
router.get('/settings', auth.requireLogin, api.asyncHandler((req, res) => {
  const rawCfg = ai.getAiConfig();
  const isAdmin = !!res.locals.user.is_admin;
  const me = res.locals.user;
  let admin = null;
  if (isAdmin) {
    admin = {
      users: all(
        `SELECT u.*,
          (SELECT COUNT(*) FROM ledger_members m WHERE m.user_id = u.id) AS ledger_count,
          (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS txn_count
         FROM users u ORDER BY u.id`),
      stats: {
        users: Number(get('SELECT COUNT(*) AS c FROM users')?.c || 0),
        ledgers: Number(get('SELECT COUNT(*) AS c FROM ledgers')?.c || 0),
        txns: Number(get('SELECT COUNT(*) AS c FROM transactions WHERE deleted_at IS NULL')?.c || 0),
        attachments: Number(get('SELECT COUNT(*) AS c FROM attachments')?.c || 0),
        dbSize: safeSize(DB_FILE),
        uploadsSize: dirSize(path.join(DATA_DIR, 'uploads')),
      },
      // 动作/对象/详情按老版 util.js 的中文映射预格式化，前端直接渲染
      audits: all('SELECT a.*, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 60')
        .map((a) => ({
          ...a,
          action_label: u.auditAction(a.action),
          target_label: u.auditTarget(a.entity, a.entity_id),
          detail_label: u.auditDetail(a),
        })),
    };
  }
  // 全量键值：剔除 API Key 明文，避免密钥随接口下发到浏览器
  const allSettings = require('../db').allSettings();
  delete allSettings['ai.api_key'];
  api.ok(res, {
    // 当前用户资料（老版 settings.ejs 直接用 user.* 渲染，这里补上等价字段）
    user: {
      id: me.id,
      username: me.username,
      display_name: me.display_name,
      email: me.email,
      avatar_color: me.avatar_color,
      avatar_path: me.avatar_path,
      avatar_ver: me.avatar_ver,
      theme: me.theme,
      is_admin: !!me.is_admin,
      status: me.status,
      created_at: me.created_at,
      last_login_at: me.last_login_at,
    },
    // cfg 不下发 apiKey 明文（老版 EJS 同样只输出 model/baseUrl/vision/autoSave）
    cfg: { ...rawCfg, apiKey: undefined, hasApiKey: !!rawCfg.apiKey },
    aiReady: ai.isAiReady(),
    settings: allSettings,
    isAdmin,
    admin,
    apiTokens: all(
      `SELECT id, name, token_tail, last_used_at, created_at FROM api_tokens
       WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC`, res.locals.user.id),
    envInfo: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      mem: Math.round(process.memoryUsage().rss / 1024 / 1024),
      dataDir: DATA_DIR,
      dbSize: safeSize(DB_FILE),
      uptime: Math.round(process.uptime()),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}));

router.get('/settings/api-tokens/new', auth.requireLogin, api.asyncHandler((req, res) => {
  // 读取 session 暂存的"一次性"明文（由 POST 创建时写入）
  const t = req.session.newToken;
  delete req.session.newToken;
  api.ok(res, { newToken: t || null });
}));

router.post('/settings/api-tokens', auth.requireLogin, api.asyncHandler((req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30) || 'API 令牌';
  const plain = 'hl_' + crypto.randomBytes(24).toString('base64url');
  run(
    `INSERT INTO api_tokens (user_id, ledger_id, name, token_hash, token_tail, created_at)
     VALUES (?,?,?,?,?,?)`,
    res.locals.user.id,
    res.locals.ledger ? Number(res.locals.ledger.id) : null,
    name, hashToken(plain), plain.slice(-4), nowStr()
  );
  auth.audit(req, 'api.token.create', { entity: 'api_token', detail: `创建令牌「${name}」` });
  req.session.newToken = { name, token: plain };
  api.created(res, { message: '已生成', token_tail: plain.slice(-4) });
}));

router.post('/settings/api-tokens/:id(\\d+)/revoke', auth.requireLogin, api.asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const row = get('SELECT * FROM api_tokens WHERE id = ? AND user_id = ? AND revoked_at IS NULL', id, res.locals.user.id);
  if (!row) return api.notFound(res, '令牌不存在或已吊销');
  run('UPDATE api_tokens SET revoked_at = ? WHERE id = ?', nowStr(), id);
  auth.audit(req, 'api.token.revoke', { entity: 'api_token', entityId: id });
  api.ok(res, { message: '已吊销' });
}));

router.patch('/settings/profile', auth.requireLogin, api.asyncHandler((req, res) => {
  const displayName = String(req.body.display_name || '').trim();
  const email = String(req.body.email || '').trim() || null;
  const username = String(req.body.username || '').trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(req.body.avatar_color || '') ? req.body.avatar_color : res.locals.user.avatar_color;
  if (!displayName) return api.badRequest(res, '昵称不能为空');
  if (username !== res.locals.user.username) {
    if (!/^[A-Za-z0-9_\-.]{2,24}$/.test(username)) return api.badRequest(res, '用户名需为 2-24 位字母、数字或 _ - . 组合');
    const dup = get('SELECT id FROM users WHERE username = ? AND id != ?', username, req.session.userId);
    if (dup) return api.conflict(res, `用户名「${username}」已被占用`);
    run('UPDATE users SET username = ? WHERE id = ?', username, req.session.userId);
    auth.audit(req, 'user.username_change', { entity: 'user', entityId: req.session.userId, detail: `${res.locals.user.username} → ${username}` });
  }
  run('UPDATE users SET display_name = ?, email = ?, avatar_color = ? WHERE id = ?',
    displayName.slice(0, 30), email, color, req.session.userId);
  api.saved(res, '已更新');
}));

const AVATAR_DIR = () => path.join(DATA_DIR, 'uploads', 'avatars');
function parseAvatarDataUrl(dataUrl) {
  const m = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return null; }
  if (!buf || buf.length < 16 || buf.length > 2 * 1024 * 1024) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  let ext = null;
  if (hex.startsWith('89504e47')) ext = 'png';
  else if (hex.startsWith('ffd8ff')) ext = 'jpg';
  else if (hex.startsWith('47494638')) ext = 'gif';
  else if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') ext = 'webp';
  return ext ? { buf, ext } : null;
}
function removeAvatarFile(avatarPath) {
  if (!avatarPath) return;
  try { fs.unlinkSync(path.join(AVATAR_DIR(), avatarPath)); } catch (e) { /* ignore */ }
}

router.post('/settings/avatar', auth.requireLogin, api.asyncHandler((req, res) => {
  const parsed = parseAvatarDataUrl(req.body.dataUrl);
  if (!parsed) return api.badRequest(res, '请上传 2MB 以内的 PNG/JPG/GIF/WebP 图片');
  fs.mkdirSync(AVATAR_DIR(), { recursive: true });
  const name = `user-${req.session.userId}.${parsed.ext}`;
  removeAvatarFile(res.locals.user.avatar_path);
  fs.writeFileSync(path.join(AVATAR_DIR(), name), parsed.buf);
  run('UPDATE users SET avatar_path = ?, avatar_ver = ? WHERE id = ?', name, Date.now(), req.session.userId);
  auth.audit(req, 'user.avatar_change', { entity: 'user', entityId: req.session.userId });
  api.saved(res, '已更新');
}));

router.post('/settings/avatar/clear', auth.requireLogin, api.asyncHandler((req, res) => {
  removeAvatarFile(res.locals.user.avatar_path);
  run('UPDATE users SET avatar_path = NULL, avatar_ver = NULL WHERE id = ?', req.session.userId);
  api.ok(res);
}));

router.post('/settings/password', auth.requireLogin, api.asyncHandler((req, res) => {
  const oldPw = String(req.body.old_password || '');
  const pw = String(req.body.new_password || '');
  const pw2 = String(req.body.new_password2 || '');
  const user = get('SELECT * FROM users WHERE id = ?', req.session.userId);
  if (!auth.verifyPassword(oldPw, user.password_hash)) return api.fail(res, 401, '当前密码不正确', { code: 'BAD_OLD_PASSWORD' });
  if (pw.length < 6) return api.badRequest(res, '新密码至少 6 位');
  if (pw !== pw2) return api.badRequest(res, '两次输入的新密码不一致');
  run('UPDATE users SET password_hash = ? WHERE id = ?', auth.hashPassword(pw), req.session.userId);
  run('DELETE FROM sessions WHERE user_id = ? AND sid != ?', req.session.userId, req.session.id);
  auth.audit(req, 'user.password_change', { entity: 'user', entityId: req.session.userId });
  api.ok(res, { message: '密码已修改，其他设备已退出登录' });
}));

router.put('/settings/theme', auth.requireLogin, api.asyncHandler((req, res) => {
  const mode = req.body.mode === 'dark' ? 'dark' : 'light';
  run('UPDATE users SET theme = ? WHERE id = ?', mode, req.session.userId);
  api.ok(res, { theme: mode });
}));

router.put('/settings/ai', auth.requireLogin, require('../lib/auth').requireAdmin, api.asyncHandler((req, res) => {
  const before = ai.getAiConfig();
  const rawKey = String(req.body['ai.api_key'] == null ? '' : req.body['ai.api_key']).trim();
  if (req.body.clear_api_key) {
    setSetting('ai.api_key', '');
  } else if (rawKey === '' || ai.isMaskedSecret(rawKey)) {
    setSetting('ai.api_key', before.apiKey);
  } else if (!ai.isHeaderSafe(rawKey)) {
    return api.badRequest(res, 'API Key 含有非法字符（复制时可能带入了全角符号），已保留原 Key');
  } else {
    setSetting('ai.api_key', rawKey);
  }
  setSetting('ai.base_url', String(req.body['ai.base_url'] || '').trim());
  setSetting('ai.model', String(req.body['ai.model'] || '').trim());
  setSetting('ai.enabled', req.body['ai.enabled'] ? 'true' : 'false');
  setSetting('ai.vision', req.body['ai.vision'] ? 'true' : 'false');
  setSetting('ai.auto_save', req.body['ai.auto_save'] ? 'true' : 'false');
  setSetting('ai.timeout_ms', String(Number(req.body['ai.timeout_ms']) || 90000));
  auth.audit(req, 'settings.ai');
  api.saved(res, 'AI 配置已保存');
}));

router.put('/settings/site', auth.requireLogin, require('../lib/auth').requireAdmin, api.asyncHandler((req, res) => {
  if (req.body['site.name']) setSetting('site.name', String(req.body['site.name']).slice(0, 20));
  if (req.body['site.currency']) setSetting('site.currency', String(req.body['site.currency']).slice(0, 8));
  setSetting('site.allow_register', req.body['site.allow_register'] ? 'true' : 'false');
  setSetting('security.login_max_fail', String(Number(req.body['security.login_max_fail']) || 10));
  api.saved(res, '站点设置已保存');
}));

router.post('/settings/ai/test', auth.requireLogin, require('../lib/auth').requireAdmin, api.asyncHandler(async (req, res) => {
  if (req.body.base_url) setSetting('ai.base_url', String(req.body.base_url).trim());
  if (req.body.model) setSetting('ai.model', String(req.body.model).trim());
  const key = String(req.body.api_key == null ? '' : req.body.api_key).trim();
  if (key && !ai.isMaskedSecret(key)) {
    if (!ai.isHeaderSafe(key)) return api.badRequest(res, 'API Key 含有非法字符（复制时可能带入了全角符号或中文标点）');
    setSetting('ai.api_key', key);
  }
  const r = await ai.testConnection();
  if (!r.ok) return api.fail(res, 502, r.error, { code: 'AI_TEST_FAIL' });
  api.ok(res, { message: '连接成功，模型响应正常' });
}));

router.post('/settings/ai/models', auth.requireLogin, require('../lib/auth').requireAdmin, api.asyncHandler(async (req, res) => {
  const out = await ai.listModels({
    baseUrl: String(req.body.base_url || '').trim(),
    apiKey: String(req.body.api_key == null ? '' : req.body.api_key).trim(),
  });
  api.ok(res, out);
}));

/* ============================================ 账本 ============================================ */
router.get('/ledgers', auth.requireLogin, api.asyncHandler((req, res) => {
  const rows = all(
    `SELECT l.*, m.role,
      (SELECT COUNT(*) FROM transactions t WHERE t.ledger_id = l.id AND t.deleted_at IS NULL) AS txn_count,
      (SELECT COUNT(*) FROM ledger_members x WHERE x.ledger_id = l.id) AS member_count,
      (SELECT COUNT(*) FROM accounts a WHERE a.ledger_id = l.id) AS account_count
     FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id AND m.user_id = ?
     ORDER BY l.is_archived, l.sort_order, l.id`, req.session.userId);
  api.ok(res, { items: rows });
}));

router.post('/ledgers', auth.requireLogin, api.asyncHandler((req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return api.badRequest(res, '请填写账本名称');
  const currency = String(req.body.currency || 'CNY').slice(0, 8);
  const info = run(
    'INSERT INTO ledgers (name, kind, currency, icon, color, owner_id, note, created_at) VALUES (?,?,?,?,?,?,?,?)',
    name.slice(0, 30),
    ['personal', 'family', 'business', 'travel', 'project'].includes(req.body.kind) ? req.body.kind : 'personal',
    currency, req.body.icon || '📒', u.safeColor(req.body.color, u.colorFor(name)), req.session.userId,
    req.body.note ? String(req.body.note).slice(0, 200) : null, nowStr()
  );
  addLedgerMember(info.lastInsertRowid, req.session.userId, 'owner');
  if (req.body.with_default_accounts !== '0') createDefaultAccounts(info.lastInsertRowid, currency, req.session.userId);
  req.session.ledgerId = info.lastInsertRowid;
  auth.audit(req, 'ledger.create', { entity: 'ledger', entityId: info.lastInsertRowid });
  api.created(res, { id: info.lastInsertRowid });
}));

const LEDGER_KINDS = ['personal', 'family', 'business', 'travel', 'project'];
function ledgerManageOrFail(req, res, id) {
  const m = auth.membership(req.session.userId, id);
  if (!m || !auth.canManage(m.role)) return api.forbidden(res, '需要该账本的管理员权限');
  return null;
}

router.put('/ledgers/:id(\\d+)', auth.requireLogin, api.asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const denied = ledgerManageOrFail(req, res, id); if (denied) return denied;
  const l = get('SELECT * FROM ledgers WHERE id = ?', id);
  if (!l) return api.notFound(res, '账本不存在');
  run('UPDATE ledgers SET name=?, kind=?, currency=?, icon=?, color=?, note=?, sort_order=? WHERE id=?',
    String(req.body.name || l.name).slice(0, 30), LEDGER_KINDS.includes(req.body.kind) ? req.body.kind : l.kind,
    String(req.body.currency || l.currency).slice(0, 8),
    req.body.icon || l.icon, u.safeColor(req.body.color, l.color),
    req.body.note ? String(req.body.note).slice(0, 200) : null,
    Number(req.body.sort_order) || l.sort_order, id);
  auth.audit(req, 'ledger.update', { entity: 'ledger', entityId: id });
  api.saved(res, '账本已更新');
}));

router.post('/ledgers/:id(\\d+)/archive', auth.requireLogin, api.asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const denied = ledgerManageOrFail(req, res, id); if (denied) return denied;
  const l = get('SELECT * FROM ledgers WHERE id = ?', id);
  if (!l) return api.notFound(res, '账本不存在');
  run('UPDATE ledgers SET is_archived = ? WHERE id = ?', l.is_archived ? 0 : 1, id);
  auth.audit(req, 'ledger.archive', { entity: 'ledger', entityId: id });
  api.ok(res, { archived: !l.is_archived });
}));

router.delete('/ledgers/:id(\\d+)', auth.requireLogin, api.asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const l = get('SELECT * FROM ledgers WHERE id = ? AND owner_id = ?', id, req.session.userId);
  if (!l) return api.forbidden(res, '只有账本拥有者可以删除账本');
  if (String(req.body.confirm || '') !== l.name) return api.badRequest(res, '请准确输入账本名称以确认删除');
  const files = [];
  tx(() => { files.push(...cascadeDeleteLedger(id)); });
  cleanupUploadFiles(files);
  auth.audit(req, 'ledger.delete', { entity: 'ledger', entityId: id });
  if (Number(req.session.ledgerId) === id) req.session.ledgerId = null;
  api.deleted(res, `账本「${l.name}」及其全部数据已删除`);
}));

function cascadeDeleteLedger(id) {
  const files = all('SELECT rel_path FROM attachments WHERE ledger_id = ?', id);
  const ids = all('SELECT id FROM transactions WHERE ledger_id = ?', id).map((r) => r.id);
  for (const tid of ids) run('DELETE FROM transaction_tags WHERE transaction_id = ?', tid);
  run('DELETE FROM splits WHERE ledger_id = ?', id);
  run('DELETE FROM transactions WHERE ledger_id = ?', id);
  run('DELETE FROM attachments WHERE ledger_id = ?', id);
  run('DELETE FROM accounts WHERE ledger_id = ?', id);
  run('DELETE FROM budgets WHERE ledger_id = ?', id);
  run('DELETE FROM recurring_rules WHERE ledger_id = ?', id);
  run('DELETE FROM subscriptions WHERE ledger_id = ?', id);
  run('DELETE FROM goals WHERE ledger_id = ?', id);
  run('DELETE FROM debts WHERE ledger_id = ?', id);
  run('DELETE FROM tags WHERE ledger_id = ?', id);
  run('DELETE FROM categories WHERE ledger_id = ?', id);
  run('DELETE FROM ledger_members WHERE ledger_id = ?', id);
  run('DELETE FROM ledger_invites WHERE ledger_id = ?', id);
  run('DELETE FROM import_jobs WHERE ledger_id = ?', id);
  run('UPDATE api_tokens SET ledger_id = NULL WHERE ledger_id = ?', id);
  run('DELETE FROM ledgers WHERE id = ?', id);
  return files.map((f) => f.rel_path);
}
function cleanupUploadFiles(relPaths) {
  const root = path.join(DATA_DIR, 'uploads');
  for (const rel of relPaths || []) {
    const abs = path.resolve(root, String(rel));
    if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
    try { fs.unlinkSync(abs); } catch { /* ignore */ }
  }
}

/* ============================================ 成员 ============================================ */
router.get('/members', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { members: [], invites: [] });
  const ledgerId = Number(ledger.id);
  const members = fd.members(ledgerId);
  const invites = all('SELECT i.*, u.display_name AS creator FROM ledger_invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.ledger_id = ? ORDER BY i.id DESC LIMIT 20', ledgerId);
  const stats = txn.memberBreakdown(ledgerId, `${todayStr().slice(0, 7)}-01`, `${todayStr().slice(0, 7)}-31`);
  const statMap = new Map(stats.map((s) => [Number(s.id), s]));
  api.ok(res, {
    members: members.map((m) => ({ ...m, stat: statMap.get(Number(m.user_id)) || { cnt: 0, expense: 0, income: 0 } })),
    invites,
  });
}));

router.post('/members/invite', auth.requireLogin, auth.requireLedgerManage, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const role = ['viewer', 'member', 'admin'].includes(req.body.role) ? req.body.role : 'member';
  const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 90);
  const code = u.uid(20);
  const expires = u.addDays(todayStr(), days);
  const info = run(
    'INSERT INTO ledger_invites (ledger_id, code, role, created_by, expires_at, created_at) VALUES (?,?,?,?,?,?)',
    ledgerId, code, role, req.session.userId, expires, nowStr()
  );
  auth.audit(req, 'member.invite', { ledgerId, detail: `${role} 有效期至 ${expires}` });
  api.created(res, {
    id: info.lastInsertRowid, code, role, expires_at: expires,
    invite_url: `${req.protocol}://${req.get('host')}/join/${code}`,
  });
}));

router.patch('/members/:id(\\d+)', auth.requireLogin, auth.requireLedgerManage, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const m = get('SELECT * FROM ledger_members WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!m) return api.notFound(res, '成员不存在');
  if (m.role === 'owner') return api.forbidden(res, '拥有者角色不可修改');
  const role = ['viewer', 'member', 'admin'].includes(req.body.role) ? req.body.role : m.role;
  run('UPDATE ledger_members SET role = ?, nickname = ? WHERE id = ?', role, req.body.nickname ? String(req.body.nickname).slice(0, 20) : null, id);
  api.saved(res, '已更新');
}));

router.delete('/members/:id(\\d+)', auth.requireLogin, auth.requireLedgerManage, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const m = get('SELECT * FROM ledger_members WHERE id = ? AND ledger_id = ?', id, ledgerId);
  if (!m) return api.notFound(res, '成员不存在');
  if (m.role === 'owner') return api.forbidden(res, '不能移除账本拥有者');
  run('DELETE FROM ledger_members WHERE id = ?', id);
  auth.audit(req, 'member.remove', { ledgerId });
  api.deleted(res, '已移出');
}));

router.delete('/members/invites/:id(\\d+)', auth.requireLogin, auth.requireLedgerManage, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const id = Number(req.params.id);
  const inv = get('SELECT * FROM ledger_invites WHERE id = ? AND ledger_id = ? AND used_by IS NULL', id, ledgerId);
  if (!inv) return api.notFound(res, '邀请码不存在或已使用');
  run('DELETE FROM ledger_invites WHERE id = ?', inv.id);
  auth.audit(req, 'invite.revoke', { entity: 'invite', entityId: inv.id, ledgerId });
  api.deleted(res, '已吊销');
}));

/* ============================================ 导入 / 导出 ============================================ */
const previewCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of previewCache) if (now - v.createdAt > 30 * 60 * 1000) previewCache.delete(k);
}, 5 * 60 * 1000).unref?.();

router.get('/import/jobs', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const jobs = all('SELECT * FROM import_jobs WHERE ledger_id = ? ORDER BY id DESC LIMIT 20', ledgerId);
  api.ok(res, { items: jobs, accounts: fd.accounts(ledgerId) });
}));

router.post('/import/preview', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const { dataUrl, fileName } = req.body;
  const m = /^data:.*?;base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return api.badRequest(res, '请选择 CSV 账单文件');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 20 * 1024 * 1024) return api.badRequest(res, '文件请小于 20MB');
  const parsed = importer.parseBill(buf);
  if (parsed.error) return api.badRequest(res, parsed.error);
  const token = u.uid(24);
  previewCache.set(token, {
    records: parsed.records, neutralRecords: parsed.neutralRecords || [],
    source: parsed.source, fileName: fileName || 'bill.csv', encoding: parsed.encoding,
    createdAt: Date.now(), ledgerId, userId: req.session.userId,
  });
  const cats = fd.flatCategories(ledgerId);
  const guessCat = (r) => {
    if (r.neutral) return '账户间转账（不计收支）';
    const kind = r.type === 'income' ? 'income' : 'expense';
    const direct = r.category_hint ? ai.resolveCategoryId(ledgerId, r.category_hint, kind) : null;
    if (direct) return cats.find((c) => Number(c.id) === Number(direct))?.path || r.category_hint;
    const kw = ai.classifyByKeywords(r.text);
    if (kw) {
      const cid = ai.resolveCategoryId(ledgerId, kw.category, kw.kind === 'income' ? 'income' : kind);
      if (cid) return cats.find((c) => Number(c.id) === Number(cid))?.path || kw.category;
      return kw.category;
    }
    return kind === 'income' ? '其他收入/其他收入' : '其他支出/其他';
  };
  const sample = parsed.records.slice(0, 200).map((r, idx) => ({
    ...r, idx,
    type_label: require('../db').TXN_TYPE_MAP[r.type]?.label || r.type,
    guess_category: guessCat(r),
    guess_account: r.account_hint || '—',
  }));
  const stat = { income: 0, expense: 0, transfer: 0, minDate: null, maxDate: null };
  for (const r of parsed.records) {
    if (r.type === 'income') stat.income += r.amount_cents;
    else if (r.type === 'transfer') stat.transfer += r.amount_cents;
    else stat.expense += r.amount_cents;
    if (!stat.minDate || r.txn_date < stat.minDate) stat.minDate = r.txn_date;
    if (!stat.maxDate || r.txn_date > stat.maxDate) stat.maxDate = r.txn_date;
  }
  const neutralSample = (parsed.neutralRecords || []).slice(0, 20).map((r, i) => ({
    ...r, idx: parsed.records.length + i,
    type_label: require('../db').TXN_TYPE_MAP[r.type]?.label || r.type,
    guess_category: guessCat(r),
    guess_account: r.account_hint || '—',
  }));
  const myLedgers = (res.locals.ledgers || []).filter((l) => auth.canWrite(l.role))
    .map((l) => ({ id: Number(l.id), name: l.name, icon: l.icon, isCurrent: Number(l.id) === ledgerId }));
  api.ok(res, {
    token,
    source: parsed.source,
    sourceLabel: { alipay: '支付宝账单', wechat: '微信支付账单', generic: '通用 CSV' }[parsed.source] || parsed.source,
    encoding: parsed.encoding,
    header: parsed.header,
    count: parsed.records.length,
    skipped: parsed.skipped || 0,
    neutralCount: (parsed.neutralRecords || []).length,
    neutralSample, sample, stat, myLedgers,
  });
}));

router.post('/import/commit', auth.requireLogin, auth.requireLedgerWrite, api.asyncHandler((req, res) => {
  const ledgerId = Number(res.locals.ledger.id);
  const cached = previewCache.get(String(req.body.token || ''));
  if (!cached || cached.ledgerId !== ledgerId) return api.badRequest(res, '预览已过期，请重新上传文件');
  const overridesRaw = req.body.ledger_overrides || {};
  const ledgerOverrides = {};
  for (const [k, v] of Object.entries(overridesRaw)) {
    const idx = Number(k), target = Number(v);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cached.records.length) continue;
    if (!target || target === ledgerId) continue;
    const m = auth.membership(req.session.userId, target);
    if (m && auth.canWrite(m.role)) ledgerOverrides[idx] = target;
  }
  const r = importer.importRecords({
    ledgerId, userId: req.session.userId,
    records: cached.records, neutralRecords: cached.neutralRecords || [],
    includeNeutral: req.body.include_neutral === true || req.body.include_neutral === 'true',
    source: cached.source, fileName: cached.fileName,
    autoCreateAccount: req.body.auto_create_account !== false,
    defaultAccountId: req.body.default_account_id ? Number(req.body.default_account_id) : null,
    ledgerOverrides,
  });
  previewCache.delete(String(req.body.token));
  auth.audit(req, 'import.commit', { ledgerId, detail: `${cached.fileName} 导入 ${r.imported} 笔` });
  api.ok(res, { ...r, redirect: '/import' });
}));

router.get('/export/years', auth.requireLogin, api.asyncHandler((req, res) => {
  const ledger = res.locals.ledger;
  if (!ledger) return api.ok(res, { years: [] });
  const years = all(
    "SELECT DISTINCT substr(txn_date,1,4) AS y FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL ORDER BY y DESC",
    Number(ledger.id));
  api.ok(res, { years: years.map((r) => r.y) });
}));

/* ============================================ 备份 / 恢复 ============================================ */
router.post('/backup/db', auth.requireLogin, auth.requireAdmin, api.asyncHandler((req, res) => {
  // 备份走 SSR 直下载（浏览器 GET 文件流）：JSON 端点仅返回元信息
  const target = path.join(DATA_DIR, `backup-${todayStr()}-${Date.now()}.db`);
  require('../db').db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const stat = fs.statSync(target);
  api.ok(res, { file: path.basename(target), size: stat.size, downloadUrl: '/api/v1/admin/backup/db?download=1' });
}));

router.get('/backup/db', auth.requireLogin, auth.requireAdmin, (req, res) => {
  const target = path.join(DATA_DIR, `backup-${todayStr()}-${Date.now()}.db`);
  require('../db').db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  auth.audit(req, 'backup.download');
  res.download(target, `homeledger-${todayStr()}.db`, (err) => {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    if (err && !res.headersSent) console.error('[backup]', err);
  });
});

router.post('/backup/restore', auth.requireLogin, auth.requireAdmin, api.asyncHandler((req, res) => {
  const m = /^data:.*?;base64,(.+)$/s.exec(String(req.body.dataUrl || ''));
  if (!m) return api.badRequest(res, '请选择 .db 数据库文件');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
    return api.badRequest(res, '文件不是有效的 SQLite 数据库');
  }
  const safety = path.join(DATA_DIR, `pre-restore-${Date.now()}.db`);
  try { fs.copyFileSync(DB_FILE, safety); } catch { /* ignore */ }
  const tmpCheck = path.join(DATA_DIR, `restore-check-${Date.now()}.db`);
  fs.writeFileSync(tmpCheck, buf);
  try {
    const { DatabaseSync } = require('node:sqlite');
    const checkDb = new DatabaseSync(tmpCheck);
    checkDb.exec('PRAGMA integrity_check');
    const hasUsers = checkDb.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='users'").get();
    checkDb.close();
    fs.unlinkSync(tmpCheck);
    if (!hasUsers || !hasUsers.c) return api.badRequest(res, '文件缺少 users 表，不是家账簿数据库');
  } catch (e) {
    try { fs.unlinkSync(tmpCheck); } catch { /* ignore */ }
    return api.badRequest(res, '上传的文件无法打开：' + e.message);
  }
  const newPath = path.join(DATA_DIR, 'restore-new.db');
  fs.writeFileSync(newPath, buf);
  const { reopenDatabase, db: dbHandle } = require('../db');
  try { dbHandle.close(); } catch { /* ignore */ }
  for (const suffix of ['-wal', '-shm']) { try { fs.unlinkSync(DB_FILE + suffix); } catch { /* ignore */ } }
  fs.renameSync(newPath, DB_FILE);
  reopenDatabase();
  try { req.session.destroy(() => {}); } catch { /* ignore */ }
  auth.audit(req, 'backup.restore', { detail: `安全备份：${path.basename(safety)}` });
  api.ok(res, { message: `恢复完成！原数据已备份为 ${path.basename(safety)}。请重新登录。`, reload: true });
}));

/* ============================================ 系统管理 ============================================ */
router.post('/admin/users/:id(\\d+)/action', auth.requireLogin, auth.requireAdmin, api.asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const user = get('SELECT * FROM users WHERE id = ?', id);
  if (!user) return api.notFound(res, '用户不存在');
  const action = req.body.action || '';
  if (id === Number(req.session.userId) && ['disable', 'delete', 'demote'].includes(action)) {
    return api.badRequest(res, '不能对自己执行该操作');
  }
  switch (action) {
    case 'promote':   run('UPDATE users SET is_admin = 1 WHERE id = ?', id); break;
    case 'demote':    run('UPDATE users SET is_admin = 0 WHERE id = ?', id); break;
    case 'disable':   run("UPDATE users SET status = 'disabled' WHERE id = ?", id); run('DELETE FROM sessions WHERE user_id = ?', id); break;
    case 'enable':    run("UPDATE users SET status = 'active' WHERE id = ?", id); break;
    case 'reset': {
      const pw = String(req.body.new_password || '').trim() || ('hl' + u.uid(8));
      run('UPDATE users SET password_hash = ? WHERE id = ?', auth.hashPassword(pw), id);
      run('DELETE FROM sessions WHERE user_id = ?', id);
      api.ok(res, { newPassword: pw });
      return;
    }
    case 'delete': {
      const owned = all('SELECT id, name FROM ledgers WHERE owner_id = ?', id);
      const files = [];
      for (const l of owned) {
        const heir = get(
          `SELECT user_id FROM ledger_members WHERE ledger_id = ? AND user_id != ?
             AND role IN ('admin','member') ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, id LIMIT 1`,
          l.id, id);
        if (heir) {
          run('UPDATE ledgers SET owner_id = ? WHERE id = ?', heir.user_id, l.id);
          run("UPDATE ledger_members SET role = 'owner' WHERE ledger_id = ? AND user_id = ?", l.id, heir.user_id);
        } else {
          tx(() => { files.push(...cascadeDeleteLedger(l.id)); });
        }
      }
      cleanupUploadFiles(files);
      run('DELETE FROM ledger_members WHERE user_id = ?', id);
      run('DELETE FROM sessions WHERE user_id = ?', id);
      run('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ?', nowStr(), id);
      run('DELETE FROM notifications WHERE user_id = ?', id);
      run("UPDATE users SET status = 'disabled', username = username || '_deleted_' || id WHERE id = ?", id);
      if (String(req.body.hard || '') === '1') run('DELETE FROM users WHERE id = ?', id);
      break;
    }
    default: return api.badRequest(res, '未知操作');
  }
  auth.audit(req, 'admin.user_action', { entity: 'user', entityId: id, detail: action });
  api.saved(res, '已执行：' + action);
}));

router.post('/admin/run-scheduler', auth.requireLogin, auth.requireAdmin, api.asyncHandler((req, res) => {
  const r = require('../lib/scheduler').runDaily();
  api.ok(res, { ...r, message: `已执行：周期账单 ${r.recurring} 笔，预算预警 ${r.budgets}，借贷提醒 ${r.debts}，目标提醒 ${r.goals}` });
}));

module.exports = router;
