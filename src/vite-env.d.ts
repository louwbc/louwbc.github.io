/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare const __APP_VERSION__: string
declare const __APP_BUILD_AT__: string

interface Window {
  __SOLO_RADIO_V3__?: {
    rollbackMigration: () => void
    runMigration: () => Promise<void>
    dumpStorage: () => Record<string, unknown>
  }
}
