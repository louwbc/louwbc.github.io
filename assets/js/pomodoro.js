const $ = (sel) => document.querySelector(sel)

const els = {
  state: $('#p-state'),
  time: $('#p-time'),
  sub: $('#p-sub'),
  hint: $('#p-hint'),
  start: $('#p-start'),
  pause: $('#p-pause'),
  next: $('#p-next'),
  reset: $('#p-reset'),
  notify: $('#p-notify'),
  work: $('#p-work'),
  short: $('#p-short'),
  long: $('#p-long'),
  cycles: $('#p-cycles'),
  sound: $('#p-sound'),
  vibrate: $('#p-vibrate'),
  wakelock: $('#p-wakelock'),
}

const storeKey = 'pomodoro-settings'
const runKey = 'pomodoro-run'

const defaults = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  sound: true,
  vibrate: true,
  wakelock: false,
}

let settings = { ...defaults, ...loadJSON(storeKey, {}) }
let run = loadJSON(runKey, null) || {
  mode: 'work',
  cycleCount: 0,
  startedAt: null,
  endsAt: null,
  pausedRemainingMs: null,
  running: false,
}

let tickTimer = null
let wakeLock = null

init()

function init() {
  if (Object.values(els).some(v => v == null)) return

  els.work.value = settings.workMin
  els.short.value = settings.shortMin
  els.long.value = settings.longMin
  els.cycles.value = settings.longEvery
  els.sound.checked = !!settings.sound
  els.vibrate.checked = !!settings.vibrate
  els.wakelock.checked = !!settings.wakelock

  els.start.addEventListener('click', start)
  els.pause.addEventListener('click', pause)
  els.next.addEventListener('click', nextSegment)
  els.reset.addEventListener('click', resetAll)
  els.notify.addEventListener('click', requestNotify)

  els.work.addEventListener('change', onSettingsChanged)
  els.short.addEventListener('change', onSettingsChanged)
  els.long.addEventListener('change', onSettingsChanged)
  els.cycles.addEventListener('change', onSettingsChanged)
  els.sound.addEventListener('change', onSettingsChanged)
  els.vibrate.addEventListener('change', onSettingsChanged)
  els.wakelock.addEventListener('change', onSettingsChanged)

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render()
    }
  })

  render()
  ensureTicking()
  ensureWakeLock()
}

function onSettingsChanged() {
  settings.workMin = clampInt(els.work.value, 1, 180, defaults.workMin)
  settings.shortMin = clampInt(els.short.value, 1, 60, defaults.shortMin)
  settings.longMin = clampInt(els.long.value, 1, 120, defaults.longMin)
  settings.longEvery = clampInt(els.cycles.value, 2, 12, defaults.longEvery)
  settings.sound = !!els.sound.checked
  settings.vibrate = !!els.vibrate.checked
  settings.wakelock = !!els.wakelock.checked
  saveJSON(storeKey, settings)

  if (!run.running) {
    run.pausedRemainingMs = null
    if (run.mode === 'work') setDisplayMs(settings.workMin * 60_000)
    if (run.mode === 'short') setDisplayMs(settings.shortMin * 60_000)
    if (run.mode === 'long') setDisplayMs(settings.longMin * 60_000)
  }
  ensureWakeLock()
  render()
}

function start() {
  if (run.running) return
  const now = Date.now()
  const remaining = run.pausedRemainingMs ?? segmentMs(run.mode)
  run.running = true
  run.startedAt = now
  run.endsAt = now + remaining
  run.pausedRemainingMs = null
  saveJSON(runKey, run)
  ensureWakeLock()
  ensureTicking()
  render()
}

function pause() {
  if (!run.running) return
  const remaining = Math.max(0, run.endsAt - Date.now())
  run.running = false
  run.pausedRemainingMs = remaining
  run.startedAt = null
  run.endsAt = null
  saveJSON(runKey, run)
  ensureWakeLock()
  render()
}

function resetAll() {
  run = {
    mode: 'work',
    cycleCount: 0,
    startedAt: null,
    endsAt: null,
    pausedRemainingMs: null,
    running: false,
  }
  saveJSON(runKey, run)
  ensureWakeLock()
  render()
}

function nextSegment() {
  const wasRunning = run.running
  run.running = false
  run.startedAt = null
  run.endsAt = null
  run.pausedRemainingMs = null

  if (run.mode === 'work') {
    run.cycleCount += 1
    run.mode = (run.cycleCount % settings.longEvery === 0) ? 'long' : 'short'
  } else {
    run.mode = 'work'
  }

  if (wasRunning) {
    const now = Date.now()
    run.running = true
    run.startedAt = now
    run.endsAt = now + segmentMs(run.mode)
  }
  saveJSON(runKey, run)
  ensureWakeLock()
  render()
}

function segmentMs(mode) {
  if (mode === 'work') return settings.workMin * 60_000
  if (mode === 'short') return settings.shortMin * 60_000
  return settings.longMin * 60_000
}

function ensureTicking() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    if (!run.running) return
    const ms = run.endsAt - Date.now()
    if (ms <= 0) {
      onSegmentDone()
    }
    render()
  }, 250)
}

function onSegmentDone() {
  run.running = false
  run.startedAt = null
  run.endsAt = null
  run.pausedRemainingMs = null
  saveJSON(runKey, run)
  notifyDone()
  nextSegment()
  if (!run.running) start()
}

function render() {
  const ms = run.running
    ? Math.max(0, run.endsAt - Date.now())
    : (run.pausedRemainingMs ?? segmentMs(run.mode))
  setDisplayMs(ms)
  els.state.textContent = stateText()
  els.sub.textContent = `专注 ${settings.workMin} 分钟 · 休息 ${settings.shortMin} 分钟 · 每 ${settings.longEvery} 次专注长休息`
  els.start.disabled = run.running
  els.pause.disabled = !run.running
  els.next.textContent = run.mode === 'work' ? '跳到休息' : '跳到专注'
  els.hint.textContent = hintText()
  els.notify.textContent = notifyButtonText()
}

function setDisplayMs(ms) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  els.time.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function stateText() {
  const modeName = run.mode === 'work' ? '专注' : (run.mode === 'short' ? '短休息' : '长休息')
  if (run.running) return `${modeName}中`
  return `${modeName}（暂停）`
}

function hintText() {
  const n = run.cycleCount % settings.longEvery
  const left = (settings.longEvery - n) % settings.longEvery
  if (run.mode === 'work') {
    if (left === 1) return '下一次专注结束后进入长休息'
    if (left === 0) return '下一次专注结束后进入短休息'
    return `距离长休息还差 ${left} 次专注`
  }
  return '休息结束后回到专注'
}

function notifyButtonText() {
  if (!('Notification' in window)) return '此设备不支持提醒'
  if (Notification.permission === 'granted') return '提醒已开启'
  if (Notification.permission === 'denied') return '提醒被禁用'
  return '开启提醒'
}

async function requestNotify() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') return
  try {
    await Notification.requestPermission()
  } catch (_) {}
  render()
}

function notifyDone() {
  const title = run.mode === 'work' ? '专注结束' : '休息结束'
  const body = run.mode === 'work' ? '该休息一下了' : '开始下一轮专注'
  if (settings.vibrate && navigator.vibrate) {
    navigator.vibrate([200, 100, 200])
  }
  if (settings.sound) {
    beep()
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body })
    } catch (_) {}
  }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.0001
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    const t0 = ctx.currentTime
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)
    o.stop(t0 + 0.3)
    o.onended = () => ctx.close().catch(() => {})
  } catch (_) {}
}

async function ensureWakeLock() {
  if (!('wakeLock' in navigator)) return
  if (!settings.wakelock || !run.running) {
    if (wakeLock) {
      try { await wakeLock.release() } catch (_) {}
      wakeLock = null
    }
    return
  }
  if (wakeLock) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => { wakeLock = null })
  } catch (_) {
    wakeLock = null
  }
}

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch (_) {
    return fallback
  }
}

function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v || ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
