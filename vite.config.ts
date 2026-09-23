import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import fs from 'node:fs'
import UnoCSS from '@unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import VueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(
  fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string }

// Vite + Vue 3 + TS + 插件总入口；所有插件在此文件单一位置配置
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || './'

  return {
    base,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_AT__: JSON.stringify(new Date().toISOString())
    },
    plugins: [
      // Vue 3 SFC 编译
      vue(),
      // Vue Devtools 集成（生产自动 tree-shake）
      VueDevTools(),
      // UnoCSS: presetUno + Attributify + 图标（Carbon）
      UnoCSS()
      // TODO(Task 7/11): VitePWA（Node 18 下 workbox-build dynamic require 不支持；启用前升级 Node 或切 injectManifest 策略）
      // VitePWA({
      //   registerType: 'autoUpdate',
      //   injectRegister: 'auto',
      //   manifest: {
      //     name: 'Solo Radio',
      //     short_name: 'Solo',
      //     description: '全球电视 + 全球FM + 统一收藏 · 音频优先',
      //     theme_color: '#f6f7f9',
      //     background_color: '#f6f7f9',
      //     display: 'standalone',
      //     start_url: './',
      //     icons: [{ src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      //   },
      //   workbox: {
      //     globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      //     runtimeCaching: [
      //       { urlPattern: /\/data\/.*\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'solo-data-json' } },
      //       {
      //         urlPattern: ({ url }) => /radio-browser\.info|jsdelivr\.net|unpkg\.com/.test(url.host),
      //         handler: 'NetworkFirst',
      //         options: { cacheName: 'solo-external', networkTimeoutSeconds: 5 }
      //       }
      //     ]
      //   }
      // })
    ],
    build: {
      // rollup 内容哈希；消除 v2 手动 ?v= 时间戳
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia', '@vueuse/core']
          }
        }
      },
      // hls / pdfjs 等大户都在路由内动态 import，首屏 chunk 小
      chunkSizeWarningLimit: 1500
    },
    server: {
      port: 5173,
      fs: { allow: ['.'] }
    },
    test: {
      // vitest 配置（与 jest 兼容 API）
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        thresholds: {
          lines: 60,
          branches: 50,
          functions: 60,
          statements: 60
        }
      }
    }
  }
})
