import { defineStore } from 'pinia'
import { storageGet, storageSet } from '@/storage/index'
import { V3_KEYS } from '@/storage/keys'

// Pomodoro 状态机（Task 9）
// - work(25m) → short break(5m) × N → 每 4 个 work 后 long break(15m)
// - endAtMs epoch 反作弊：刷新页面/关页后用真实时间差计算 remainingMs，不依赖 setInterval 累加
export type PomPhase = 'work' | 'short' | 'long' | 'idle'

export interface PomodoroSettings {
  workMin: number
  shortMin: number
  longMin: number
  cyclesBeforeLong: number
  /** 结束提醒方式（多选） */
  notify: boolean
  beep: boolean
  vibrate: boolean
  /** 蜂鸣 30s 后自动停的截止时间（alarm panel） */
  alarmStopAtMs: number
}

export interface PomodoroState extends PomodoroSettings {
  phase: PomPhase
  completedWork: number
  /** 正在运行或暂停时非 0（epoch ms 截止时间） */
  endAtMs: number
  running: boolean
  /** 暂停时记录剩余时间（ms，避免 resume 时重算为整段） */
  pauseRemainingMs: number
  /** 结束后需要弹窗 + 蜂鸣，直到用户点 ACK 才进下一阶段 */
  awaitingAck: boolean
}

const SETTINGS_DEFAULTS: PomodoroSettings = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  cyclesBeforeLong: 4,
  notify: true,
  beep: true,
  vibrate: true,
  alarmStopAtMs: 0
}

const readInitial = (): PomodoroState => {
  const saved = storageGet<Partial<PomodoroState>>(V3_KEYS.POMODORO, {})
  return { ...SETTINGS_DEFAULTS, ...saved, phase: saved.phase ?? 'idle', completedWork: saved.completedWork ?? 0, endAtMs: saved.endAtMs ?? 0, running: saved.running ?? false, pauseRemainingMs: saved.pauseRemainingMs ?? 0, awaitingAck: saved.awaitingAck ?? false }
}

const DURATIONS: Record<PomPhase, keyof PomodoroSettings | undefined> = {
  work: 'workMin',
  short: 'shortMin',
  long: 'longMin',
  idle: undefined
}

export const usePomodoroStore = defineStore('pomodoro', {
  state: (): PomodoroState => readInitial(),
  getters: {
    /** 反作弊：当前剩余毫秒，基于真实时间差计算（AC-10） */
    remainingMs(s): number {
      if (s.awaitingAck) return 0
      if (!s.running) return s.pauseRemainingMs
      return Math.max(0, s.endAtMs - Date.now())
    },
    totalMs(s): number {
      const k = DURATIONS[s.phase]
      if (!k) return 0
      const mins = s[k] as number
      return mins * 60 * 1000
    }
  },
  actions: {
    _persist() {
      const p: PomodoroState = { ...this.$state }
      storageSet(V3_KEYS.POMODORO, p)
    },
    _nextPhaseAfterWork() {
      this.completedWork += 1
      if (this.completedWork % this.cyclesBeforeLong === 0) return 'long' as const
      return 'short' as const
    },
    _beginPhase(phase: PomPhase) {
      const k = DURATIONS[phase]
      const mins = k ? (this[k] as number) : 0
      this.phase = phase
      this.endAtMs = Date.now() + mins * 60 * 1000
      this.pauseRemainingMs = 0
      this.running = phase !== 'idle'
      this.awaitingAck = false
      this._persist()
    },
    startNext(initial: PomPhase = 'work') {
      if (this.phase === 'idle') { this._beginPhase(initial); return }
      if (this.phase === 'work') this._beginPhase(this._nextPhaseAfterWork())
      else this._beginPhase('work')
    },
    pause() {
      if (!this.running) return
      this.pauseRemainingMs = Math.max(0, this.endAtMs - Date.now())
      this.running = false
      this._persist()
    },
    resume() {
      if (this.running || this.pauseRemainingMs <= 0) return
      this.endAtMs = Date.now() + this.pauseRemainingMs
      this.pauseRemainingMs = 0
      this.running = true
      this._persist()
    },
    stop() {
      this.running = false
      this.pauseRemainingMs = 0
      this.endAtMs = 0
      this.phase = 'idle'
      this.awaitingAck = false
      this._persist()
    },
    skipAckAndNext() {
      this.awaitingAck = false
      this.alarmStopAtMs = 0
      this.startNext()
    },
    /** 到达结束时间由外部 tick/组件调用，触发 awaitingAck + 三模提醒 */
    markCompletedIfDue() {
      if (!this.running) return
      if (Date.now() < this.endAtMs) return
      this.running = false
      this.pauseRemainingMs = 0
      this.awaitingAck = true
      this.alarmStopAtMs = Date.now() + 30 * 1000
      this._persist()
      this._fireNotifications()
    },
    _fireNotifications() {
      if (this.notify && typeof Notification !== 'undefined') {
        const p = Notification.permission
        if (p === 'granted') void new Notification(`番茄钟 · ${this.phase === 'work' ? '专注结束' : '休息结束'}`, { body: '请确认后开始下一段' })
        else if (p === 'default') void Notification.requestPermission().catch(() => {})
      }
      if (this.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([300, 150, 300, 150, 300]) } catch { /* noop */ }
      }
      if (this.beep) this._beep3x300ms()
    },
    _beep3x300ms() {
      try {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        if (!Ctx) return
        const ctx = new Ctx()
        const times = [0, 450 / 1000, 900 / 1000]
        for (const t0 of times) {
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = 880
          const start = ctx.currentTime + t0
          const end = start + 0.3
          g.gain.setValueAtTime(0.0001, start)
          g.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, end)
          osc.connect(g).connect(ctx.destination)
          osc.start(start)
          osc.stop(end + 0.02)
        }
        // 3 声总时长约 1.2s 后关闭
        setTimeout(() => void ctx.close(), 1600)
      } catch { /* noop */ }
    },
    setSetting<K extends keyof PomodoroSettings>(k: K, v: PomodoroSettings[K]) {
      if (k === 'cyclesBeforeLong' || k === 'workMin' || k === 'shortMin' || k === 'longMin') {
        const n = Number(v)
        if (!Number.isFinite(n) || n <= 0) return
        ;(this as unknown as Record<string, unknown>)[k] = Math.round(n)
      } else {
        (this as unknown as Record<string, unknown>)[k] = v
      }
      this._persist()
    }
  }
})
