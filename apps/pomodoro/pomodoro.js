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

init()

function init() {
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
    saveState()
  }
  refreshUI()
}

function start() {
  if (state.running) return
  state.running = true
  saveState()
  resume()
}

function resume() {
  clearInterval(timer)
  timer = setInterval(tick, 250)
  ui.start.disabled = true
  ui.pause.disabled = false
  refreshUI()
}

function pause() {
  if (!state.running) return
  state.running = false
  clearInterval(timer)
  timer = null
  saveState()
  ui.start.disabled = false
  ui.pause.disabled = true
  refreshUI()
}

function reset() {
  pause()
  state.mode = 'work'
  state.remainingMs = durationForMode('work')
  state.completedWork = 0
  saveState()
  refreshUI()
}

function nextSegment() {
  const endedMode = state.mode
  if (endedMode === 'work') state.completedWork += 1

  state.mode = computeNextMode(endedMode)
  state.remainingMs = durationForMode(state.mode)
  saveState()
  notifySegment(endedMode)
  refreshUI()
}

function tick() {
  state.remainingMs -= 250
  if (state.remainingMs <= 0) {
    state.remainingMs = 0
    saveState()
    nextSegment()
    if (state.running) resume()
    return
  }
  saveState()
  refreshUI()
}

function refreshUI() {
  ui.time.textContent = fmtTime(state.remainingMs)
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
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([120, 80, 120])
  if (state.settings.sound) beep()

  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const title = endedMode === 'work' ? '专注结束' : '休息结束'
  const body = endedMode === 'work' ? '开始休息吧。' : '开始下一段专注吧。'
  try { new Notification(title, { body }) } catch (_) {}
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.05
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.15)
    setTimeout(() => ctx.close().catch(() => {}), 400)
  } catch (_) {}
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
