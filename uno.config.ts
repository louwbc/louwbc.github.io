// UnoCSS 配置（与 src/styles/main.css 中的 token 对齐 v2 视觉风格）
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  transformerDirectives
} from 'unocss'

const CARD_R = '16px'
const BTN_R = '12px'
const CHIP_R = '999px'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle'
      }
    })
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      bg: 'var(--bg)',
      panel: 'var(--panel)',
      card: 'var(--card)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      text: 'var(--text)',
      muted: 'var(--muted)',
      border: 'var(--border)',
      accent: 'var(--accent)',
      'accent-border': 'var(--accent-border)',
      'accent-bg': 'var(--accent-bg)',
      'accent-bg-hover': 'var(--accent-bg-hover)',
      danger: 'var(--danger)'
    },
    borderRadius: {
      card: CARD_R,
      btn: BTN_R,
      chip: CHIP_R
    },
    boxShadow: {
      card: 'var(--shadow-card)'
    },
    breakpoints: {
      sm: '520px',
      md: '768px',
      lg: '1024px'
    }
  },
  shortcuts: {
    // 统一卡片（v2 .card + .card-pad 等价）
    'base-card':
      'border border-[var(--border)] bg-card rounded-card shadow-card p-4',
    // 统一按钮（v2 .btn）
    'base-btn':
      'inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-btn border border-[var(--border)] bg-surface text-text no-underline select-none transition active:translate-y-px hover:bg-[var(--surface-2)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-outline)] disabled:opacity-50 disabled:cursor-not-allowed',
    'base-btn-primary':
      'bg-accent text-white border-[var(--accent-border)] hover:bg-[#183a61]',
    'base-btn-danger':
      'bg-danger/10 text-danger border-danger/40 hover:bg-danger/20',
    'base-btn-icon':
      'w-11 h-11 min-w-0 px-0 py-0 text-lg',
    'base-btn-tiny':
      'h-8 min-h-[32px] px-2 py-1 text-xs',
    // 输入
    'base-input':
      'w-full px-3 py-2.5 h-11 rounded-btn border border-[var(--border)] bg-white text-text placeholder:text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-outline)]',
    // 毛玻璃顶栏
    'app-topbar':
      'sticky top-0 z-40 backdrop-blur-md border-b border-[var(--border)]',
    // 版本 chip
    'version-chip':
      'inline-flex items-center justify-center min-h-[24px] px-2 py-1 rounded-chip border border-[var(--accent-border)] bg-[var(--accent-bg)] text-accent text-xs font-bold leading-none whitespace-nowrap'
  },
  safelist: ['i-carbon-home']
})
