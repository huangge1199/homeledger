<script setup lang="ts">
import { computed } from 'vue'
import { NCheckbox, NTag, NText } from 'naive-ui'
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
  tags?: string
  status?: 'pending' | 'cleared'
  is_reimbursable?: number
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
}
const props = withDefaults(defineProps<Props>(), { bulk: false, dense: false })
const emit = defineEmits<{
  'update:selected': [ids: number[]]
  'click-item': [item: TxnItem]
  'click-day': [date: string]
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
  return d.format('MM月DD日')
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
            <span v-if="g.income" class="income">+<AmountDisplay :cents="g.income" :sign="true" tone="income" :small="true" /></span>
            <span v-if="g.expense" class="expense">-<AmountDisplay :cents="g.expense" :sign="true" tone="expense" :small="true" /></span>
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
              <span v-if="t.category_id && t.type !== 'transfer'">{{ t.category_name || t.type_label }}</span>
              <span v-else>{{ t.type === 'transfer' ? '转账' : (t.category_name || t.type_label || '未分类') }}</span>
              <NText v-if="t.category_parent && t.type !== 'transfer'" depth="3" class="parent">{{ t.category_parent }}</NText>
              <NText v-if="t.merchant" depth="2" class="merchant">{{ t.merchant }}</NText>
              <NTag v-if="t.attachment_count" size="tiny" :bordered="false" type="info">📎 {{ t.attachment_count }}</NTag>
            </div>
            <div v-if="t.note || t.tags" class="sub">
              <NText v-if="t.note" depth="3" class="note">{{ t.note }}</NText>
              <NText v-if="t.tags" depth="3" class="tags">
                <template v-for="(tg, i) in tagList(t.tags)" :key="i">
                  <span class="tag">#{{ tg }}</span>
                </template>
              </NText>
            </div>
          </div>
          <div class="amount">
            <span v-if="t.type === 'transfer'" class="transfer">→</span>
            <AmountDisplay
              v-else
              :cents="t.amount_cents"
              :tone="t.is_expense ? 'expense' : t.is_income ? 'income' : 'neutral'"
              :sign="t.is_income || t.is_expense"
            />
            <div v-if="t.is_transfer && t.account_name && t.to_account_name" class="acc-pair">
              {{ t.account_name }} → {{ t.to_account_name }}
            </div>
            <div v-else class="acc">
              <span v-if="t.account_name">{{ t.account_name }}</span>
              <span v-if="t.account_name && itemTime(t)" class="dot-sep">·</span>
              <span v-if="itemTime(t)" class="time">{{ itemTime(t) }}</span>
            </div>
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
}
.main  { flex: 1; min-width: 0; }
.title { display:flex; align-items:center; gap:8px; font-size: 14px; flex-wrap: wrap; }
.title .parent   { font-size: 12px; }
.title .merchant { font-size: 12px; }
.sub  { display:flex; gap: 8px; align-items:center; font-size: 12px; margin-top: 2px; flex-wrap: wrap; }
.sub .tag { margin-right: 4px; color: var(--hl-primary, #3d6df5); }
.amount { text-align: right; font-size: 14px; min-width: 80px; }
.amount .transfer { color: var(--hl-muted); }
.acc, .acc-pair { font-size: 11px; color: var(--hl-muted); margin-top: 2px; }
/* 消费时刻：等宽数字保证纵向对齐 */
.acc .time { font-variant-numeric: tabular-nums; }
.acc .dot-sep { margin: 0 4px; }
</style>
