'use strict';
/**
 * 数据目录解析
 *
 * SQLite 数据库文件与账单截图附件都放在这里：
 *   - 相对路径按项目根目录解析（不依赖启动时的 cwd）
 *   - 绝对路径原样使用（容器内 /data）
 *
 * 单独成模块，让不需要连数据库的地方（如存储迁移脚本）也能复用同一套解析规则。
 */
const path = require('node:path');

const RAW_DATA_DIR = process.env.DATA_DIR || 'data';
const DATA_DIR = path.isAbsolute(RAW_DATA_DIR)
  ? path.normalize(RAW_DATA_DIR)
  : path.resolve(__dirname, '..', '..', RAW_DATA_DIR);

module.exports = { DATA_DIR, RAW_DATA_DIR };
