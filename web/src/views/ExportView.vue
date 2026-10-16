<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NText, NTag, NCheckbox, NSelect, NSpin,
  NDataTable, NAlert, NEmpty, NForm, NFormItem, useMessage, type DataTableColumns,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import { AdminApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const years = ref<string[]>([])
const year = ref<number>(new Date().getFullYear())
const fmt = ref<'csv' | 'json' | 'excel'>('csv')
const inclTransfer = ref(true)
const inclDeleted = ref(false)

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await AdminApi.exportYears()
    years.value = d.years || []
    if (years.value.length && !years.value.includes(String(year.value))) {
      year.value = Number(years.value[0])
    }
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

function buildUrl() {
  const params = new URLSearchParams()
  params.set('year', String(year.value))
  params.set('format', fmt.value === 'excel' ? 'xlsx' : fmt.value)
  if (inclTransfer.value) params.set('incl_transfer', '1')
  if (inclDeleted.value) params.set('incl_deleted', '1')
  return `/export?${params.toString()}`
}

function doExport() {
  if (!year.value) { message.warning('请选择年度'); return }
  window.open(buildUrl(), '_blank')
  success('已生成下载')
}

const yearColumns = computed<DataTableColumns>(() => [
  { title: '年份', key: 'y', width: 80 },
  {
    title: '快捷导出', key: 'shortcut', width: 240,
    render: (r: any) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', onClick: () => { year.value = Number(r.y); fmt.value = 'csv'; doExport() } }, { default: () => 'CSV' }),
        h(NButton, { size: 'tiny', onClick: () => { year.value = Number(r.y); fmt.value = 'json'; doExport() } }, { default: () => 'JSON' }),
        h(NButton, { size: 'tiny', onClick: () => { year.value = Number(r.y); fmt.value = 'excel'; doExport() } }, { default: () => 'Excel' }),
      ],
    }),
  },
])
</script>

<template>
  <AppShell>
    <PageHead title="导出数据" sub="按年导出 CSV / JSON / Excel，导入到 Excel / 第三方记账软件" />

    <NSpin :show="loading">
      <NCard :bordered="true" class="form-card" title="📦 导出配置">
        <NForm label-placement="left" label-width="100" :model="{ year, fmt }">
          <NFormItem label="年份">
            <NSelect
              v-model:value="year"
              :options="years.map(y => ({ label: y, value: Number(y) }))"
              placeholder="选择年度"
              style="width: 200px"
            />
          </NFormItem>
          <NFormItem label="格式">
            <NSelect
              v-model:value="fmt"
              :options="[
                { label: 'CSV（通用电子表格）', value: 'csv' },
                { label: 'JSON（程序读取）', value: 'json' },
                { label: 'Excel（xlsx）', value: 'excel' },
              ]"
              style="width: 280px"
            />
          </NFormItem>
          <NFormItem label="包含">
            <NSpace size="large">
              <NCheckbox v-model:checked="inclTransfer">包含转账 / 中性记录</NCheckbox>
              <NCheckbox v-model:checked="inclDeleted">包含已删除交易</NCheckbox>
            </NSpace>
          </NFormItem>
        </NForm>
        <NSpace style="margin-top: 12px">
          <NButton type="primary" @click="doExport">📥 下载 {{ year }} 年</NButton>
        </NSpace>
      </NCard>

      <NCard :bordered="true" class="hist-card" title="📅 有数据的年度">
        <Empty v-if="!loading && !years.length" icon="📅" title="还没有任何交易" />
        <NDataTable v-else :columns="yearColumns" :data="years.map(y => ({ y }))" :pagination="false" size="small" />
      </NCard>

      <NCard :bordered="true" class="info-card" title="📋 导出字段说明">
        <NText depth="3" style="line-height: 1.8">
          每行包含：<strong>日期 / 类型 / 金额 / 币种 / 账户 / 转入账户 / 分类 / 报销 / 商户 / 备注 / 标签 / 成员 / 来源 / 状态</strong>。
          <br>
          适合用 Excel / Numbers / 第三方记账软件打开，字段已与支付宝 / 微信 / 网易有钱等通用格式对齐。
        </NText>
      </NCard>

      <NAlert type="info" :show-icon="true" style="margin-top: 12px">
        导出走的是 SSR 端 <code>/export</code> 接口（向后兼容），所以格式与之前的完全一致。
      </NAlert>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.form-card { margin-bottom: 12px; }
.hist-card { margin-bottom: 12px; }
.info-card { margin-bottom: 12px; }
</style>
