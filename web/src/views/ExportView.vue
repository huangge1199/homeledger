<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import {
  NCard, NButton, NSpace, NText, NTag, NSelect, NSpin, NDataTable, NAlert,
  NForm, NFormItem, NDivider, useMessage, type DataTableColumns,
} from 'naive-ui'
import AppShell from '@/layouts/AppShell.vue'
import PageHead from '@/components/PageHead.vue'
import Empty from '@/components/Empty.vue'
import DatePickerWrap from '@/components/DatePickerWrap.vue'
import { AdminApi, AccountsApi } from '@/api/modules'
import { errorMessage } from '@/api/client'
import { useFlash } from '@/composables/useFlash'
import { useSessionStore } from '@/stores/session'
import { TXN_TYPES } from '@/utils/txnTypes'

const session = useSessionStore()
const { success, error: toastError } = useFlash()
const message = useMessage()

const loading = ref(true)
const years = ref<string[]>([])
const accounts = ref<any[]>([])

const today = dayjs().format('YYYY-MM-DD')
const from = ref(`${dayjs().format('YYYY')}-01-01`)
const to = ref(today)
const txnType = ref('')
const accountId = ref<number | null>(null)

const typeOptions = [
  { label: '全部类型', value: '' },
  ...TXN_TYPES.map((t) => ({ label: t.label, value: t.key as string })),
]
const accountOptions = computed(() => [
  { label: '全部账户', value: null as unknown as number },
  ...accounts.value.map((a: any) => ({ label: a.name, value: a.id as number })),
])

async function load() {
  if (!session.currentLedger) return
  loading.value = true
  try {
    const d = await AdminApi.exportYears()
    years.value = d.years || []
    const a = await AccountsApi.list()
    accounts.value = a?.accounts || []
  } catch (e) {
    toastError(errorMessage(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 老版实存接口：/export/csv?from=&to=&type=&account_id= */
function exportCsv(f = from.value, t = to.value) {
  const params = new URLSearchParams()
  params.set('from', f)
  params.set('to', t)
  if (txnType.value) params.set('type', txnType.value)
  if (accountId.value) params.set('account_id', String(accountId.value))
  window.open(`/export/csv?${params.toString()}`, '_blank')
  success(`正在导出 ${f} ~ ${t} 的账单 CSV`)
}

/** 老版实存接口：/export/json（当前账本全量结构化数据） */
function exportJson() {
  window.open('/export/json', '_blank')
  success('正在导出完整数据 JSON')
}

const yearColumns = computed<DataTableColumns>(() => [
  { title: '年份', key: 'y', width: 90 },
  {
    title: '快捷导出',
    key: 'shortcut',
    render: (r: any) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', onClick: () => exportCsv(`${r.y}-01-01`, `${r.y}-12-31`) }, { default: () => `导出 ${r.y} 年 CSV` }),
        h(NButton, { size: 'tiny', onClick: () => exportJson() }, { default: () => '完整 JSON' }),
      ],
    }),
  },
])

/* --- 数据库文件备份 / 恢复（老版在 export.ejs，不在设置页） --- */
const isAdmin = computed(() => !!session.user?.isAdmin)
const restoreInput = ref<HTMLInputElement | null>(null)
const restoreFileName = ref('')
const restoring = ref(false)
function pickRestore() { restoreInput.value?.click() }
function downloadDbBackup() { window.open(AdminApi.backupDownloadUrl(), '_blank') }
async function onRestoreFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  restoreFileName.value = f.name
  if (!confirm('恢复会覆盖当前全部数据，确定继续？')) {
    input.value = ''
    restoreFileName.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    restoring.value = true
    try {
      const r = await AdminApi.restore(String(reader.result))
      // 后端用 api.ok 返回，提示语在 data.message 里
      success(r?.data?.message || '恢复完成，请重新登录')
      // 老版恢复后会销毁当前会话，需要重新登录
      setTimeout(() => { location.href = '/login' }, 1500)
    } catch (err: any) {
      toastError(errorMessage(err, '恢复失败'))
    } finally {
      restoring.value = false
      input.value = ''
    }
  }
  reader.readAsDataURL(f)
}
</script>

<template>
  <AppShell>
    <PageHead title="导出备份" sub="导出账单 CSV / 完整 JSON，数据库备份与恢复">
      <template #actions>
        <NText depth="3" style="font-size: 12px">当前账本：{{ session.currentLedger?.name }}</NText>
      </template>
    </PageHead>

    <NSpin :show="loading">
      <div class="grid-2">
        <!-- 导出账单 CSV -->
        <NCard :bordered="true" title="📤 导出账单（CSV）">
          <NText depth="3" class="hint">
            导出为 UTF-8 CSV，可直接用 Excel / WPS 打开，也可用于迁移到其他记账软件。
          </NText>
          <NForm label-placement="left" label-width="86" class="csv-form">
            <NFormItem label="起始日期">
              <DatePickerWrap v-model="from" type="date" />
            </NFormItem>
            <NFormItem label="结束日期">
              <DatePickerWrap v-model="to" type="date" />
            </NFormItem>
            <NFormItem label="类型（可选）">
              <NSelect v-model:value="txnType" :options="typeOptions" />
            </NFormItem>
            <NFormItem label="账户（可选）">
              <NSelect v-model:value="accountId" :options="accountOptions" />
            </NFormItem>
          </NForm>
          <NButton type="primary" @click="exportCsv()">📥 下载 CSV</NButton>
        </NCard>

        <!-- JSON + 数据库备份 -->
        <NCard :bordered="true" title="🧾 导出完整数据（JSON）">
          <NText depth="3" class="hint">
            包含当前账本的账户、分类、交易、预算、周期账单、借贷、储蓄目标等全部结构化数据，适合长期归档或二次开发。
          </NText>
          <NButton type="primary" class="mt12" @click="exportJson">下载 JSON</NButton>

          <NDivider />
          <h3 class="sub-title">💾 数据库文件备份</h3>
          <NText depth="3" class="hint">
            下载整个 SQLite 数据库文件。<strong>最推荐的做法</strong>：直接在 NAS 上对 <code>data/</code> 目录做快照或定时复制——整个数据目录就包含了会计数据和账单截图。
          </NText>
          <NSpace class="mt12">
            <NButton v-if="isAdmin" @click="downloadDbBackup">下载 .db 数据库</NButton>
            <NText v-else depth="3" class="hint">仅管理员可下载数据库文件。</NText>
          </NSpace>
        </NCard>
      </div>

      <!-- 有数据的年度 -->
      <NCard :bordered="true" class="hist-card" title="📅 有数据的年度">
        <Empty v-if="!loading && !years.length" icon="📅" title="还没有任何交易" />
        <NDataTable v-else :columns="yearColumns" :data="years.map(y => ({ y }))" :pagination="false" size="small" />
      </NCard>

      <!-- 恢复 -->
      <NCard v-if="isAdmin" :bordered="true" class="info-card" title="♻️ 从备份恢复">
        <template #header-extra>
          <NTag type="warning" size="small" :bordered="false">高风险操作</NTag>
        </template>
        <NAlert type="warning" :show-icon="true" style="margin-bottom: 12px">
          <strong>恢复会覆盖当前全部数据。</strong>系统会自动安全备份当前数据，然后立即切换到你上传的数据库——无需手动替换文件或重启容器。恢复前请务必先下载一份当前数据。
        </NAlert>
        <NSpace align="center">
          <NButton :loading="restoring" @click="pickRestore">选择备份文件</NButton>
          <NText depth="3" class="hint">{{ restoreFileName || '未选择任何文件' }}</NText>
        </NSpace>
        <input ref="restoreInput" type="file" accept=".db,application/octet-stream" style="display: none" @change="onRestoreFile" />
      </NCard>

      <!-- NAS 建议 -->
      <NCard :bordered="true" class="info-card" title="NAS 部署与备份建议">
        <div class="nas">
          <div>1. 用 Docker Compose 部署时把 <code>./data</code> 挂到 NAS 的共享文件夹，例如 <code>/vol1/1000/docker/homeledger/data</code></div>
          <div>2. 在飞牛 NAS 的「备份 / 快照」里对这个目录设置定时任务，例如每天凌晨 3 点</div>
          <div>3. 需要迁移时，把整个 <code>data</code> 目录拷到新设备的同一位置即可，无需额外导入导出</div>
          <div>4. 只恢复账目录数据、不要截图时，可以只拷 <code>homeledger.db</code></div>
        </div>
      </NCard>

      <!-- 字段说明 -->
      <NCard :bordered="true" class="info-card" title="📋 导出字段说明">
        <NText depth="3" style="line-height: 1.8">
          每行包含：<strong>日期 / 类型 / 金额 / 币种 / 账户 / 转入账户 / 分类 / 报销 / 商户 / 备注 / 标签 / 成员 / 来源 / 状态</strong>。
          <br>
          适合用 Excel / Numbers / 第三方记账软件打开，字段已与支付宝 / 微信 / 网易有钱等通用格式对齐。
        </NText>
      </NCard>
    </NSpin>
  </AppShell>
</template>

<style scoped>
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
.csv-form { margin-top: 12px; }
.hint { font-size: 12px; line-height: 1.6; }
.sub-title { font-size: 14px; margin: 0 0 6px; }
.mt12 { margin-top: 12px; }
.hist-card { margin-top: 12px; }
.info-card { margin-top: 12px; }
.nas { line-height: 2; font-size: 12px; color: var(--hl-muted); }
code { background: var(--hl-card-2, #f7f8fb); padding: 1px 4px; border-radius: 3px; }
</style>
