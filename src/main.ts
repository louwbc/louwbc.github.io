import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'uno.css'
import './styles/main.css'
import { runV2ToV3Migration, rollbackMigration, dumpStorage } from '@/migration/v2-to-v3'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 首次启动执行 schema 迁移（幂等，有标记跳过；AC-14）
void runV2ToV3Migration()

// 开发模式暴露控制台 API（OQ-3 旧版共存期 rollback）
if (import.meta.env.DEV) {
  window.__SOLO_RADIO_V3__ = {
    rollbackMigration,
    runMigration: runV2ToV3Migration,
    dumpStorage
  }
}

app.mount('#app')
