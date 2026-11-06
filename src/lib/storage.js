'use strict';
/**
 * 账单截图（附件）存储抽象层
 *
 * 两种驱动，由 .env 的 STORAGE_DRIVER 决定：
 *   · local —— 落盘到 DATA_DIR/uploads/（默认，零依赖，备份=拷目录）
 *   · s3    —— S3 兼容对象存储（RustFS / MinIO / AWS S3），
 *              用 AWS SDK for JavaScript v3 接入（RustFS 官方推荐方式）
 *
 * 对外只用「相对 uploads 根目录的路径」标识一个文件（rel），
 * 例如 202601/1737_abc.png、avatars/user-1.png：
 *   local → DATA_DIR/uploads/<rel>
 *   s3    → <bucket>/<S3_PREFIX>/<rel>
 * 库里 attachments.rel_path 存的正是这个 rel，所以切换驱动不用改数据。
 */
const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./datarir');

/* --------------------------------- 配置解析 -------------------------------- */

function envTrue(v, dflt = false) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return dflt;
  return ['true', '1', 'yes', 'on'].includes(s);
}

const DRIVER = String(process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
if (!['local', 's3'].includes(DRIVER)) {
  throw new Error(`[storage] STORAGE_DRIVER 只能是 local 或 s3，当前为「${DRIVER}」`);
}

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'homeledger';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'rustfsadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'rustfsadmin';
// RustFS 默认走 path-style（虚拟主机风格需要额外配置域名）
const S3_FORCE_PATH_STYLE = envTrue(process.env.S3_FORCE_PATH_STYLE, true);
const S3_PREFIX = String(process.env.S3_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');

const LOCAL_ROOT = path.join(DATA_DIR, 'uploads');

/** 扩展名 → Content-Type（代理下发时用；S3 上没有可靠的头信息时兜底） */
const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif',
  avif: 'image/avif',
};

function mimeOf(rel) {
  const ext = String(rel || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/* ---------------------------------- S3 客户端 -------------------------------- */

let s3Client = null;
let s3Ready = null;

/** 延迟加载：local 驱动下完全不引入 AWS SDK */
function client() {
  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: S3_FORCE_PATH_STYLE,
    });
  }
  return s3Client;
}

/** 对象 key = <S3_PREFIX>/<rel> */
function objectKey(rel) {
  const r = normalizeRel(rel);
  if (!r) return null;
  return S3_PREFIX ? `${S3_PREFIX}/${r}` : r;
}

/** 判断是不是「对象不存在」这类错误（不同 SDK 版本字段名不一致，都兜住） */
function isNotFound(err) {
  if (!err) return false;
  const code = err.name || err.Code || err.code;
  if (['NoSuchKey', 'NotFound', 'NoSuchBucket'].includes(code)) return true;
  const status = err.$metadata?.httpStatusCode;
  return status === 404;
}

/* ---------------------------------- 驱动实现 -------------------------------- */

/** rel 归一化：去掉首尾斜杠、统一为 /，并挡掉目录穿越（.. / .） */
function normalizeRel(rel) {
  const s = String(rel == null ? '' : rel).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!s) return null;
  const parts = s.split('/');
  if (parts.some((p) => p === '..' || p === '.' || p === '')) return null;
  return parts.join('/');
}

/** rel → 本地绝对路径（做目录穿越校验），越界返回 null */
function localAbs(rel) {
  const r = normalizeRel(rel);
  if (!r) return null;
  const root = path.resolve(LOCAL_ROOT);
  const abs = path.resolve(root, r);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const localDriver = {
  async put(rel, buf) {
    const abs = localAbs(rel);
    if (!abs) throw new Error('非法的附件路径');
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, buf);
  },
  async get(rel) {
    const abs = localAbs(rel);
    if (!abs) return null;
    try {
      return await fs.promises.readFile(abs);
    } catch {
      return null;
    }
  },
  async getStream(rel) {
    const abs = localAbs(rel);
    if (!abs) return null;
    try {
      await fs.promises.access(abs, fs.constants.R_OK);
      return fs.createReadStream(abs);
    } catch {
      return null;
    }
  },
  async del(rel) {
    const abs = localAbs(rel);
    if (!abs) return false;
    try {
      await fs.promises.unlink(abs);
      return true;
    } catch {
      return false; // 文件可能已被手工删除
    }
  },
  async usage() {
    let total = 0;
    const walk = async (dir) => {
      let items = [];
      try {
        items = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of items) {
        const p = path.join(dir, it.name);
        if (it.isDirectory()) await walk(p);
        else {
          try {
            total += (await fs.promises.stat(p)).size;
          } catch { /* 忽略读取失败的文件 */ }
        }
      }
    };
    await walk(LOCAL_ROOT);
    return total;
  },
};

const s3Driver = {
  async put(rel, buf, mime) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey(rel),
      Body: buf,
      ContentType: mime || mimeOf(rel),
    }));
  },
  async get(rel) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: objectKey(rel) }));
      const body = res.Body;
      if (!body) return null;
      if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
      const chunks = [];
      for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },
  async getStream(rel) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: objectKey(rel) }));
      return res.Body || null;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },
  async del(rel) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: objectKey(rel) }));
    return true;
  },
  async usage() {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    let total = 0;
    let token;
    do {
      const res = await client().send(new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: S3_PREFIX ? `${S3_PREFIX}/` : undefined,
        ContinuationToken: token,
      }));
      for (const o of res.Contents || []) total += Number(o.Size || 0);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return total;
  },
};

const driver = DRIVER === 's3' ? s3Driver : localDriver;

/* ---------------------------------- 对外接口 -------------------------------- */

/** 等待启动自检完成（桶就绪），避免刚启动就写对象时桶还不存在 */
async function ensureReady() {
  if (DRIVER !== 's3') return;
  // init() 尚未被调用时（例如迁移脚本之外的入口）也先补一次自检
  if (!s3Ready) await init();
  if (s3Ready) await s3Ready;
}

/**
 * 启动自检：S3 驱动下确认桶存在（不存在就建一个）。
 * 失败只告警不阻断启动 —— 服务仍可正常提供数据库侧功能，上传时会明确报错。
 */
async function init() {
  if (DRIVER !== 's3') {
    console.log(`[storage] 附件存储：本地目录 ${LOCAL_ROOT}`);
    return;
  }
  if (s3Ready) { await s3Ready; return; }
  // s3Ready 永不 reject：失败信息通过下面 catch 打印，后续请求由 AWS SDK 自己报错
  let failed = false;
  s3Ready = (async () => {
    const { HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
    try {
      await client().send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    } catch (e) {
      if (!isNotFound(e)) throw e;
      await client().send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`[storage] 已创建存储桶 ${S3_BUCKET}`);
    }
  })().catch((e) => {
    failed = true;
    console.error(`[storage] 连接对象存储失败：${e.message}`);
    console.error('[storage] 请检查 .env 中的 S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET');
  });
  await s3Ready;
  if (!failed) {
    console.log(`[storage] 附件存储：S3 兼容对象存储 ${S3_ENDPOINT}（桶 ${S3_BUCKET}，前缀 ${S3_PREFIX || '无'}）`);
  }
}

/** 写一个文件（rel 相对 uploads 根） */
async function put(rel, buf, mime) {
  await ensureReady();
  return driver.put(rel, buf, mime);
}

/** 读一个文件，不存在返回 null */
async function get(rel) {
  await ensureReady();
  return driver.get(rel);
}

/** 读一个文件的可读流（用于 HTTP 下发），不存在返回 null */
async function getStream(rel) {
  await ensureReady();
  return driver.getStream(rel);
}

/** 删一个文件；文件本就不存在也算成功 */
async function del(rel) {
  await ensureReady();
  return driver.del(rel);
}

/** 附件总体积（字节），用于「关于」页统计 */
async function usage() {
  try {
    return await driver.usage();
  } catch {
    return 0;
  }
}

/* --------------------------------- 头像辅助 -------------------------------- */

/** 头像在 uploads 内的相对路径（与 /uploads/avatars/<name> 的访问地址对应） */
function avatarRel(name) {
  return `avatars/${String(name || '').replace(/[\\/]/g, '')}`;
}

/** 写头像 */
async function putAvatar(name, buf) {
  return put(avatarRel(name), buf);
}

/** 删头像（文件本就不存在也算成功） */
async function delAvatar(name) {
  if (!name) return false;
  try {
    return await del(avatarRel(name));
  } catch {
    return false;
  }
}

/** 存储位置的可读描述，给前端展示 */
function describe() {
  if (DRIVER === 's3') {
    return { driver: 's3', target: `对象存储 ${S3_BUCKET}（${S3_ENDPOINT}）`, bucket: S3_BUCKET, endpoint: S3_ENDPOINT };
  }
  return { driver: 'local', target: '服务器的 data/uploads 目录', dir: LOCAL_ROOT };
}

module.exports = {
  DRIVER, LOCAL_ROOT, MIME_BY_EXT,
  init, put, get, getStream, del, usage, describe, mimeOf,
  avatarRel, putAvatar, delAvatar,
  isS3: () => DRIVER === 's3',
};
