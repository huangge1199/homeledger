/**
 * Naive UI 主题 —— 平移自 app.css :root 变量
 * 详见 docs/frontend-migration-to-vue3-naiveui.md 第 3 节
 */
import type { GlobalThemeOverrides } from 'naive-ui'
import { palette, radii, shadows } from './tokens'

const common = {
  common: {
    primaryColor: palette.brand.primary,
    primaryColorHover: '#5478ff',
    primaryColorPressed: palette.brand.primaryDeep,
    primaryColorSuppl: palette.brand.primary,
    infoColor: palette.semantic.info,
    successColor: palette.semantic.income,
    warningColor: palette.semantic.warn,
    errorColor: palette.semantic.expense,
    borderRadius: radii.md,
    borderRadiusSmall: radii.sm,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
  },
  Card: {
    borderRadius: radii.md,
    paddingMedium: '18px 20px',
  },
  Button: {
    borderRadiusMedium: radii.sm,
  },
} satisfies GlobalThemeOverrides

export const lightThemeOverrides: GlobalThemeOverrides = {
  ...common,
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  ...common,
}
