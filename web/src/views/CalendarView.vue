<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NSpin, NEmpty, NDivider,
  NGrid, NGridItem, NIcon, type DataTableColumns,
} from 'naive-ui'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import StatCard from '@/components/StatCard.vue'
import AmountDisplay from '@/components/AmountDisplay.vue'
import { DashboardApi, TransactionsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPE_MAP } from '@/utils/txnTypes'

const router = useRouter()
const session = useSessionStore()
const { error: toastError } = useFlash()

const loading = ref(true)
const data = ref<any>(null)
const month = ref(dayjs().format('YYYY-MM'))
const selected = ref(dayjs().format('YYYY-MM-DD'))
const categories = ref<any[]>([])
const accounts = ref<any[]>([])

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

async function loadOptions() {
  try {
    const fd = await TransactionsApi.formData()
    accounts.value = fd.accounts
    categories.value = [...(fd.expenseCats || []), ...(fd.incomeCats || [])]
  } catch { /* ignore */ }
}

onMounted(() => { loadOptions(); load() })
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

const totalDays = computed(() => data.value?.cells?.length || 0)
const dayNames = data.value?.weekdays || ['一', '二', '三', '四', '五', '六', '日']

const txnColumns = computed<DataTableColumns>(() => [
  {
    title: '类型', key: 'type', width: 80,
    render: (t: any) => {
      const meta = TXN_TYPE_MAP[t.type]
      return h(NTag, { size: 'small', bordered: false, type: meta?.flow === 'in' ? 'success' : meta?.flow === 'out' ? 'error' : 'default' }, {
        default: () => `${meta?.icon || ''} ${meta?.label || t.type}`,
      })
    },
  },
  { title: '商户/对方', key: 'merchant', ellipsis: true, render: (t: any) => t.merchant || '-' },
  { title: '分类', key: 'category_name', render: (t: any) => `${t.category_icon || ''} ${t.category_name || '-'}`.trim() },
  { title: '账户', key: 'account_name', render: (t: any) => t.account_name || '-' },
  {
    title: '金额', key: 'amount_cents', width: 110, align: 'right',
    render: (t: any) => h(AmountDisplay, {
      cents: t.amount_cents,
      sign: true,
      tone: t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'neutral',
    }),
  },
])

function cellHeat(c: any) {
  if (!c || c.count === 0) return 0
  return Math.min(100, (c.expense / (data.value?.maxExpense || 1)) * 100)
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
      <!-- 月份导航 -->
      <NCard :bordered="true" size="small" class="month-nav">
        <NSpace size="small" align="center" wrap>
          <NButton size="small" @click="prevMonth">‹ 上月</NButton>
          <NButton size="small" @click="today">今</NButton>
          <NButton size="small" @click="nextMonth">下月 ›</NButton>
          <NText class="month-label">{{ data?.monthLabel || month }}</NText>
        </NSpace>
      </NCard>

      <!-- 月度统计 -->
      <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="stats">
        <NGridItem span="4 m:1 l:1">
          <StatCard label="本月收入" icon="💰" :value="data?.monthSummary?.income || 0" tone="income" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="本月支出" icon="💸" :value="data?.monthSummary?.expense || 0" tone="expense" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="本月结余" icon="📊" :value="(data?.monthSummary?.income || 0) - (data?.monthSummary?.expense || 0)" :tone="((data?.monthSummary?.income || 0) - (data?.monthSummary?.expense || 0)) >= 0 ? 'income' : 'expense'" />
        </NGridItem>
        <NGridItem span="4 m:1 l:1">
          <StatCard label="总笔数" icon="📝" :value="data?.monthSummary?.count || 0" tone="neutral" />
        </NGridItem>
      </NGrid>

      <!-- 月历 -->
      <NCard :bordered="true" class="calendar">
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
                <div v-if="c.income > 0" class="income">+{{ (c.income / 100).toFixed(0) }}</div>
                <div v-if="c.expense > 0" class="expense">-{{ (c.expense / 100).toFixed(0) }}</div>
              </div>
            </div>
            <div v-else class="day empty"></div>
          </template>
        </div>
      </NCard>

      <!-- 选中日详情 -->
      <NCard :bordered="true" class="day-detail" :title="`📅 ${selected} 的交易`">
        <NEmpty v-if="!data?.selectedRows?.length" description="这一天还没有交易" />
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
              <div class="title">{{ t.merchant || TXN_TYPE_MAP[t.type]?.label || t.note || '交易' }}</div>
              <div class="sub">
                <span>{{ t.category_name || '未分类' }}</span>
                <span class="dot">·</span>
                <span>{{ t.account_name || '未指定' }}</span>
                <span v-if="t.member_display_name" class="dot">·</span>
                <span v-if="t.member_display_name">{{ t.member_display_name }}</span>
              </div>
            </div>
            <div class="amount" :class="TXN_TYPE_MAP[t.type]?.flow">
              <AmountDisplay
                :cents="t.amount_cents"
                :sign="true"
                :tone="t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'neutral'"
              />
            </div>
          </div>
        </div>
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.month-nav { margin-bottom: 12px; }
.month-label { font-size: 16px; font-weight: 500; margin: 0 8px; }
.stats { margin-bottom: 12px; }
.calendar { margin-bottom: 12px; }
.day-detail { margin-bottom: 12px; }

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.dayname {
  text-align: center;
  font-size: 12px;
  color: var(--hl-muted);
  padding: 6px 0;
  font-weight: 500;
}
.day {
  min-height: 70px;
  padding: 6px;
  border: 1px solid var(--hl-border, #e6eaf1);
  border-radius: 4px;
  cursor: pointer;
  background: #fff;
  transition: all .15s;
  position: relative;
  background: linear-gradient(180deg, rgba(229, 72, 77, var(--heat, 0%)) 0%, #fff var(--heat, 0%));
}
.day.empty { background: var(--hl-card-2, #f7f8fb); cursor: default; }
.day:hover:not(.empty) { border-color: var(--hl-primary, #3d6df5); }
.day.today { border-color: var(--hl-primary, #3d6df5); border-width: 2px; }
.day.today .num { color: var(--hl-primary, #3d6df5); font-weight: 600; }
.day.selected { background: var(--hl-primary-2, #e8efff) !important; }
.day .num { font-size: 13px; font-weight: 500; }
.day .info { font-size: 11px; margin-top: 4px; }
.day .income { color: #2a8d3f; }
.day .expense { color: #e5484d; }

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
</style>
