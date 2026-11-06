'use strict';
/**
 * 账单截图附件
 *
 * 职责：把前端/外部工具传来的 dataURL 图片落盘、写入 attachments 表，
 * 并在记账成功后把附件关联到对应交易（txn_id）。
 *
 * 两条链路共用本模块，避免行为分叉：
 *   · 网页端  POST /api/ai/scan  → POST /api/ai/confirm
 *   · 开放 API POST /api/open/ai/bill（小龙虾等）
 *
 * 存储：由 src/lib/storage.js 决定放哪（本地 DATA_DIR/uploads 或 S3 兼容对象存储 RustFS）。
 * 库里 attachments.rel_path 只记「相对 uploads 根目录的路径」（如 202601/xxx.png），
 * 两种存储方式共用同一套路径语义，切换驱动不用改数据。
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { all, get, run, nowStr, todayStr } = require('../db');
const { uid } = require('./util');
const storage = require('./storage');

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 单张 8MB
const MAX_IMAGES = 6;

/** 附件在网页端的访问地址（统一走 /uploads，由 server.js 按存储驱动分流下发） */
const webUrl = (rel) => `/uploads/${String(rel).split(path.sep).join('/')}`;

/**
 * 解析 dataURL → { mime, buf }
 * 非法时抛错（错误信息面向用户，可直接展示）
 */
function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || '').trim());
  if (!m) throw new Error('图片格式无法识别（需要 data:image/...;base64,xxx）');
  const mime = m[1].toLowerCase().split(';')[0];
  // 只接受白名单位图格式：SVG 可内嵌脚本，若允许上传，
  // 经 /uploads 与 /api/open/attachments 回显时会在同源执行任意 JS（存储型 XSS）
  if (!MIME_EXT[mime]) {
    if (mime.startsWith('image/')) throw new Error(`不支持的图片类型：${mime}（SVG 存在脚本风险，已禁止）`);
    throw new Error(`不支持的图片类型：${mime}`);
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new Error('图片内容为空');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('单张图片请小于 8MB');
  return { mime, buf };
}

/** 图片内容 sha256（十六进制）：用来识别「是不是同一张图」 */
function contentHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** DB 行 → 对外统一结构（前端/接口只认这几个字段） */
function publicRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    rel: row.rel_path,
    url: webUrl(row.rel_path),
    size: row.size,
    mime: row.mime,
    file_name: row.file_name,
  };
}

/**
 * 找同账本下内容完全相同、且尚未关联交易的附件。
 *
 * 只复用「未关联」的：已入库的截图属于某笔交易，用户再传同一张图
 * 通常是想记另一笔账，必须新建；而识别失败/未入库的残留附件
 * （txn_id IS NULL）则是重试时该复用的那份。
 */
function findReusable(ledgerId, hash) {
  if (!hash) return null;
  return get(
    `SELECT * FROM attachments
     WHERE ledger_id = ? AND content_hash = ? AND txn_id IS NULL
     ORDER BY id DESC LIMIT 1`,
    Number(ledgerId),
    hash
  );
}

/**
 * 保存一张 dataURL 图片：写入存储 + 写 attachments 行（txn_id 先留空，记账成功后关联）
 *
 * 内容完全相同的图（识别失败后重试、或重复粘贴同一张截图）会复用已有附件：
 * 不再重复写存储、不再重复插库，只把已有那行的 id 返回给调用方。
 * @returns {Promise<{id:number, rel:string, url:string, size:number, mime:string, file_name:string, reused:boolean}>}
 */
async function saveDataUrlImage({ dataUrl, ledgerId, userId, name, kind = 'screenshot', aiStatus = 'pending' }) {
  const { mime, buf } = parseDataUrl(dataUrl);
  const hash = contentHash(buf);

  // 已有同样内容的附件 → 直接复用（先确认文件还在，缺失则补写回去）
  const reused = findReusable(ledgerId, hash);
  if (reused) {
    const stillThere = await storage.get(reused.rel_path);
    if (stillThere) return { ...publicRow(reused), reused: true };
    await storage.put(reused.rel_path, buf, mime);
    return { ...publicRow(reused), reused: true };
  }

  const ext = MIME_EXT[mime] || 'png';
  const ym = todayStr().slice(0, 4) + todayStr().slice(5, 7);
  const fileName = `${Date.now()}_${uid(8)}.${ext}`;
  const rel = `${ym}/${fileName}`;
  await storage.put(rel, buf, mime);

  // 并发兜底：写文件期间另一个请求可能已经插了同样的行，
  // 插库前再查一次，命中就丢掉刚写的文件复用它（此处到 INSERT 之间无 await，Node 单线程下是原子的）
  const again = findReusable(ledgerId, hash);
  if (again) {
    await storage.del(rel);
    return { ...publicRow(again), reused: true };
  }

  const storedName = String(name || fileName).slice(0, 255);
  const info = run(
    `INSERT INTO attachments (ledger_id, txn_id, user_id, kind, file_name, rel_path, mime, size, ai_status, content_hash, created_at)
     VALUES (?,NULL,?,?,?,?,?,?,?,?,?)`,
    Number(ledgerId), Number(userId), kind, storedName, rel, mime, buf.length, aiStatus, hash, nowStr()
  );
  return { ...publicRow({ id: info.lastInsertRowid, rel_path: rel, size: buf.length, mime, file_name: storedName }), reused: false };
}

/**
 * 读回一张已保存附件的 dataURL。
 * 识别失败后重试时用这个：前端不必再把图片传一遍，服务器直接从存储取。
 * @returns {Promise<{dataUrl:string, row:object}|null>}
 */
async function readDataUrl(ledgerId, id) {
  const row = get('SELECT * FROM attachments WHERE id = ? AND ledger_id = ?', Number(id), Number(ledgerId));
  if (!row) return null;
  const buf = await storage.get(row.rel_path);
  if (!buf) return null;
  const mime = row.mime && MIME_EXT[row.mime] ? row.mime : storage.mimeOf(row.rel_path);
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, row: publicRow(row) };
}

/**
 * 把附件关联到交易。
 *
 * 一张截图里往往有多笔消费，所以同一张图要挂到多条明细上：
 *   · 图与笔数一致 —— 一一对应（一图一笔）
 *   · 图比笔少   —— 每张图挂到全部笔（这张截图就是这几笔的凭证）
 *   · 图比笔多   —— 按顺序轮流挂（多张截图对应多笔，取第 i 张配第 i 笔，多的挂第一笔）
 *
 * attachments.txn_id 记主关联（第一笔），完整关系写在 attachment_txns。
 * @returns {Array<{image_id:number, txn_id:number}>}
 */
function linkImagesToTxns({ ledgerId, imageIds = [], txnIds = [], aiStatus = 'linked' }) {
  const ids = imageIds.map(Number).filter(Boolean);
  const txns = txnIds.map(Number).filter(Boolean);
  if (!ids.length || !txns.length) return [];
  const pairs = [];
  const ledger = Number(ledgerId);

  ids.forEach((aid, i) => {
    // 这张图要关联哪些明细
    const targets = txns.length === ids.length
      ? [txns[i]]
      : (ids.length < txns.length ? txns.slice() : [txns[Math.min(i, txns.length - 1)]]);
    for (const tid of targets) {
      run(
        'INSERT INTO attachment_txns (attachment_id, txn_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING',
        aid, tid, nowStr()
      );
      pairs.push({ image_id: aid, txn_id: tid });
    }
    // 主关联 = 第一笔
    run(
      'UPDATE attachments SET txn_id = ?, ai_status = ? WHERE id = ? AND ledger_id = ?',
      targets[0], aiStatus, aid, ledger
    );
  });
  return pairs;
}

/** 把附件与交易的关联彻底解绑（删交易时调用） */
function unlinkTxns(txnIds = []) {
  const ids = txnIds.map(Number).filter(Boolean);
  if (!ids.length) return;
  run(
    `DELETE FROM attachment_txns WHERE txn_id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );
  // 旧的主关联列也要清，避免残留
  run(
    `UPDATE attachments SET txn_id = NULL WHERE txn_id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );
}

/**
 * 批量查附件（按 txn_id 归组），供列表页显示「有几张图」。
 * 走 attachment_txns 多对多表；老数据只写了 attachments.txn_id，用 LEFT JOIN 兜底。
 */
function listByTxnIds(txnIds = []) {
  const ids = txnIds.map(Number).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  const ph = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT a.id, a.txn_id, a.file_name, a.rel_path, a.mime, a.size, a.ai_status, a.created_at,
            COALESCE(x.txn_id, a.txn_id) AS link_txn_id
     FROM attachment_txns x
     JOIN attachments a ON a.id = x.attachment_id
     WHERE x.txn_id IN (${ph})
     UNION
     SELECT a.id, a.txn_id, a.file_name, a.rel_path, a.mime, a.size, a.ai_status, a.created_at,
            a.txn_id AS link_txn_id
     FROM attachments a
     WHERE a.txn_id IN (${ph}) AND NOT EXISTS (
       SELECT 1 FROM attachment_txns x WHERE x.attachment_id = a.id AND x.txn_id = a.txn_id
     )
     ORDER BY id`,
    ...ids, ...ids
  );
  for (const r of rows) {
    r.url = webUrl(r.rel_path);
    const k = Number(r.link_txn_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/** 单笔交易的附件列表 */
function listByTxn(txnId) {
  const id = Number(txnId);
  const rows = all(
    `SELECT a.id, a.txn_id, a.file_name, a.rel_path, a.mime, a.size, a.ai_status, a.created_at,
            COALESCE(x.txn_id, a.txn_id) AS link_txn_id
     FROM attachment_txns x
     JOIN attachments a ON a.id = x.attachment_id
     WHERE x.txn_id = ?
     UNION
     SELECT a.id, a.txn_id, a.file_name, a.rel_path, a.mime, a.size, a.ai_status, a.created_at,
            a.txn_id AS link_txn_id
     FROM attachments a
     WHERE a.txn_id = ? AND NOT EXISTS (
       SELECT 1 FROM attachment_txns x WHERE x.attachment_id = a.id AND x.txn_id = a.txn_id
     )
     ORDER BY id`,
    id, id
  );
  return rows.map((r) => ({ ...r, url: webUrl(r.rel_path) }));
}

/** { txnId: count } —— 轻量，只数数量 */
function countByTxnIds(txnIds = []) {
  const ids = txnIds.map(Number).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  const ph = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT txn_id, COUNT(*) AS c FROM (
       SELECT x.txn_id FROM attachment_txns x WHERE x.txn_id IN (${ph})
       UNION
       SELECT a.txn_id FROM attachments a
       WHERE a.txn_id IN (${ph}) AND NOT EXISTS (
         SELECT 1 FROM attachment_txns x WHERE x.attachment_id = a.id AND x.txn_id = a.txn_id
       )
     ) t GROUP BY txn_id`,
    ...ids, ...ids
  );
  for (const r of rows) map.set(Number(r.txn_id), Number(r.c));
  return map;
}

/** 给一批交易对象补 attachment_count 字段（原地修改，返回同一数组） */
function attachCounts(items = []) {
  const counts = countByTxnIds(items.map((t) => t && t.id));
  for (const t of items) {
    if (t && t.id != null) t.attachment_count = counts.get(Number(t.id)) || 0;
  }
  return items;
}

function getById(ledgerId, id) {
  const row = get('SELECT * FROM attachments WHERE id = ? AND ledger_id = ?', Number(id), Number(ledgerId));
  if (row) row.url = webUrl(row.rel_path);
  return row || null;
}

/**
 * 打开附件内容流（做目录穿越校验），文件不存在返回 null
 * @returns {Promise<{stream:Readable, row:object}|null>}
 */
async function openFile(ledgerId, id) {
  const row = getById(ledgerId, id);
  if (!row) return null;
  const stream = await storage.getStream(row.rel_path);
  if (!stream) return null;
  return { stream, row };
}

/** 附件回显时的安全 Content-Type：库里记录的 mime 只允许位图白名单，其余按二进制流下发 */
function safeMime(mime) {
  const m = String(mime || '').toLowerCase();
  return MIME_EXT[m] ? m : 'application/octet-stream';
}

/** 删除附件：先删文件再删行（连同多对多关联） */
async function removeById(ledgerId, id) {
  const row = get('SELECT * FROM attachments WHERE id = ? AND ledger_id = ?', Number(id), Number(ledgerId));
  if (!row) return false;
  try { await storage.del(row.rel_path); } catch { /* 文件可能已被手工删除 */ }
  run('DELETE FROM attachment_txns WHERE attachment_id = ?', row.id);
  run('DELETE FROM attachments WHERE id = ?', row.id);
  return true;
}

module.exports = {
  MIME_EXT, MAX_IMAGE_BYTES, MAX_IMAGES,
  webUrl, parseDataUrl, safeMime,
  contentHash, findReusable, readDataUrl,
  saveDataUrlImage, linkImagesToTxns, unlinkTxns,
  listByTxnIds, listByTxn, countByTxnIds, attachCounts,
  getById, openFile, removeById,
};
