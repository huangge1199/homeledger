<script setup lang="ts">
import { computed } from 'vue'
import { NCheckbox, NTag, NText, NButton, NPopconfirm, NSpace } from 'naive-ui'
import AmountDisplay from './AmountDisplay.vue'
import Empty from './Empty.vue'
import dayjs from 'dayjs'

export interface TxnItem {
  id: number
  txn_date: string
  /** 消费时刻 HH:mm:ss，可空 */
  txn_time?: string | null
  type: string
  type_label?: string
  type_icon?: string
  amount_cents: number
  currency?: string
  is_expense?: boolean
  is_income?: boolean
  is_transfer?: boolean
  category_id?: number | null
  category_name?: string
  category_icon?: string
  category_color?: string
  category_parent?: string
  account_id?: number | null
  account_name?: string
  to_account_name?: string
  merchant?: string
  note?: string
  /** 后端原始：空格分隔的标签名（与老版 txn-list.ejs 对齐） */
  tag_names?: string
  member_name?: string
  status?: 'pending' | 'cleared'
  is_reimbursable?: number
  /** 报销完成时间：有值表示已报销 */
  reimbursed_at?: string | null
  source?: string
  attachment_count?: number
}

interface Group {
  date: string
  income: number
  expense: number
  items: TxnItem[]
}

interface Props {
  groups: Group[]
  /** 是否显示勾选框（用于批量操作） */
  bulk?: boolean
  selected?: number[]
  /** 紧凑模式（行高更小） */
  dense?: boolean
  /** 是否显示行内编辑/删除按钮（与老版 txn-act 对齐） */
  showActions?: boolean
}
const props = withDefaults(defineProps<Props>(), { bulk: false, dense: false, showActions: true })
const emit = defineEmits<{
  'update:selected': [ids: number[]]
  'click-item': [item: TxnItem]
  'click-day': [date: string]
  /** 点击分类名：按该分类筛选（老版 txn-cat 链接） */
  'filter-category': [categoryId: number]
  'edit': [item: TxnItem]
  'delete': [item: TxnItem]
}>()

const tagList = (s: string | undefined): string[] => {
  if (!s) return []
  return String(s).split(/[,，\s]+/).filter(Boolean)
}

function relLabel(date: string) {
  const d = dayjs(date)
  const today = dayjs()
  if (d.isSame(today, 'day')) return '今天'
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  if (d.isSame(today.subtract(2, 'day'), 'day')) return '前天'
  if (d.year() === today.year()) return `${d.month() + 1}月${d.date()}日`
  return `${d.year()}年${d.month() + 1}月${d.date()}日`
}

function toggle(id: number) {
  if (!props.bulk) return
  const cur = new Set(props.selected || [])
  if (cur.has(id)) cur.delete(id)
  else cur.add(id)
  emit('update:selected', Array.from(cur))
}
function toggleDay(g: Group) {
  if (!props.bulk) return
  const cur = new Set(props.selected || [])
  const allSelected = g.items.every((it) => cur.has(it.id))
  for (const it of g.items) {
    if (allSelected) cur.delete(it.id)
    else cur.add(it.id)
  }
  emit('update:selected', Array.from(cur))
}

function categoryBg(c?: string) {
  return c ? `${c}18` : 'var(--hl-card-2, #f7f8fb)'
}

const weekday = computed(() => (d: string) => {
  const w = dayjs(d).day()
  return ['日', '一', '二', '三', '四', '五', '六'][w] || ''
})

/** 消费时刻 HH:mm:ss（后端 txn_time 字段，可能为空） */
function itemTime(t: TxnItem) {
  return t.txn_time || ''
}

/**
 * 行内金额的带符号值：支出取负，保证 AmountDisplay 渲染成「-¥50.00」而非「+¥50.00」
 * （老版 txn-list.ejs 是支出加「-」前缀、收入加「+」前缀，金额本身在库里始终为正）
 */
function signedAmount(t: TxnItem) {
  const cents = Number(t.amount_cents || 0)
  if (t.is_expense) return -Math.abs(cents)
  if (t.is_income) return Math.abs(cents)
  return cents
}

/** source → 老版 chip 标签（与 txn-list.ejs 43-61 行同源） */
const sourceLabel: Record<string, string> = {
  ai_screenshot: 'AI',
  ai_text: 'AI',
  import: '导入',
  recurring: '周期',
  subscription: '订阅',
}
function sourceChip(s?: string) {
  return s ? sourceLabel[s] || '' : ''
}
function isPrimarySource(s?: string) {
  return s === 'ai_screenshot' || s === 'ai_text' || s === 'subscription'
}
</script>

<template>
  <div class="hl-txn-list">
    <template v-if="!groups || !groups.length">
      <Empty icon="🗒️" title="还没有记录" description="点右上角「+ 记一笔」开始，或上传账单截图让 AI 帮你记" />
    </template>
    <template v-else>
      <div v-for="g in groups" :key="g.date" class="day">
        <div class="day-head" @click="bulk && toggleDay(g)">
          <NCheckbox v-if="bulk" :checked="g.items.every(it => (selected || []).includes(it.id))" @update:checked="() => toggleDay(g)" />
          <span class="bold">{{ relLabel(g.date) }}</span>
          <NText depth="3" class="wd">星期{{ weekday(g.date) }}</NText>
          <span class="day-sum">
            <span v-if="g.income" class="income">+<AmountDisplay :cents="g.income" :sign="false" tone="income" :small="true" /></span>
            <span v-if="g.expense" class="expense">-<AmountDisplay :cents="g.expense" :sign="false" tone="expense" :small="true" /></span>
          </span>
        </div>
        <div
          v-for="t in g.items"
          :key="t.id"
          class="row"
          :class="{ pending: t.status === 'pending', dense }"
          @click="emit('click-item', t)"
        >
          <NCheckbox v-if="bulk" :checked="(selected || []).includes(t.id)" @click.stop="toggle(t.id)" @update:checked="() => toggle(t.id)" />
          <div class="ico" :style="{ background: categoryBg(t.category_color) }">{{ t.category_icon || t.type_icon || '·' }}</div>
          <div class="main">
            <div class="title">
              <!-- 分类名（点击按该分类筛选，转账无分类语义保持纯文本） -->
              <a
                v-if="t.category_id && t.type !== 'transfer'"
                class="cat-name"
                href="javascript:void(0)"
                title="查看该分类的全部记录"
                @click.stop="emit('filter-category', t.category_id)"
              >{{ t.category_name || t.type_label }}</a>
              <span v-else>{{ t.type === 'transfer' ? '转账' : (t.category_name || t.type_label || '未分类') }}</span>
              <NText v-if="t.category_parent && t.type !== 'transfer'" depth="3" class="parent">{{ t.category_parent }}</NText>
              <NText v-if="t.merchant" depth="2" class="merchant">{{ t.merchant }}</NText>
              <NText v-if="t.note" depth="3" class="note">{{ t.note }}</NText>
            </div>
            <div class="sub">
              <!-- 转账/投资类显示双边账户 -->
              <NText v-if="t.is_transfer || t.type === 'invest_buy' || t.type === 'invest_sell'" depth="3" class="acc-pair">
                {{ t.account_name || '—' }} → {{ t.to_account_name || '—' }}
              </NText>
              <NText v-else depth="3" class="acc">{{ t.account_name || '未指定账户' }}</NText>
              <template v-if="t.member_name">
                <span class="sep">·</span>
                <NText depth="3" class="member">{{ t.member_name }}</NText>
              </template>
              <!-- 消费时刻（后端 txn_time，可空） -->
              <NText v-if="itemTime(t)" depth="3" class="time">{{ itemTime(t) }}</NText>
              <template v-for="(tg, i) in tagList(t.tag_names)" :key="i">
                <NTag size="tiny" :bordered="false" type="primary" class="tag">{{ tg }}</NTag>
              </template>
              <!-- 报销状态：已报销 / 待报销（老版按 reimbursed_at 区分） -->
              <NTag v-if="t.is_reimbursable" size="tiny" :type="t.reimbursed_at ? 'success' : 'warning'" :bordered="false">
                {{ t.reimbursed_at ? '已报销' : '待报销' }}
              </NTag>
              <NTag v-if="t.status === 'pending'" size="tiny" :bordered="false">待确认</NTag>
              <NTag v-if="t.attachment_count" size="tiny" :bordered="false" type="info" title="已关联账单截图">📎 {{ t.attachment_count }}</NTag>
              <NTag v-if="sourceChip(t.source)" size="tiny" :type="isPrimarySource(t.source) ? 'primary' : 'default'" :bordered="false">{{ sourceChip(t.source) }}</NTag>
            </div>
          </div>
          <!-- 行内操作：与老版 .txn-act 同构（编辑 + 删除），置于金额左侧 -->
          <div v-if="showActions && !bulk" class="act" @click.stop>
            <NButton size="tiny" quaternary title="编辑" aria-label="编辑" @click="emit('edit', t)">
              <span class="ico-btn">✏️</span>
            </NButton>
            <NPopconfirm
              positive-text="删除"
              negative-text="取消"
              @positive-click="emit('delete', t)"
            >
              <template #trigger>
                <NButton size="tiny" quaternary type="error" title="删除" aria-label="删除">
                  <span class="ico-btn">🗑️</span>
                </NButton>
              </template>
              确定要删除「{{ t.merchant || t.category_name || t.type_label || '这条记录' }}」吗？
            </NPopconfirm>
          </div>
          <div class="amount-col">
            <span v-if="t.type === 'transfer'" class="transfer">→</span>
            <AmountDisplay
              v-else
              :cents="signedAmount(t)"
              :tone="t.is_expense ? 'expense' : t.is_income ? 'income' : 'neutral'"
              :sign="t.is_income || t.is_expense"
            />
            <NText v-if="t.currency && t.currency !== 'CNY'" depth="3" class="cur">{{ t.currency }}</NText>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hl-txn-list { display:flex; flex-direction:column; gap:12px; }
.day { display:flex; flex-direction:column; gap:2px; }
.day-head {
  display:flex; align-items:center; gap:8px;
  padding: 8px 4px 4px;
  font-size: 13px; color: var(--hl-text-2, #45516a);
  cursor: default;
}
.day-head .bold { font-weight: 600; }
.day-head .wd   { font-size: 11px; }
.day-head .day-sum { margin-left: auto; display:flex; gap:8px; font-variant-numeric: tabular-nums; }
.day-head .income  { color: var(--hl-income, #12a150); }
.day-head .expense { color: var(--hl-expense, #e5484d); }

.row {
  display:flex; align-items: center; gap: 10px;
  background: #fff;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background .15s;
}
.row:hover { background: var(--hl-card-2, #f7f8fb); }
.row.pending { opacity: .65; }
.row.dense { padding: 6px 10px; }

.ico {
  width: 34px; height: 34px; border-radius: 8px;
  display:flex; align-items:center; justify-content:center;
  font-size: 16px;
  flex: 0 0 auto;
}
.main  { flex: 1; min-width: 0; }
.title { display:flex; align-items:center; gap:6px; font-size: 14px; flex-wrap: wrap; line-height: 1.4; }
/* 老版 a.txn-cat：常态继承文字色，hover 变主色 */
.title .cat-name { font-weight: 500; color: inherit; cursor: pointer; transition: color .12s; }
.title .cat-name:hover { color: var(--hl-primary, #3d6df5); }
.title .parent   { font-size: 12px; }
.title .merchant { font-size: 12px; }
.sub  { display:flex; gap: 6px; align-items:center; font-size: 12px; margin-top: 3px; flex-wrap: wrap; line-height: 1.4; }
.sub .acc, .sub .acc-pair, .sub .member, .sub .note { font-size: 12px; }
.sub .tag { font-size: 11px; }
.sub .sep { color: var(--hl-muted, #b8bfc9); margin: 0 1px; }
.sub .time { font-size: 12px; font-variant-numeric: tabular-nums; }
.amount-col { text-align: right; min-width: 80px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; }
.amount-col .transfer { color: var(--hl-muted); font-size: 16px; }
.amount-col .cur { font-size: 10px; }

/* 行内操作：置于金额左侧，靠右对齐 */
.act { display: flex; gap: 2px; flex: 0 0 auto; opacity: 0; transition: opacity .15s; margin-left: auto; }
.row:hover .act, .row:focus-within .act { opacity: 1; }
.ico-btn { font-size: 13px; line-height: 1; }
</style>
