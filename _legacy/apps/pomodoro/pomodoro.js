const $ = (s) => document.querySelector(s)

const ui = {
  time: $('#time'),
  sub: $('#sub'),
  badge: $('#stateBadge'),
  alarmPanel: $('#alarmPanel'),
  alarmTitle: $('#alarmTitle'),
  alarmDesc: $('#alarmDesc'),
  ack: $('#ackBtn'),
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
const ALARM_MAX_MS = 30 * 1000

const state = loadState() || {
  mode: 'work',
  running: false,
  remainingMs: 25 * 60 * 1000,
  endAtMs: null,
  completedWork: 0,
  awaitingAck: false,
  awaitEndedMode: null,
  awaitNextMode: null,
  alarmStopAtMs: null,
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
let alarmLoop = null
let alarmAutoStop = null
let alarmNotifiedFor = null
let baseTitle = document.title
let audioCtx = null

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
  ui.ack.addEventListener('click', ackAlarm)

  for (const el of [ui.workMin, ui.shortMin, ui.longMin, ui.cycles]) {
    el.addEventListener('input', applySettings)
  }
  ui.sound.addEventListener('change', applySettings)
  ui.vibrate.addEventListener('change', applySettings)

  window.addEventListener('pointerdown', unlockAudioOnce, { once: true })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFromClock(true)
  })
  window.addEventListener('focus', () => syncFromClock(true))

  refreshUI()
  if (state.awaitingAck) startAlarming(state.awaitEndedMode || state.mode, true)
  else if (state.running) resume()
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
  if (!state.running && !state.awaitingAck) {
    state.remainingMs = durationForMode(state.mode)
    state.endAtMs = null
    saveState()
  }
  refreshUI()
}

function start() {
  if (state.awaitingAck) return
  if (state.running) return
  state.running = true
  state.endAtMs = Date.now() + state.remainingMs
  saveState()
  resume()
}

function resume() {
  clearInterval(timer)
  clearTimeout(alarm)
  stopAlarmLoop()
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
  stopAlarmLoop()
  state.awaitingAck = false
  state.awaitEndedMode = null
  state.awaitNextMode = null
  state.alarmStopAtMs = null
  alarmNotifiedFor = null
  setBaseTitle()
  state.mode = 'work'
  state.remainingMs = durationForMode('work')
  state.endAtMs = null
  state.completedWork = 0
  saveState()
  refreshUI()
}

function nextSegment() {
  if (state.awaitingAck) {
    ackAlarm()
    return
  }
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
  ui.start.disabled = state.running || !!state.awaitingAck
  ui.pause.disabled = !state.running
  ui.skip.disabled = !!state.awaitingAck
  ui.alarmPanel.hidden = !state.awaitingAck
  if (state.awaitingAck) {
    const stopped = Number.isFinite(state.alarmStopAtMs) && Date.now() >= state.alarmStopAtMs
    const endedMode = state.awaitEndedMode || state.mode
    const endedLabel = endedMode === 'work' ? '专注结束' : '休息结束'
    const nextMode = state.awaitNextMode || computeNextMode(endedMode)
    const nextLabel = nextMode === 'work' ? '下一段专注' : (nextMode === 'short' ? '下一段短休息' : '下一段长休息')
    ui.alarmTitle.textContent = endedLabel
    ui.alarmDesc.textContent = stopped
      ? `提醒已自动停止。点击下方按钮开始 ${nextLabel}。`
      : `已到时间。将持续提醒 30 秒。点击下方按钮停止提醒，并开始 ${nextLabel}。`
  }
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

  const endedMode = state.mode
  enterAlarm(endedMode, fromResume)
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
    const ctx = ensureAudioCtx()
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.08
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
      g.gain.linearRampToValueAtTime(0.08, t0 + 0.01)
      g.gain.setValueAtTime(0.08, t0 + dur - 0.02)
      g.gain.linearRampToValueAtTime(0.0, t0 + dur)
    }
    o.stop(startAt + n * (dur + gap))
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
  if (typeof state.awaitingAck !== 'boolean') state.awaitingAck = false
  if (!('awaitEndedMode' in state)) state.awaitEndedMode = null
  if (!('awaitNextMode' in state)) state.awaitNextMode = null
  if (!('alarmStopAtMs' in state)) state.alarmStopAtMs = null
  if (!Number.isFinite(state.remainingMs)) state.remainingMs = durationForMode(state.mode || 'work')
  if (state.awaitingAck) {
    state.running = false
    state.endAtMs = null
    state.remainingMs = 0
    if (Number.isFinite(state.alarmStopAtMs) && Date.now() >= state.alarmStopAtMs) {
      stopAlarmLoop()
      setBaseTitle()
    }
  } else if (state.running) {
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

function enterAlarm(endedMode, fromResume) {
  if (state.awaitingAck) return

  if (endedMode === 'work') state.completedWork += 1
  state.awaitingAck = true
  state.awaitEndedMode = endedMode
  state.awaitNextMode = computeNextMode(endedMode)
  state.alarmStopAtMs = Date.now() + ALARM_MAX_MS

  state.running = false
  state.remainingMs = 0
  state.endAtMs = null
  clearInterval(timer)
  clearTimeout(alarm)
  timer = null
  alarm = null
  saveState()

  if (fromResume) ui.hint.textContent = '已从锁屏/后台恢复：时间已到，请先停止提醒再继续。'
  startAlarming(endedMode, false)
  refreshUI()
}

function ackAlarm() {
  if (!state.awaitingAck) return
  stopAlarmLoop()

  const nextMode = state.awaitNextMode || computeNextMode(state.awaitEndedMode || state.mode)
  state.awaitingAck = false
  state.awaitEndedMode = null
  state.awaitNextMode = null
  state.alarmStopAtMs = null
  alarmNotifiedFor = null
  setBaseTitle()

  state.mode = nextMode
  state.remainingMs = durationForMode(nextMode)
  state.running = true
  state.endAtMs = Date.now() + state.remainingMs
  saveState()
  resume()
}

function startAlarming(endedMode, silentNotify) {
  const stopped = Number.isFinite(state.alarmStopAtMs) && Date.now() >= state.alarmStopAtMs
  if (stopped) {
    stopAlarmLoop()
    setBaseTitle()
    refreshUI()
    return
  }
  setAlarmTitle()
  if (!silentNotify && alarmNotifiedFor !== endedMode) {
    notifySegment(endedMode)
    alarmNotifiedFor = endedMode
  }
  startAlarmLoop(endedMode)
}

function startAlarmLoop(endedMode) {
  stopAlarmLoop()
  const remain = Number.isFinite(state.alarmStopAtMs) ? (state.alarmStopAtMs - Date.now()) : ALARM_MAX_MS
  if (remain <= 0) {
    stopAlarmLoop()
    setBaseTitle()
    refreshUI()
    return
  }
  clearTimeout(alarmAutoStop)
  alarmAutoStop = setTimeout(() => {
    stopAlarmLoop()
    setBaseTitle()
    refreshUI()
  }, Math.min(remain, 0x7fffffff))
  alarmLoop = setInterval(() => {
    if (!state.awaitingAck) return
    alarmTick(endedMode)
  }, 2400)
  alarmTick(endedMode)
}

function stopAlarmLoop() {
  clearInterval(alarmLoop)
  clearTimeout(alarmAutoStop)
  alarmLoop = null
  alarmAutoStop = null
}

function alarmTick(endedMode) {
  if (!state.awaitingAck) return
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([260, 90, 260, 90, 260, 90, 520])
  if (state.settings.sound) beep(2)
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (alarmNotifiedFor === endedMode) return
  const title = endedMode === 'work' ? '专注结束' : '休息结束'
  const body = '时间到了，请回到页面确认。'
  try { new Notification(title, { body }) } catch (_) {}
  alarmNotifiedFor = endedMode
}

function setAlarmTitle() {
  document.title = `【时间到】${baseTitle}`
}

function setBaseTitle() {
  document.title = baseTitle
}

function unlockAudioOnce() {
  ensureAudioCtx()
}

function ensureAudioCtx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    return audioCtx
  } catch (_) {
    return null
  }
}
