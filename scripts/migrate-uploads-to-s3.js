#!/usr/bin/env node
'use strict';
/**
 * 家账簿 · 附件迁移工具：本地 data/uploads → S3 兼容对象存储（RustFS / MinIO / AWS S3）
 *
 * 用法:
 *   STORAGE_DRIVER=s3 S3_ENDPOINT=http://127.0.0.1:9000 S3_ACCESS_KEY=... S3_SECRET_KEY=... \
 *   node scripts/migrate-uploads-to-s3.js [--dry-run] [--keep-local]
 *
 * 说明:
 *   - 迁移的是 DATA_DIR/uploads/ 下的所有文件（账单截图 + 用户头像），
 *     对象 key 与应用运行时一致（<S3_PREFIX>/<相对路径>），所以迁移完
 *     把 .env 的 STORAGE_DRIVER 改成 s3 即可无缝切换，数据库不用动
 *   - 默认迁移完删除本地副本；加 --keep-local 可保留（占空间但可回退）
 *   - --dry-run 只打印将要迁移的文件，不实际读写对象存储
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const KEEP_LOCAL = args.includes('--keep-local');

if (!process.env.STORAGE_DRIVER) {
  console.error('❌ 请先设置 STORAGE_DRIVER=s3 及 S3_* 连接参数');
  console.error('   示例：STORAGE_DRIVER=s3 S3_ENDPOINT=http://127.0.0.1:9000 node scripts/migrate-uploads-to-s3.js --dry-run');
  process.exit(1);
}
if (process.env.STORAGE_DRIVER !== 's3') {
  console.error(`❌ STORAGE_DRIVER 必须是 s3，当前为「${process.env.STORAGE_DRIVER}」`);
  process.exit(1);
}

// storage.js 只依赖 lib/datarir.js（不连数据库），迁移脚本可以独立跑
const storage = require('../src/lib/storage');

/** 递归列出 uploads 下的所有文件（返回相对路径，用 / 分隔） */
function listFiles(dir, base = dir, out = []) {
  let items = [];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) listFiles(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const localRoot = storage.LOCAL_ROOT;
  if (!fs.existsSync(localRoot)) {
    console.error(`❌ 找不到本地附件目录：${localRoot}`);
    process.exit(1);
  }

  const files = listFiles(localRoot);
  if (!files.length) {
    console.log(`✅ 本地附件目录为空，无需迁移：${localRoot}`);
    return;
  }

  console.log(`本地附件目录：${localRoot}`);
  console.log(`待处理文件：${files.length} 个`);
  console.log(`目标：${storage.describe().target}`);
  if (DRY_RUN) console.log('（--dry-run：只展示，不实际传输）');
  console.log('');

  await storage.init();

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const rel of files) {
    try {
      if (DRY_RUN) {
        console.log(`  [计划] ${rel}`);
        ok++;
        continue;
      }
      const buf = await fs.promises.readFile(path.join(localRoot, rel));
      await storage.put(rel, buf, storage.mimeOf(rel));
      if (!KEEP_LOCAL) {
        try { await fs.promises.unlink(path.join(localRoot, rel)); } catch { /* 已不存在则忽略 */ }
      }
      ok++;
      console.log(`  [完成] ${rel}`);
    } catch (e) {
      failed++;
      console.error(`  [失败] ${rel}：${e.message}`);
    }
  }

  console.log('');
  console.log(`迁移完成：成功 ${ok}，失败 ${failed}，跳过 ${skipped}`);
  if (!DRY_RUN && !KEEP_LOCAL) {
    // 清理空目录
    try { fs.rmSync(localRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  if (!DRY_RUN) {
    console.log('');
    console.log('接下来：把 .env 的 STORAGE_DRIVER 改为 s3 并重启服务即可。');
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error('迁移失败：', e.message);
  process.exit(1);
});
