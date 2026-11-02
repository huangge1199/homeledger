'use strict';
/**
 * 数据层统一入口
 * 支持三种数据库（通过 .env 中 DB_*_ENABLE=true 三选一）：
 *   - SQLite（默认）：Node 内置 node:sqlite，同步驱动
 *   - MySQL / PostgreSQL：mysql2 / pg 异步驱动 + worker 线程同步桥接（src/db/remote.js）
 * 包含：建表、索引、系统分类树种子、系统设置、账户类型常量、余额重算引擎
 */
const fs = require('node:fs');
const path = require('node:path');

/* ------------------------------- 数据目录（共用） ------------------------------ */
/* SQLite 数据库文件与账单截图附件都存这里；相对路径按项目根目录解析，
   绝对路径原样使用（容器内 /data） */
const RAW_DATA_DIR = process.env.DATA_DIR || 'data';
const DATA_DIR = path.isAbsolute(RAW_DATA_DIR)
  ? path.normalize(RAW_DATA_DIR)
  : path.resolve(__dirname, '..', RAW_DATA_DIR);
const DB_FILE = path.join(DATA_DIR, 'homeledger.db');

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
} catch (e) {
  console.error(`[db] 无法创建数据目录 ${DATA_DIR}：${e.message}`);
  console.error('[db] 请检查 .env 中的 DATA_DIR 配置（容器部署用 /data，本地运行用 ./data）');
  throw e;
}

/* ------------------------------- 数据库类型解析 ------------------------------- */

function envTrue(v) {
  return ['true', '1', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function resolveDialect() {
  const flags = [
    ['sqlite', process.env.DB_SQLITE_ENABLE],
    ['mysql', process.env.DB_MYSQL_ENABLE],
    ['postgres', process.env.DB_POSTGRES_ENABLE],
  ];
  const enabled = flags.filter(([, v]) => envTrue(v)).map(([k]) => k);
  if (enabled.length === 0) return 'sqlite'; // 未配置时默认 SQLite，兼容老部署
  if (enabled.length > 1) {
    throw new Error(`[db] 只能启用一种数据库，当前同时启用了：${enabled.join('、')}（请检查 .env 中 DB_*_ENABLE 配置）`);
  }
  return enabled[0];
}

function remoteConfig(dialect) {
  const prefix = dialect === 'mysql' ? 'DB_MYSQL' : 'DB_POSTGRES';
  return {
    host: process.env[`${prefix}_HOST`] || '127.0.0.1',
    port: Number(process.env[`${prefix}_PORT`]) || (dialect === 'mysql' ? 3306 : 5432),
    user: process.env[`${prefix}_USER`] || (dialect === 'mysql' ? 'root' : 'postgres'),
    password: process.env[`${prefix}_PASSWORD`] || '',
    database: process.env[`${prefix}_DATABASE`] || 'homeledger',
  };
}

const DIALECT = resolveDialect();
const driver = DIALECT === 'sqlite'
  ? require('./db/sqlite')({ dataDir: DATA_DIR, dbFile: DB_FILE })
  : require('./db/remote')({ dialect: DIALECT, config: remoteConfig(DIALECT) });
const { all, get, run, runBatch, tx } = driver;
console.log(`[db] 数据库类型：${{ sqlite: 'SQLite', mysql: 'MySQL', postgres: 'PostgreSQL' }[DIALECT]}`);

/* ---------------------------------- 小工具 --------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
function nowStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const todayStr = () => nowStr().slice(0, 10);
/** 以「今天」为基准平移 N 天，返回 YYYY-MM-DD（本地时区），用于替代 SQLite 的 date() 函数 */
function dateShift(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** JS 布尔值不能直接绑定进 SQL，统一转换 */
const B = (v) => (v ? 1 : 0);
const N = (v) => (v === undefined || v === null || v === '' ? null : v);

/* -------------------------------- 账户类型常量 ------------------------------- */

const ACCOUNT_TYPES = [
  { key: 'cash', label: '现金', icon: '💵', nature: 'asset' },
  { key: 'debit', label: '储蓄卡', icon: '🏦', nature: 'asset' },
  { key: 'credit', label: '信用卡', icon: '💳', nature: 'liability' },
  { key: 'virtual', label: '虚拟账户（支付宝/微信）', icon: '📱', nature: 'asset' },
  { key: 'prepaid', label: '储值卡/预付', icon: '🎫', nature: 'asset' },
  { key: 'investment', label: '投资账户', icon: '📈', nature: 'asset' },
  { key: 'receivable', label: '应收款（别人欠我）', icon: '📥', nature: 'asset' },
  { key: 'payable', label: '应付款（我欠别人）', icon: '📤', nature: 'liability' },
  { key: 'loan', label: '贷款/负债', icon: '🏚️', nature: 'liability' },
  { key: 'other', label: '其他', icon: '📦', nature: 'asset' },
];
const ACCOUNT_TYPE_MAP = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.key, t]));

/* -------------------------------- 交易类型常量 ------------------------------- */

const TXN_TYPES = [
  { key: 'expense', label: '支出', icon: '💸', color: '#f5222d', flow: 'out', group: '日常' },
  { key: 'income', label: '收入', icon: '💰', color: '#52c41a', flow: 'in', group: '日常' },
  { key: 'transfer', label: '转账', icon: '🔄', color: '#1677ff', flow: 'move', group: '日常' },
  { key: 'lend', label: '借出', icon: '📤', color: '#fa8c16', flow: 'out', group: '借贷' },
  { key: 'borrow', label: '借入', icon: '📥', color: '#fa8c16', flow: 'in', group: '借贷' },
  { key: 'repay_receive', label: '收回借款', icon: '↩️', color: '#13c2c2', flow: 'in', group: '借贷' },
  { key: 'repay_pay', label: '偿还借款', icon: '↪️', color: '#13c2c2', flow: 'out', group: '借贷' },
  { key: 'reimburse', label: '报销入账', icon: '🧾', color: '#722ed1', flow: 'in', group: '报销' },
  { key: 'refund', label: '退款', icon: '↩️', color: '#52c41a', flow: 'in', group: '日常' },
  { key: 'fee', label: '手续费', icon: '🏷️', color: '#8c8c8c', flow: 'out', group: '金融' },
  { key: 'interest', label: '利息收入', icon: '🏦', color: '#52c41a', flow: 'in', group: '金融' },
  { key: 'invest_buy', label: '投资买入', icon: '📉', color: '#1677ff', flow: 'move', group: '投资' },
  { key: 'invest_sell', label: '投资卖出', icon: '📈', color: '#fa541c', flow: 'move', group: '投资' },
  { key: 'adjust', label: '余额调整', icon: '⚖️', color: '#8c8c8c', flow: 'adjust', group: '其他' },
];
const TXN_TYPE_MAP = Object.fromEntries(TXN_TYPES.map((t) => [t.key, t]));
/** 记一笔时最常见的四项，其余收在“更多类型”里 */
const PRIMARY_TXN_TYPES = ['expense', 'income', 'transfer', 'lend'];

/* --------------------------------- 分类种子 -------------------------------- */

const EXPENSE_SEED = [
  ['餐饮', '🍽️', '#ff7a45', ['早餐:🥣', '午餐:🍚', '晚餐:🍜', '外卖:🛵', '零食:🍪', '饮料:🧋', '咖啡:☕', '水果:🍎', '下馆子:🍢', '烟酒:🚬']],
  ['交通', '🚗', '#1677ff', ['公交:🚌', '地铁:🚇', '打车:🚕', '加油:⛽', '停车:🅿️', '过路费:🛣️', '洗车:🚿', '车辆保养:🔧', '车辆维修:🛠️', '车险:🛡️', '年检:📋', '火车:🚄', '飞机:✈️', '共享单车:🚲']],
  ['购物', '🛍️', '#eb2f96', ['日用百货:🧺', '个护清洁:🧴', '家居用品:🛋️', '数码电器:📺', '家纺布艺:🧵', '五金工具:🔨', '礼品:🎁', '其他购物:🛒']],
  ['服饰', '👕', '#f759ab', ['上衣:👕', '裤装:👖', '鞋靴:👟', '内衣袜:🧦', '外套:🧥', '配饰:💍', '箱包:👜', '理发美发:💇']],
  ['居住', '🏠', '#722ed1', ['房租:🏠', '房贷:🏦', '物业费:🏢', '水费:🚰', '电费:💡', '燃气费:🔥', '取暖费:♨️', '宽带费:📶', '家政保洁:🧹', '家电维修:🛠️', '装修:🧱']],
  ['通讯', '📱', '#13c2c2', ['手机话费:📱', '流量充值:🌐', '宽带:📡', '快递邮费:📮', '云服务:☁️']],
  ['娱乐', '🎮', '#fa541c', ['电影:🎬', '游戏:🎮', '演出展览:🎤', '会员订阅:📺', '酒吧:🍺', 'KTV:🎙️', '玩具:🧸', '书籍影音:📚', '旅游门票:🎫']],
  ['医疗健康', '🏥', '#ff4d4f', ['门诊:🩺', '药品:💊', '住院:🛏️', '体检:📋', '牙科:🦷', '眼科:👁️', '保健品:🧴', '医疗器械:🩹', '心理咨询:🧠']],
  ['保险', '🛡️', '#40a9ff', ['重疾险:🛡️', '医疗险:🏥', '寿险:📜', '意外险:⚠️', '车险:🚗', '财产险:🏠', '社保:🏛️', '公积金:🏦']],
  ['教育', '🎓', '#2f54eb', ['学费:🎓', '培训费:📖', '教材文具:📕', '课外班:✏️', '在线课程:💻', '考试报名:📝', '考证:🎯']],
  ['人情往来', '🧧', '#f5222d', ['红包:🧧', '礼金:🎁', '请客:🍻', '孝敬长辈:👴', '随份子:💐', '慈善捐赠:❤️', '送礼:🎀']],
  ['育儿', '🍼', '#fa8c16', ['奶粉:🍼', '尿不湿:🧷', '童装:👶', '玩具:🧸', '早教:🎨', '托育:🏫', '儿童医疗:🏥', '儿童保险:🛡️']],
  ['宠物', '🐾', '#faad14', ['宠物主粮:🥫', '宠物零食:🦴', '宠物医疗:💉', '宠物用品:🧶', '宠物美容:✂️', '宠物寄养:🏠']],
  ['运动健身', '🏀', '#52c41a', ['健身卡:🏋️', '运动装备:👟', '球类:🏀', '场地费:⚽', '户外露营:⛺', '游泳:🏊', '赛事报名:🏅']],
  ['旅行', '✈️', '#08979c', ['机票:✈️', '酒店:🏨', '当地交通:🚗', '景点门票:🎫', '跟团游:🧳', '签证:📄', '旅行购物:🛍️', '旅行保险:🛡️']],
  ['美容护理', '💄', '#eb2f96', ['化妆品:💄', '护肤品:🧴', '美甲:💅', '美容SPA:💆', '医美:✨', '美睫:👁️']],
  ['数码科技', '💻', '#597ef7', ['手机:📱', '电脑:💻', '外设配件:🖱️', '软件购买:💿', '智能家居:🏠', '游戏设备:🕹️', '充电设备:🔌']],
  ['办公经营', '💼', '#1d39c4', ['办公用品:🖇️', '打印耗材:🖨️', '差旅:🧳', '团建:🎉', '软件服务:💻', '广告推广:📣', '设备采购:🖥️', '商务招待:🤝']],
  ['金融支出', '🧾', '#8c8c8c', ['手续费:🧾', '利息支出:💸', '税费:🧮', '罚款违约金:🚨', '信用卡年费:💳', '投资亏损:📉', '兑换损失:💱']],
  ['其他支出', '❓', '#8c8c8c', ['待分类:📦', '丢失:🔍', '其他:❓']],
];

const INCOME_SEED = [
  ['职业收入', '💼', '#52c41a', ['工资:💰', '奖金:🏆', '加班费:⏰', '补贴:🎫', '年终奖:🎊', '提成:📈', '公积金提取:🏛️']],
  ['经营收入', '🏪', '#13c2c2', ['营业收入:🏪', '项目款:📄', '分销分成:🤝', '带货佣金:🛒']],
  ['投资理财', '📈', '#fa541c', ['基金收益:📊', '股票收益:📈', '利息收入:🏦', '理财收益:💹', '债券收益:📜', '黄金收益:🥇', '房租收入:🏘️', '分红:🍰']],
  ['其他收入', '✨', '#722ed1', ['兼职外快:💼', '报销回款:🧾', '退款:↩️', '红包:🧧', '礼金:🎁', '中奖:🎰', '二手闲置:♻️', '保险理赔:🛡️', '赔偿:⚖️', '其他收入:❓']],
];

/* ---------------------------------- 系统设置 -------------------------------- */

const DEFAULT_SETTINGS = {
  'site.name': '家账簿',
  'site.currency': 'CNY',
  // 安全默认：注册默认关闭（NAS 局域网内任何能访问端口的人都可以自助注册并消耗
  // 管理员配置的 AI 额度）。需要开放时设 ALLOW_REGISTER=true 或在设置页勾选。
  'site.allow_register': process.env.ALLOW_REGISTER === 'true' ? 'true' : 'false',
  'ai.enabled': 'false',
  'ai.base_url': 'https://open.bigmodel.cn/api/paas/v4',
  'ai.api_key': '',
  'ai.model': 'glm-4v-flash',
  'ai.vision': 'true',
  'ai.timeout_ms': '90000',
  'ai.auto_save': 'false',
  'security.login_max_fail': '10',
  'security.force_https': 'false',
};

function getSetting(key, def = null) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : def;
}
function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value ?? '')
  );
}
function allSettings() {
  const o = {};
  for (const r of all('SELECT key, value FROM settings')) o[r.key] = r.value;
  return o;
}

/* --------------------------------- 初始化逻辑 -------------------------------- */

function seedSystemCategories() {
  const count = get('SELECT COUNT(*) AS c FROM categories WHERE is_system = 1');
  if (count && Number(count.c) > 0) return;
  tx(() => {
    const insert = (name, kind, parentId, icon, color) =>
      run(
        'INSERT INTO categories (ledger_id, name, kind, parent_id, icon, color, is_system, sort_order) VALUES (NULL,?,?,?,?,?,1,?)',
        name, kind, parentId, icon, color, 0
      ).lastInsertRowid;

    const walk = (seed, kind) => {
      seed.forEach(([top, topIcon, color, children], i) => {
        const pid = insert(top, kind, null, topIcon, color);
        run('UPDATE categories SET sort_order = ? WHERE id = ?', i, pid);
        children.forEach((c, j) => {
          const [cname, cicon] = c.split(':');
          const cid = insert(cname, kind, pid, cicon || topIcon, color);
          run('UPDATE categories SET sort_order = ? WHERE id = ?', j, cid);
        });
      });
    };
    walk(EXPENSE_SEED, 'expense');
    walk(INCOME_SEED, 'income');
  });
}

function seedSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (get('SELECT key FROM settings WHERE key = ?', k) === undefined) setSetting(k, v);
  }
}

function seedExchangeRates() {
  const c = get('SELECT COUNT(*) AS c FROM exchange_rates');
  if (c && Number(c.c) > 0) return;
  const list = [
    ['USD', 'CNY', 7.15], ['EUR', 'CNY', 7.8], ['HKD', 'CNY', 0.92],
    ['JPY', 'CNY', 0.047], ['GBP', 'CNY', 9.1], ['KRW', 'CNY', 0.0052],
    ['SGD', 'CNY', 5.35], ['AUD', 'CNY', 4.7], ['CAD', 'CNY', 5.2], ['TWD', 'CNY', 0.22],
  ];
  tx(() => {
    for (const [b, q, r] of list) {
      // ON CONFLICT upsert 写法 SQLite ≥3.24 / PostgreSQL 原生支持；MySQL 由驱动层翻译
      run(
        'INSERT INTO exchange_rates (base, quote, rate, noted_at) VALUES (?,?,?,?) ' +
        'ON CONFLICT(base, quote) DO UPDATE SET rate = excluded.rate, noted_at = excluded.noted_at',
        b, q, r, todayStr()
      );
    }
  });
}

/** 为新账本创建默认账户 */
function createDefaultAccounts(ledgerId, currency = 'CNY', userId) {
  const presets = [
    ['现金', 'cash', '💵'],
    ['支付宝', 'virtual', '📱'],
    ['微信钱包', 'virtual', '💬'],
    ['银行卡', 'debit', '🏦'],
    ['信用卡', 'credit', '💳'],
  ];
  tx(() => {
    presets.forEach(([name, type, icon], i) => {
      run(
        `INSERT INTO accounts (ledger_id, name, type, icon, currency, initial_cents, balance_cents, sort_order, created_at)
         VALUES (?,?,?,?,?,0,0,?,?)`,
        ledgerId, name, type, icon, currency, i, nowStr()
      );
    });
  });
}

/** 账本默认成员（拥有者） */
function addLedgerMember(ledgerId, userId, role = 'member', nickname = null) {
  run(
    `INSERT INTO ledger_members (ledger_id, user_id, role, nickname, joined_at) VALUES (?,?,?,?,?)
     ON CONFLICT(ledger_id, user_id) DO UPDATE SET role = excluded.role`,
    ledgerId, userId, role, nickname, nowStr()
  );
}

/** 新用户注册后自动给一个默认账本 */
function createDefaultLedger(userId, displayName) {
  const id = run(
    `INSERT INTO ledgers (name, kind, currency, icon, color, owner_id, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    `${displayName}的账本`, 'personal', getSetting('site.currency', 'CNY'), '📒', '#4f7cff', userId, '注册时自动创建', nowStr()
  ).lastInsertRowid;
  addLedgerMember(id, userId, 'owner');
  createDefaultAccounts(id, getSetting('site.currency', 'CNY'), userId);
  return id;
}

/* ------------------------------- 余额重算引擎 -------------------------------- */

/**
 * 单笔交易对账户余额的影响（返回 [{accountId, delta}]）
 * 所有金额均为「分」
 */
function txnEffects(t) {
  const a = t.amount_base_cents;
  const out = [];
  const push = (id, d) => { if (id) out.push({ accountId: Number(id), delta: d }); };
  switch (t.type) {
    case 'expense':
    case 'lend':
    case 'repay_pay':
    case 'fee':
      push(t.account_id, -a);
      break;
    case 'income':
    case 'borrow':
    case 'repay_receive':
    case 'reimburse':
    case 'refund':
    case 'interest':
      push(t.account_id, a);
      break;
    case 'transfer':
      push(t.account_id, -a);
      push(t.to_account_id, a);
      break;
    case 'invest_buy':
      // 资金从出资账户流向投资账户
      push(t.account_id, -a);
      push(t.to_account_id, a);
      break;
    case 'invest_sell':
      push(t.to_account_id || t.account_id, -a);
      push(t.account_id, a);
      break;
    case 'adjust':
      push(t.account_id, a);
      break;
    default:
      push(t.account_id, -a);
  }
  return out;
}

/** 重算某账本全部账户余额（幂等，写入后调用） */
function recalcBalances(ledgerId) {
  const accounts = all('SELECT id, initial_cents FROM accounts WHERE ledger_id = ?', ledgerId);
  const rows = all(
    'SELECT * FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL',
    ledgerId
  );
  const delta = new Map();
  for (const t of rows) {
    for (const e of txnEffects(t)) {
      delta.set(e.accountId, (delta.get(e.accountId) || 0) + e.delta);
    }
  }
  tx(() => {
    for (const acc of accounts) {
      const v = Number(acc.initial_cents) + (delta.get(Number(acc.id)) || 0);
      run('UPDATE accounts SET balance_cents = ? WHERE id = ?', v, acc.id);
    }
  });
}
/* --------------------------------- 对外导出 -------------------------------- */

let initialized = false;
function init() {
  if (initialized) return;
  seedSystemCategories();
  seedSettings();
  seedExchangeRates();
  initialized = true;
  // 清理过期会话
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}

module.exports = {
  dialect: DIALECT,
  db: driver.db, all, get, run, runBatch, tx, prep: driver.prep,
  DATA_DIR, DB_FILE, nowStr, todayStr, dateShift, B, N,
  tableColumns: driver.tableColumns, ensureColumn: driver.ensureColumn, reopenDatabase: driver.reopenDatabase,
  ACCOUNT_TYPES, ACCOUNT_TYPE_MAP,
  TXN_TYPES, TXN_TYPE_MAP, PRIMARY_TXN_TYPES,
  getSetting, setSetting, allSettings,
  init, seedSystemCategories,
  createDefaultLedger, createDefaultAccounts, addLedgerMember,
  txnEffects, recalcBalances,
};
