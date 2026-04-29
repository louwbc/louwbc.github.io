const $ = (s) => document.querySelector(s)

const ui = {
  time: $('#time'),
  sub: $('#sub'),
  badge: $('#stateBadge'),
  start: $('#startBtn'),
  pause: $('#pauseBtn'),
  skip: $('#skipBtn'),
  reset: $('#resetBtn'),
  notify: $('#notifyBtn'),
  hint: $('#hint'),
  workMin: $('#workMin'),
  shortMin: $('#shortMin'),
  longMin: $('#longMin'),
  cycles: $('#cycles'),
  sound: $('#sound'),
  vibrate: $('#vibrate')
}

const STORE_KEY = 'pomodoro-v1'

const state = loadState() || {
  mode: 'work',
  running: false,
  remainingMs: 25 * 60 * 1000,
  endAtMs: null,
  completedWork: 0,
  settings: {
    workMin: 25,
    shortMin: 5,
    longMin: 15,
    cycles: 4,
    sound: true,
    vibrate: true
  }
}

let timer = null
let alarm = null
let pendingNotifyMode = null
let pendingNotifyCount = 0

init()

function init() {
  migrateState()
  ui.workMin.value = String(state.settings.workMin)
  ui.shortMin.value = String(state.settings.shortMin)
  ui.longMin.value = String(state.settings.longMin)
  ui.cycles.value = String(state.settings.cycles)
  ui.sound.checked = !!state.settings.sound
  ui.vibrate.checked = !!state.settings.vibrate

  ui.start.addEventListener('click', start)
  ui.pause.addEventListener('click', pause)
  ui.skip.addEventListener('click', nextSegment)
  ui.reset.addEventListener('click', reset)
  ui.notify.addEventListener('click', requestNotify)

  for (const el of [ui.workMin, ui.shortMin, ui.longMin, ui.cycles]) {
    el.addEventListener('input', applySettings)
  }
  ui.sound.addEventListener('change', applySettings)
  ui.vibrate.addEventListener('change', applySettings)

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFromClock(true)
    if (document.hidden) return
    if (pendingNotifyMode) {
      const mode = pendingNotifyMode
      const count = pendingNotifyCount
      pendingNotifyMode = null
      pendingNotifyCount = 0
      notifySegment(mode)
      if (count > 1) ui.hint.textContent = `锁屏/后台期间错过了 ${count} 次切换提醒，已自动校正。`
    }
  })
  window.addEventListener('focus', () => syncFromClock(true))

  refreshUI()
  if (state.running) resume()
  updateNotifyUI()
}

function applySettings() {
  const s = state.settings
  s.workMin = clampInt(ui.workMin.value, 1, 180, 25)
  s.shortMin = clampInt(ui.shortMin.value, 1, 60, 5)
  s.longMin = clampInt(ui.longMin.value, 1, 120, 15)
  s.cycles = clampInt(ui.cycles.value, 2, 12, 4)
  s.sound = ui.sound.checked
  s.vibrate = ui.vibrate.checked
  saveState()
  if (!state.running) {
    state.remainingMs = durationForMode(state.mode)
    state.endAtMs = null
    saveState()
  }
  refreshUI()
}

function start() {
  if (state.running) return
  state.running = true
  state.endAtMs = Date.now() + state.remainingMs
  saveState()
  resume()
}

function resume() {
  clearInterval(timer)
  clearTimeout(alarm)
  timer = setInterval(tick, 250)
  ui.start.disabled = true
  ui.pause.disabled = false
  syncFromClock(false)
  scheduleAlarm()
  refreshUI()
}

function pause() {
  if (!state.running) return
  state.running = false
  state.remainingMs = remainingMs()
  state.endAtMs = null
  clearInterval(timer)
  clearTimeout(alarm)
  timer = null
  alarm = null
  saveState()
  ui.start.disabled = false
  ui.pause.disabled = true
  refreshUI()
}

function reset() {
  pause()
  state.mode = 'work'
  state.remainingMs = durationForMode('work')
  state.endAtMs = null
  state.completedWork = 0
  saveState()
  refreshUI()
}

function nextSegment() {
  const endedMode = state.mode
  if (endedMode === 'work') state.completedWork += 1

  state.mode = computeNextMode(endedMode)
  state.remainingMs = durationForMode(state.mode)
  if (state.running) state.endAtMs = Date.now() + state.remainingMs
  else state.endAtMs = null
  saveState()
  notifySegment(endedMode)
  if (state.running) scheduleAlarm()
  refreshUI()
}

function tick() {
  if (!state.running) return
  syncFromClock(false)
  refreshUI()
}

function refreshUI() {
  ui.time.textContent = fmtTime(remainingMs())
  const label = state.mode === 'work' ? '专注' : (state.mode === 'short' ? '短休息' : '长休息')
  ui.badge.textContent = state.running ? `${label}中` : label
  ui.sub.textContent = `专注 ${state.settings.workMin} 分钟 · 休息 ${state.settings.shortMin} 分钟 · 每 ${state.settings.cycles} 次专注长休息`
  ui.start.disabled = state.running
  ui.pause.disabled = !state.running
}

function computeNextMode(endedMode) {
  if (endedMode === 'work') {
    const n = state.completedWork % state.settings.cycles
    return n === 0 ? 'long' : 'short'
  }
  return 'work'
}

function durationForMode(mode) {
  if (mode === 'work') return state.settings.workMin * 60 * 1000
  if (mode === 'short') return state.settings.shortMin * 60 * 1000
  return state.settings.longMin * 60 * 1000
}

function fmtTime(ms) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function remainingMs() {
  if (state.running && Number.isFinite(state.endAtMs)) {
    return Math.max(0, state.endAtMs - Date.now())
  }
  return Math.max(0, state.remainingMs)
}

function syncFromClock(fromResume) {
  if (!state.running) return
  if (!Number.isFinite(state.endAtMs)) state.endAtMs = Date.now() + Math.max(0, state.remainingMs)

  const now = Date.now()
  if (state.endAtMs > now) return

  let steps = 0
  let firstEndedMode = null
  while (state.running && state.endAtMs <= now && steps < 20) {
    const endedMode = state.mode
    if (!firstEndedMode) firstEndedMode = endedMode
    if (endedMode === 'work') state.completedWork += 1
    state.mode = computeNextMode(endedMode)
    state.remainingMs = durationForMode(state.mode)
    state.endAtMs = now + state.remainingMs
    steps += 1
  }
  saveState()

  if (steps > 0 && firstEndedMode) {
    if (fromResume) {
      ui.hint.textContent = '已从锁屏/后台恢复并自动校正计时。'
      pendingNotifyMode = firstEndedMode
      pendingNotifyCount = steps
    } else {
      notifySegment(firstEndedMode)
    }
    scheduleAlarm()
  }
}

async function requestNotify() {
  if (!('Notification' in window)) {
    ui.hint.textContent = '当前浏览器不支持通知。'
    return
  }
  try {
    const p = await Notification.requestPermission()
    if (p !== 'granted') ui.hint.textContent = '未授予通知权限。'
  } catch (_) {
    ui.hint.textContent = '请求通知权限失败。'
  }
  updateNotifyUI()
}

function updateNotifyUI() {
  if (!('Notification' in window)) {
    ui.notify.disabled = true
    ui.notify.textContent = '不支持提醒'
    return
  }
  const p = Notification.permission
  ui.notify.textContent = p === 'granted' ? '提醒已开启' : '开启提醒'
}

function notifySegment(endedMode) {
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 420])
  if (state.settings.sound) beep(3)

  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const title = endedMode === 'work' ? '专注结束' : '休息结束'
  const body = endedMode === 'work' ? '开始休息吧。' : '开始下一段专注吧。'
  try { new Notification(title, { body }) } catch (_) {}
}

function beep(times) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.05
    o.connect(g)
    g.connect(ctx.destination)
    const n = clampInt(times, 1, 6, 1)
    const dur = 0.12
    const gap = 0.10
    const startAt = ctx.currentTime + 0.01
    o.start(startAt)
    for (let i = 0; i < n; i++) {
      const t0 = startAt + i * (dur + gap)
      g.gain.setValueAtTime(0.0, t0)
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.01)
      g.gain.setValueAtTime(0.05, t0 + dur - 0.02)
      g.gain.linearRampToValueAtTime(0.0, t0 + dur)
    }
    o.stop(startAt + n * (dur + gap))
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch (_) {}
}

function scheduleAlarm() {
  clearTimeout(alarm)
  alarm = null
  if (!state.running) return
  const ms = remainingMs()
  if (ms <= 0) return
  alarm = setTimeout(() => {
    syncFromClock(false)
    refreshUI()
  }, Math.min(ms + 50, 0x7fffffff))
}

function migrateState() {
  if (!state.settings) state.settings = {}
  if (!Number.isFinite(state.remainingMs)) state.remainingMs = durationForMode(state.mode || 'work')
  if (state.running) {
    if (!Number.isFinite(state.endAtMs)) state.endAtMs = Date.now() + Math.max(0, state.remainingMs)
  } else {
    state.endAtMs = null
  }
  saveState()
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v || ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch (_) {}
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) } catch (_) { return null }
}
