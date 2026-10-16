/**
 * 设计令牌 —— 把原 app.css 的 :root 变量抽到单一事实源
 * 同时供 naive-ui themeOverrides 与组件里的 sx/style 使用
 * 颜色命名沿用旧版（cool gray + 主蓝 + 语义色），保视觉一致
 */

// 颜色（同时支持亮 / 暗主题的 token 集合）
export const palette = {
  brand: {
    primary: '#3d6df5',
    primaryDeep: '#2b56d9',
    primarySoft: '#eaf0ff',
    ring: 'rgba(61, 109, 245, .16)',
  },
  semantic: {
    income: '#12a150',
    incomeSoft: '#e8f8ef',
    expense: '#e5484d',
    expenseSoft: '#feefef',
    warn: '#e8890c',
    warnSoft: '#fdf3e2',
    info: '#2f6fed',
    infoSoft: '#eaf1fe',
    purple: '#7c5cf0',
  },
  neutralLight: {
    bg: '#f3f5f9',
    bgSoft: '#eef1f6',
    card: '#ffffff',
    card2: '#f7f8fb',
    card3: '#f1f3f8',
    border: '#e6eaf1',
    borderStrong: '#d5dbe6',
    text: '#17202e',
    text2: '#45516a',
    muted: '#7d8aa3',
    faint: '#aab4c6',
  },
  neutralDark: {
    bg: '#0d1118',
    bgSoft: '#11161f',
    card: '#151b26',
    card2: '#1a212e',
    card3: '#1f2736',
    border: '#232c3c',
    borderStrong: '#303b4f',
    text: '#e7ecf5',
    text2: '#b6c0d4',
    muted: '#7e8aa2',
    faint: '#5d6980',
  },
} as const

export const radii = {
  sm: '9px',
  xs: '7px',
  md: '14px',
} as const

export const shadows = {
  sm: '0 1px 2px rgba(18, 28, 45, .05)',
  md: '0 2px 6px rgba(18, 28, 45, .05), 0 16px 32px -16px rgba(18, 28, 45, .16)',
  lg: '0 4px 10px rgba(18, 28, 45, .06), 0 24px 56px -20px rgba(18, 28, 45, .28)',
} as const

export const typography = {
  font:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  base: '14px',
} as const

export const layout = {
  topbarHeight: '58px',
  sidebarWidth: '232px',
} as const

export type Palette = typeof palette
