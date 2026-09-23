import { reactive, readonly } from 'vue'

export interface ToastItem {
  id: number
  message: string
  level: 'info' | 'warn' | 'error' | 'success'
  dismissAt: number
}

let idSeed = 0
const state = reactive<{ items: ToastItem[] }>({ items: [] })

function push(message: string, level: ToastItem['level'], durationMs = 3200): number {
  const id = ++idSeed
  const item: ToastItem = { id, message, level, dismissAt: Date.now() + durationMs }
  state.items.push(item)
  setTimeout(() => {
    const i = state.items.findIndex(x => x.id === id)
    if (i >= 0) state.items.splice(i, 1)
  }, durationMs + 100)
  return id
}

export function useToasts() {
  return readonly({
    items: state.items as readonly ToastItem[],
    show: (msg: string, level: ToastItem['level'] = 'info', durationMs = 3200) => push(msg, level, durationMs),
    info: (m: string, d = 3200) => push(m, 'info', d),
    success: (m: string, d = 3200) => push(m, 'success', d),
    warn: (m: string, d = 3200) => push(m, 'warn', d),
    error: (m: string, d = 6000) => push(m, 'error', d),
    dismiss: (id: number) => {
      const i = state.items.findIndex(x => x.id === id)
      if (i >= 0) state.items.splice(i, 1)
    }
  })
}
