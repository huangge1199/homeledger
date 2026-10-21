<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NText, NSpin,
} from 'naive-ui'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { DashboardApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPE_MAP } from '@/utils/txnTypes'
import { fmtPlain } from '@/utils/money'

const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const month = ref(dayjs().format('YYYY-MM'))
const selected = ref(dayjs().format('YYYY-MM-DD'))

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await DashboardApi.calendar(month.value, selected.value) as any
    data.value = d
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(month, () => load())
watch(selected, () => load())

function prevMonth() { month.value = dayjs(month.value + '-01').subtract(1, 'month').format('YYYY-MM') }
function nextMonth() { month.value = dayjs(month.value + '-01').add(1, 'month').format('YYYY-MM') }
function today() { month.value = dayjs().format('YYYY-MM'); selected.value = dayjs().format('YYYY-MM-DD') }

function pickDate(date: string) {
  if (!date) return
  selected.value = date
  router.replace({ query: { ...router.currentRoute.value.query, date } })
}

const dayNames = computed(() => data.value?.weekdays || ['周日', '周一', '周二', '周三', '周四', '周五', '周六'])

/** 日历格热力强度：老版口径 4% ~ 16% 平铺（随当天支出占本月最大支出的比例） */
function cellHeat(c: any) {
  if (!c || c.count === 0) return 0
  const ratio = Math.min(c.expense / (data.value?.maxExpense || 1), 1)
  return (0.04 + ratio * 0.12) * 100
}

/**
 * 行内金额的带符号值：支出取负，保证 AmountDisplay 渲染成「-¥50.00」而非「+¥50.00」
 * （老版 calendar.ejs 是 is_income 加 +、is_expense 加 -，库里金额恒为正）
 */
function signedAmount(t: any) {
  const cents = Number(t.amount_cents || 0)
  if (t.is_expense) return -Math.abs(cents)
  if (t.is_income) return Math.abs(cents)
  return cents
}

/* ============================== 本月热力分布 ============================== */
/**
 * 日历热力图（对应老版 charts.calendarHeatmap）
 * 用 SVG 直接绘制：格底色按当天支出占本月最大支出的比例加深，今天用主色描边
 */
const HEAT_CELL = 74
const HEAT_GAP = 6
const heatSvg = computed(() => {
  const days: any[] = data.value?.days || []
  if (!days.length) return ''
  const maxExpense = Math.max(...days.map((d) => Number(d.expense || 0)), 1)
  const map = new Map(days.map((d) => [d.date, d]))
  const m = month.value
  const total = dayjs(m + '-01').daysInMonth()
  // 起始星期：与后端 u.firstWeekday 一致（周日=0，与 WEEKDAYS 表头同序）
  const startWd = dayjs(m + '-01').day()
  const cols = 7
  const rows = Math.ceil((startWd + total) / 7)
  const W = cols * HEAT_CELL
  const H = rows * (HEAT_CELL * 0.86 + HEAT_GAP) + 26
  const todayStr = dayjs().format('YYYY-MM-DD')
  const WEEK = ['日', '一', '二', '三', '四', '五', '六']

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" role="img" style="display:block">`
  WEEK.forEach((wd, i) => {
    s += `<text x="${i * HEAT_CELL + HEAT_CELL / 2}" y="12" font-size="12" fill="var(--hl-muted, #7d8aa3)" text-anchor="middle">${wd}</text>`
  })
  for (let i = 0; i < startWd + total; i++) {
    const col = i % 7
    const row = Math.floor(i / 7)
    const dayNum = i - startWd + 1
    if (dayNum < 1 || dayNum > total) continue
    const dateStr = `${m}-${String(dayNum).padStart(2, '0')}`
    const d: any = map.get(dateStr) || { expense: 0, income: 0, count: 0 }
    const x = col * HEAT_CELL + 3
    const y0 = 22 + row * (HEAT_CELL * 0.86 + HEAT_GAP)
    const w = HEAT_CELL - 6
    const h = HEAT_CELL * 0.86
    const intensity = Math.min(Number(d.expense || 0) / maxExpense, 1)
    const bg = Number(d.expense) > 0 ? `rgba(229,72,77,${(0.06 + intensity * 0.16).toFixed(3)})` : ''
    const isToday = dateStr === todayStr
    s += `<rect x="${x}" y="${y0}" width="${w}" height="${h}" rx="8" fill="${bg || 'var(--hl-card-2, #f7f8fb)'}" stroke="${isToday ? 'var(--hl-primary, #3d6df5)' : 'var(--hl-border, #e6eaf1)'}" stroke-width="${isToday ? 1.6 : 1}"/>`
    s += `<text x="${x + 9}" y="${y0 + 17}" font-size="12" font-weight="600" fill="${isToday ? 'var(--hl-primary, #3d6df5)' : 'var(--hl-text-2, #45516a)'}">${dayNum}</text>`
    if (Number(d.count) > 0) {
      s += `<text x="${x + 9}" y="${(y0 + h - 18).toFixed(1)}" font-size="10.5" fill="var(--hl-expense, #e5484d)" font-weight="600">-${fmtPlain(d.expense, Number(d.expense) >= 100000 ? 0 : 2)}</text>`
      if (Number(d.income) > 0) {
        s += `<text x="${x + 9}" y="${(y0 + h - 6).toFixed(1)}" font-size="10.5" fill="var(--hl-income, #12a150)" font-weight="600">+${fmtPlain(d.income, 2)}</text>`
      }
    }
    s += `<title>${relDate(dateStr)} 支出 ${fmtPlain(d.expense)} 收入 ${fmtPlain(d.income)} 共 ${d.count} 笔</title>`
  }
  s += `</svg>`
  return s
})

/* ============================== 本月支出 TOP ============================== */
/** 本月支出最高的 5 天（对应老版 calendar.ejs 的 top5） */
const top5 = computed(() => {
  const days: any[] = data.value?.days || []
  return days
    .slice()
    .sort((a, b) => Number(b.expense || 0) - Number(a.expense || 0))
    .slice(0, 5)
    .filter((d) => Number(d.expense || 0) > 0)
})
const top5Max = computed(() => Math.max(...top5.value.map((d) => Number(d.expense || 0)), 1))

/* ============================== 选中日汇总 ============================== */
/** 选中日标题：相对日期 + 星期（老版 card-head 用 relDate + weekdayOf） */
const selectedTitle = computed(() => relDate(selected.value))
const selectedWeekday = computed(() => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(selected.value).day()])

/** 选中日支出/收入小计（老版 daySum，用 amount_base_cents 累加） */
const daySum = computed(() => {
  const rows: any[] = data.value?.selectedRows || []
  let expense = 0
  let income = 0
  for (const t of rows) {
    const base = Number(t.amount_base_cents || 0)
    if (t.is_expense) expense += base
    if (t.is_income) income += base
  }
  return { expense, income }
})

/** 相对日期（今天 / 昨天 / 前天 / M月D日 / YYYY年M月D日），对齐老版 helpers.relDate */
function relDate(dateStr: string) {
  const d = dayjs(dateStr)
  const today = dayjs()
  if (d.isSame(today, 'day')) return '今天'
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  if (d.isSame(today.subtract(2, 'day'), 'day')) return '前天'
  if (d.year() === today.year()) return `${d.month() + 1}月${d.date()}日`
  return `${d.year()}年${d.month() + 1}月${d.date()}日`
}
</script>

<template>
  <AppShell>
    <PageHead title="日历视图" sub="按月浏览每天的收入与支出">
      <template #actions>
        <NButton @click="router.push(`/transactions?month=${month}`)">📋 列表</NButton>
        <NButton type="primary" @click="$router.push('/transactions/new')">＋ 记一笔</NButton>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <!-- 月份导航：老版 cal-nav —— ‹ 月份标题 › | 本月 | 支出/收入/结余 -->
      <NCard :bordered="true" size="small" class="month-nav">
        <div class="cal-nav">
          <NButton size="small" quaternary class="nav-arrow" title="上个月" @click="prevMonth">‹</NButton>
          <span class="month-label">{{ data?.monthLabel || month }}</span>
          <NButton size="small" quaternary class="nav-arrow" title="下个月" @click="nextMonth">›</NButton>
          <span class="spacer" />
          <NButton size="small" quaternary @click="today">本月</NButton>
          <span class="spacer" />
          <span class="small">支出 <b class="amount expense">{{ fmtPlain(data?.monthSummary?.expense || 0) }}</b></span>
          <span class="small">收入 <b class="amount income">{{ fmtPlain(data?.monthSummary?.income || 0) }}</b></span>
          <span class="small">
            结余
            <b class="amount" :class="(data?.monthSummary?.net ?? 0) >= 0 ? 'income' : 'expense'">
              {{ fmtPlain(data?.monthSummary?.net || 0) }}
            </b>
          </span>
        </div>
      </NCard>

      <!-- 两栏布局：左（日历 + 热力分布） / 右（当日详情 + 支出 TOP） -->
      <div class="grid-main">
        <div class="col-left">
          <!-- 月历 -->
          <NCard :bordered="true" class="calendar">
            <div class="card-head">
              <h2>日历视图</h2>
              <NText depth="3" class="hint">点某一天看当天明细</NText>
            </div>
            <div class="grid">
              <div v-for="(d, i) in dayNames" :key="i" class="dayname">{{ d }}</div>
              <template v-for="(c, idx) in data?.cells || []" :key="idx">
                <div
                  v-if="c"
                  class="day"
                  :class="{
                    today: c.date === dayjs().format('YYYY-MM-DD'),
                    selected: c.date === selected,
                    'has-data': c.count > 0,
                  }"
                  :style="{ '--heat': cellHeat(c) + '%' }"
                  @click="pickDate(c.date)"
                >
                  <div class="num">{{ c.day }}</div>
                  <div v-if="c.count > 0" class="info">
                    <div v-if="c.income > 0" class="income">+{{ fmtPlain(c.income, 2) }}</div>
                    <div v-if="c.expense > 0" class="expense">-{{ fmtPlain(c.expense, c.expense >= 100000 ? 0 : 2) }}</div>
                  </div>
                </div>
                <div v-else class="day empty"></div>
              </template>
            </div>
            <div class="tiny muted foot-tip">颜色越深表示当天支出越多 · 蓝色边框是今天</div>
          </NCard>

          <!-- 本月热力分布 -->
          <NCard :bordered="true" class="heat-card">
            <div class="card-head"><h2>本月热力分布</h2></div>
            <div v-if="!heatSvg" class="empty-tip">本月暂无数据</div>
            <div v-else class="chart-box" v-html="heatSvg" />
          </NCard>
        </div>

        <div class="col-right">
          <!-- 选中日详情 -->
          <NCard :bordered="true" class="day-detail">
            <div class="card-head">
              <h2>{{ selectedTitle }}</h2>
              <NText depth="3" class="hint">{{ selectedWeekday }}</NText>
            </div>
            <div class="day-sum">
              <span class="small">支出 <b class="amount expense">{{ fmtPlain(daySum.expense) }}</b></span>
              <span class="small">收入 <b class="amount income">{{ fmtPlain(daySum.income) }}</b></span>
              <NButton
                v-if="session.canWrite"
                size="small"
                type="primary"
                class="backfill"
                @click="router.push(`/transactions/new?date=${selected}`)"
              >＋ 补记</NButton>
            </div>
            <div v-if="!data?.selectedRows?.length" class="empty">
              <span class="big">📭</span>这天还没有记录
            </div>
            <div v-else class="day-list">
              <div
                v-for="t in data.selectedRows"
                :key="t.id"
                class="row"
                @click="router.push(`/transactions/${t.id}`)"
              >
                <div class="ico" :class="TXN_TYPE_MAP[t.type]?.flow || 'neutral'">
                  {{ TXN_TYPE_MAP[t.type]?.icon || '·' }}
                </div>
                <div class="meta">
                  <div class="title">{{ t.category_name || TXN_TYPE_MAP[t.type]?.label || '未分类' }}</div>
                  <div class="sub">
                    <span>{{ t.account_name || '未指定账户' }}</span>
                    <span v-if="t.merchant" class="dot">·</span>
                    <span v-if="t.merchant">{{ t.merchant }}</span>
                  </div>
                </div>
                <div class="amount" :class="TXN_TYPE_MAP[t.type]?.flow">
                  <AmountDisplay
                    :cents="signedAmount(t)"
                    :sign="t.is_income || t.is_expense"
                    :tone="t.is_expense ? 'expense' : t.is_income ? 'income' : 'neutral'"
                  />
                </div>
              </div>
            </div>
          </NCard>

          <!-- 本月支出 TOP -->
          <NCard :bordered="true" class="top-card">
            <div class="card-head"><h2>本月支出 TOP</h2></div>
            <div v-if="!top5.length" class="empty-tip">本月暂无支出</div>
            <div v-else class="rank-list">
              <div v-for="(d, i) in top5" :key="d.date" class="rank-row">
                <span class="rank-idx">{{ i + 1 }}</span>
                <span class="rank-name">{{ d.date.slice(5) }}</span>
                <span class="rank-track">
                  <i :style="{ width: Math.max((Number(d.expense) / top5Max) * 100, 1.5) + '%', background: '#f5222d' }" />
                </span>
                <span class="rank-val">{{ fmtPlain(d.expense) }}</span>
              </div>
            </div>
          </NCard>
        </div>
      </div>
    </NSpin>
  </AppShell>
</template>

<style scoped>
/* 两栏布局：老版 .grid-main（1.6fr / 1fr），窄屏塌成单栏 */
.grid-main {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.col-left, .col-right { min-width: 0; }
/* 当日详情卡吸附（老版 .card.sticky-side，仅这张卡吸，TOP 卡不吸） */
.day-detail { position: sticky; top: 14px; }
@media (max-width: 1100px) {
  .grid-main { grid-template-columns: 1fr; }
  .day-detail { position: static; }
}

/* 月导航条：老版 .cal-nav */
.month-nav { margin-bottom: 12px; }
.cal-nav {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.cal-nav .spacer { flex: 1; }
.month-label {
  font-size: 16px; font-weight: 700; letter-spacing: -.01em;
  min-width: 110px; text-align: center;
}
.nav-arrow { font-size: 16px; line-height: 1; padding: 0 8px; }
.cal-nav .small { font-size: 12.5px; color: var(--hl-text-2, #45516a); }
.cal-nav .amount { font-weight: 650; font-variant-numeric: tabular-nums; }
.cal-nav .amount.expense { color: var(--hl-expense, #e5484d); }
.cal-nav .amount.income { color: var(--hl-income, #12a150); }

.calendar { margin-bottom: 12px; }
.day-detail { margin-bottom: 12px; }

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.dayname {
  text-align: center;
  font-size: 11.5px;
  color: var(--hl-muted);
  padding: 6px 0;
  font-weight: 600;
}
.day {
  min-height: 62px;
  padding: 6px 7px;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 10px;
  cursor: pointer;
  background: var(--hl-card, #fff);
  transition: border-color .14s, box-shadow .14s, background-color .14s;
  position: relative;
  /* 热力：老版 color-mix 平铺口径，4% ~ 16% 随支出占比加深 */
  background: color-mix(in srgb, var(--hl-expense, #e5484d) var(--heat, 0%), var(--hl-card, #fff));
}
.day.empty { background: transparent; border-color: transparent; cursor: default; }
.day:hover:not(.empty) {
  border-color: var(--hl-primary, #3d6df5);
  box-shadow: 0 0 0 3px var(--hl-primary-2, #e8efff);
}
.day.today { border-color: var(--hl-primary, #3d6df5); border-width: 1.6px; }
.day.today .num { color: var(--hl-primary, #3d6df5); font-weight: 600; }
.day.selected { background: var(--hl-primary-2, #e8efff) !important; }
.day .num { font-size: 12px; font-weight: 600; color: var(--hl-text-2, #45516a); font-variant-numeric: tabular-nums; }
.day .info { font-size: 10.5px; margin-top: 2px; }
.day .income { color: var(--hl-income, #12a150); font-weight: 600; font-variant-numeric: tabular-nums; }
.day .expense { color: var(--hl-expense, #e5484d); font-weight: 600; font-variant-numeric: tabular-nums; }

.day-list { display: flex; flex-direction: column; }
.row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 8px;
  border-bottom: 1px solid var(--hl-border, #e6eaf1);
  cursor: pointer;
  transition: background .15s;
}
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--hl-card-2, #f7f8fb); }
.ico {
  width: 32px; height: 32px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.ico.in { background: #e8f6ed; color: #2a8d3f; }
.ico.out { background: #feefef; color: #e5484d; }
.ico.move, .ico.neutral { background: #f0f1f4; color: #8c8c8c; }
.meta { flex: 1; min-width: 0; }
.title { font-size: 14px; font-weight: 500; }
.sub { font-size: 12px; color: var(--hl-muted); display: flex; gap: 4px; }
.sub .dot { opacity: .5; }
.amount { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.amount.in { color: var(--hl-income); }
.amount.out { color: var(--hl-expense); }

/* 区块标题（老版 .card-head） */
.card-head {
  display: flex; align-items: center; gap: 10px;
  margin: -4px 0 12px;
}
.card-head h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; min-width: 0; }
.card-head .hint { font-size: 12px; color: var(--hl-muted, #7d8aa3); }
.foot-tip { margin-top: 8px; font-size: 11.5px; color: var(--hl-muted, #7d8aa3); }

/* 选中日小计行（老版 .row.between） */
.day-sum {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 12px;
}
.day-sum .small { font-size: 13px; color: var(--hl-text-2, #45516a); }
.day-sum .amount { font-weight: 600; }
.day-sum .amount.expense { color: var(--hl-expense, #e5484d); }
.day-sum .amount.income { color: var(--hl-income, #12a150); }
.day-sum .backfill { margin-left: auto; }

/* 热力图 */
.heat-card { margin-bottom: 12px; }
.chart-box { overflow-x: auto; }

/* 排行条（老版 .rank-row） */
.top-card { margin-bottom: 12px; }
.rank-list { display: flex; flex-direction: column; gap: 8px; }
.rank-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px;
}
.rank-idx { flex: 0 0 16px; color: var(--hl-muted, #b8bfc9); font-size: 11px; text-align: center; }
.rank-name { flex: 0 0 46px; color: var(--hl-text-2, #45516a); font-variant-numeric: tabular-nums; }
.rank-track {
  flex: 1; height: 8px; border-radius: 99px;
  background: var(--hl-card-2, #f7f8fb);
  overflow: hidden; display: block;
}
.rank-track i { display: block; height: 100%; border-radius: 99px; }
.rank-val {
  flex: 0 0 auto; color: var(--hl-text-2, #45516a);
  font-variant-numeric: tabular-nums;
}

.empty-tip {
  padding: 16px; text-align: center;
  font-size: 13px; color: var(--hl-muted, #7d8aa3);
}

/* 空态（老版 .empty） */
.empty {
  text-align: center; padding: 22px 8px;
  font-size: 13px; color: var(--hl-muted, #7d8aa3);
}
.empty .big { font-size: 36px; display: block; margin-bottom: 10px; opacity: .85; }
</style>
