const $ = (s) => document.querySelector(s)

const STORE_KEY = 'solo-radio:unified-favorites'
const LIMIT = 600

const FM_STREAM_CACHE_KEY = 'solo-radio:fm-stream-cache'
const FM_STREAM_CACHE_TTL = 24 * 60 * 60 * 1000
const FM_API_BASES = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info']

const ui = {
  info: $('#info'),
  searchInput: $('#searchInput'),
  typeSelect: $('#typeSelect'),
  tabAll: $('#tabAll'),
  tabTv: $('#tabTv'),
  tabFm: $('#tabFm'),
  exportBtn: $('#exportBtn'),
  importBtn: $('#importBtn'),
  importInput: $('#importInput'),
  clearBtn: $('#clearBtn'),
  favList: $('#favList'),
  listMeta: $('#listMeta'),
  empty: $('#empty'),
  nowTitle: $('#nowTitle'),
  nowSub: $('#nowSub'),
  prevBtn: $('#prevBtn'),
  playBtn: $('#playBtn'),
  nextBtn: $('#nextBtn'),
  tvVisualBtn: $('#tvVisualBtn'),
  openAppBtn: $('#openAppBtn'),
  vol: $('#vol'),
  playerAudio: $('#playerAudio'),
  playerVideo: $('#playerVideo'),
  videoDock: $('#videoDock'),
  videoDockTitle: $('#videoDockTitle'),
  videoDockStage: $('#videoDockStage'),
  videoDockCloseBtn: $('#videoDockCloseBtn'),
  videoDockFullscreenBtn: $('#videoDockFullscreenBtn')
}

const state = {
  items: [],
  filter: { type: 'all', keyword: '' },
  tvChannels: null,
  tvChannelsLoading: false,
  fmCache: null,
  playing: null,
  playMeta: null,
  modeTvShowVideo: false,
  hls: null,
  volume: 1
}

init()

function init() {
  const vol = Number(load('solo-radio:my-favorites:volume', 1))
  state.volume = Number.isFinite(vol) ? vol : 1
  ui.vol.value = String(state.volume)
  ui.playerAudio.volume = state.volume
  ui.playerVideo.volume = state.volume
  state.fmCache = load(FM_STREAM_CACHE_KEY, {}) || {}
  pruneFmCache()

  setupControls()
  loadItems()
  refreshTabs()
  refreshList()
  setInfo(`已载入 ${state.items.length} 条统一收藏。点击卡片上的「播放」按钮即可在此页面直接收听。`)
}

function setupControls() {
  ui.searchInput.addEventListener('input', () => {
    state.filter.keyword = String(ui.searchInput.value || '').trim().toLowerCase()
    refreshList()
  })
  ui.typeSelect.addEventListener('change', () => {
    state.filter.type = ui.typeSelect.value || 'all'
    refreshTabs()
    refreshList()
  })
  for (const tab of [ui.tabAll, ui.tabTv, ui.tabFm]) {
    tab.addEventListener('click', () => {
      state.filter.type = tab.dataset.type
      ui.typeSelect.value = state.filter.type === 'all' ? '' : state.filter.type
      refreshTabs()
      refreshList()
    })
  }
  ui.exportBtn.addEventListener('click', exportFavorites)
  ui.importBtn.addEventListener('click', () => ui.importInput.click())
  ui.importInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importFavorites(file)
  })
  ui.clearBtn.addEventListener('click', () => {
    if (!state.items.length) return
    const ok = confirm(`确定要清空全部 ${state.items.length} 条统一收藏吗？此操作不可撤销。`)
    if (!ok) return
    save([])
    loadItems()
    refreshList()
    setInfo('已清空所有统一收藏')
  })

  ui.prevBtn.addEventListener('click', () => jump(-1))
  ui.nextBtn.addEventListener('click', () => jump(1))
  ui.playBtn.addEventListener('click', async () => {
    if (!state.playing) return
    if (ui.playerAudio.paused) await ui.playerAudio.play().catch(onPlayError)
    else ui.playerAudio.pause()
    syncPlayButton()
    if (state.modeTvShowVideo && state.playing?.type === 'tv') {
      if (!ui.playerVideo.paused && ui.playerAudio.paused) ui.playerVideo.pause()
      else if (ui.playerAudio.paused === false) ui.playerVideo.play().catch(() => {})
    }
  })

  ui.tvVisualBtn.addEventListener('click', toggleTvVisual)

  ui.openAppBtn.addEventListener('click', () => {
    const item = state.playing
    if (!item) return
    window.open(buildOpenUrl(item), '_blank', 'noopener,noreferrer')
  })

  ui.vol.addEventListener('input', () => {
    const v = Number(ui.vol.value)
    state.volume = v
    ui.playerAudio.volume = v
    ui.playerVideo.volume = v
    save('solo-radio:my-favorites:volume', v)
  })

  ui.playerAudio.addEventListener('play', syncPlayButton)
  ui.playerAudio.addEventListener('pause', syncPlayButton)
  ui.playerAudio.addEventListener('ended', () => jump(1))
  ui.playerAudio.addEventListener('error', () => {
    setInfo('播放失败：该流不可用或跨域限制')
    syncPlayButton()
  })
  ui.playerAudio.addEventListener('waiting', () => {
    if (!ui.playerAudio.paused && state.playing) setInfo('缓冲中…')
  })

  ui.videoDockCloseBtn.addEventListener('click', () => setTvShowVideo(false))
  ui.videoDockFullscreenBtn.addEventListener('click', () => {
    if (!ui.playerVideo) return
    const el = ui.videoDockStage
    if (!document.fullscreenElement) {
      ;(el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el)
    } else {
      ;(document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document)
    }
  })
}

function refreshTabs() {
  for (const tab of [ui.tabAll, ui.tabTv, ui.tabFm]) {
    const active = tab.dataset.type === state.filter.type
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', active ? 'true' : 'false')
  }
}

function refreshList() {
  const visible = getVisibleItems()
  const count = state.items.length
  const tvCount = state.items.filter(i => i.type === 'tv').length
  const fmCount = state.items.filter(i => i.type === 'fm').length
  ui.listMeta.textContent = `共 ${count} 条（电视 ${tvCount} · 电台 ${fmCount}）`
  ui.favList.innerHTML = ''
  ui.empty.hidden = count !== 0
  if (!visible.length) return
  const frag = document.createDocumentFragment()
  for (const item of visible) frag.appendChild(renderItem(item))
  ui.favList.appendChild(frag)
}

function getVisibleItems() {
  const keyword = state.filter.keyword
  const type = state.filter.type
  return state.items.filter(item => {
    if (type && type !== 'all' && item.type !== type) return false
    if (!keyword) return true
    const hay = `${item.meta.title} ${item.meta.subtitle || ''} ${item.meta.country || ''} ${item.meta.language || ''} ${item.meta.category || ''}`.toLowerCase()
    return hay.includes(keyword)
  })
}

function renderItem(item) {
  const row = document.createElement('article')
  row.className = 'fav-item'
  row.tabIndex = 0
  row.setAttribute('role', 'button')
  const typeLabel = item.type === 'tv' ? '电视' : '电台'
  row.setAttribute('aria-label', `${typeLabel} · ${item.meta.title}，点击播放`)

  const typeBox = document.createElement('div')
  typeBox.className = `fav-type ${item.type}`
  typeBox.textContent = item.type === 'tv' ? '📺' : '📻'

  const main = document.createElement('div')
  main.className = 'fav-main'
  const title = document.createElement('div')
  title.className = 'fav-title'
  title.textContent = item.meta.title
  const sub = document.createElement('div')
  sub.className = 'fav-sub'
  sub.textContent = item.meta.subtitle || [item.meta.country, item.meta.language].filter(Boolean).join(' · ')
  main.append(title, sub)
  if (item.meta.category) {
    const cat = document.createElement('span')
    cat.className = 'fav-cat'
    cat.textContent = `${typeLabel} · ${item.meta.category}`
    main.append(cat)
  }

  const actions = document.createElement('div')
  actions.className = 'fav-actions'

  const topRow = document.createElement('div')
  topRow.className = 'fav-action-row'

  const isCurrent = state.playing && state.playing.id === item.id

  const playBtn = document.createElement('button')
  playBtn.className = 'btn primary'
  playBtn.type = 'button'
  playBtn.textContent = (isCurrent && !ui.playerAudio.paused) ? '⏸ 播放中' : '▶ 播放'
  playBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    await playItem(item, true)
  })

  topRow.append(playBtn)

  if (item.type === 'tv') {
    const visualBtn = document.createElement('button')
    visualBtn.className = 'btn'
    visualBtn.type = 'button'
    visualBtn.textContent = '📺 看画面'
    visualBtn.disabled = true
    visualBtn.title = '点击播放后可切换到看画面'
    visualBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!isCurrent) await playItem(item, true)
      setTvShowVideo(true)
    })
    ;(async () => {
      try {
        const stream = await resolveStream(item)
        visualBtn.disabled = !stream || !stream.playable
        if (stream && stream.playable) visualBtn.title = '看画面'
        else if (stream && stream.watchUrl) { visualBtn.textContent = '↗ 官网'; visualBtn.title = '此频道需跳转到官网打开' ; visualBtn.disabled = false ; visualBtn.onclick = () => window.open(stream.watchUrl, '_blank', 'noopener,noreferrer') }
      } catch (_) {}
    })()
    topRow.append(visualBtn)
  }

  const openBtn = document.createElement('button')
  openBtn.className = 'btn'
  openBtn.type = 'button'
  openBtn.textContent = '↗'
  openBtn.title = `在${typeLabel}应用中打开`
  openBtn.setAttribute('aria-label', `在${typeLabel}应用中打开`)
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    window.open(buildOpenUrl(item), '_blank', 'noopener,noreferrer')
  })
  topRow.append(openBtn)

  const removeBtn = document.createElement('button')
  removeBtn.className = 'btn'
  removeBtn.type = 'button'
  removeBtn.textContent = '移除'
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeFromUnified(item.id)
  })
  topRow.append(removeBtn)

  const reorderRow = document.createElement('div')
  reorderRow.className = 'fav-action-row'
  const pos = getPosition(item.id)
  const canMove = pos && state.items.length > 1
  const atTop = !pos || pos.index === 0
  const atBottom = !pos || pos.index === pos.total - 1

  const makeBtn = (icon, label, disabled, onClick) => {
    const b = document.createElement('button')
    b.className = 'btn icon-btn tiny'
    b.type = 'button'
    b.textContent = icon
    b.setAttribute('aria-label', label)
    b.disabled = !canMove || disabled
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!b.disabled) onClick()
    })
    return b
  }
  const name = item.meta.title
  reorderRow.append(
    makeBtn('⤒', '移到最前', atTop, () => {
      const r = moveToTop(item.id); if (r) setInfo(`已将「${name}」移到第 ${r.position} 位`); refreshList()
    }),
    makeBtn('↑', '上移一位', atTop, () => {
      const r = moveUp(item.id); if (r) setInfo(`已将「${name}」上移到第 ${r.position} 位`); refreshList()
    }),
    makeBtn('↓', '下移一位', atBottom, () => {
      const r = moveDown(item.id); if (r) setInfo(`已将「${name}」下移到第 ${r.position} 位`); refreshList()
    }),
    makeBtn('⤓', '移到最后', atBottom, () => {
      const r = moveToBottom(item.id); if (r) setInfo(`已将「${name}」移到第 ${r.position} 位`); refreshList()
    })
  )

  actions.append(topRow, reorderRow)
  row.append(typeBox, main, actions)
  row.addEventListener('click', () => playItem(item, true))
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    playItem(item, true)
  })
  return row
}

function buildOpenUrl(item) {
  const base = item.type === 'tv' ? '../global-tv/' : '../global-fm/'
  const param = item.type === 'tv' ? `channel=${encodeURIComponent(item.refId)}` : `station=${encodeURIComponent(item.refId)}`
  return `${base}?${param}`
}

function getPosition(id) {
  const idx = state.items.findIndex(x => x.id === id)
  return idx < 0 ? null : { index: idx, total: state.items.length }
}

function removeFromUnified(id) {
  const item = state.items.find(x => x.id === id)
  if (!item) return
  const ok = confirm(`确定把「${item.meta.title}」从统一收藏中移除吗？`)
  if (!ok) return
  state.items = state.items.filter(x => x.id !== id)
  save(state.items)
  if (state.playing && state.playing.id === id) stopPlayback()
  refreshList()
  setInfo(`已移除「${item.meta.title}」`)
}

function moveToTop(id) {
  const idx = state.items.findIndex(x => x.id === id)
  if (idx <= 0) return null
  const [it] = state.items.splice(idx, 1)
  state.items.unshift(it)
  save(state.items)
  return { position: 1 }
}
function moveUp(id) {
  const idx = state.items.findIndex(x => x.id === id)
  if (idx <= 0) return null
  ;[state.items[idx - 1], state.items[idx]] = [state.items[idx], state.items[idx - 1]]
  save(state.items)
  return { position: idx }
}
function moveDown(id) {
  const idx = state.items.findIndex(x => x.id === id)
  if (idx < 0 || idx >= state.items.length - 1) return null
  ;[state.items[idx], state.items[idx + 1]] = [state.items[idx + 1], state.items[idx]]
  save(state.items)
  return { position: idx + 2 }
}
function moveToBottom(id) {
  const idx = state.items.findIndex(x => x.id === id)
  if (idx < 0 || idx >= state.items.length - 1) return null
  const [it] = state.items.splice(idx, 1)
  state.items.push(it)
  save(state.items)
  return { position: state.items.length }
}

/* ============================
 *  流解析 & 统一播放内核
 * ============================ */

async function playItem(item, autoplay) {
  if (!item) return
  const same = state.playing && state.playing.id === item.id
  if (same && state.playMeta && state.playMeta.streamUrl && autoplay) {
    if (ui.playerAudio.paused) await ui.playerAudio.play().catch(onPlayError)
    refreshPlayerUI()
    refreshList()
    return
  }
  setInfo(`正在解析 ${item.meta.title}…`)
  stopPlayback()
  state.playing = item
  state.playMeta = { streamUrl: null, watchUrl: null, playable: false, kind: null }
  state.modeTvShowVideo = false
  hideVideoDock()
  refreshPlayerUI()
  refreshList()
  try {
    const stream = await resolveStream(item)
    state.playMeta = Object.assign({ streamUrl: null, watchUrl: null, playable: false, kind: null }, stream || {})
    if (!state.playMeta.playable && state.playMeta.watchUrl) {
      setInfo(`${item.meta.title} 需要在官网打开。点击「↗ 官网」跳转播放。`)
      refreshPlayerUI()
      refreshList()
      return
    }
    if (!state.playMeta.playable) {
      setInfo(`${item.meta.title} 暂无可用的直播源，已停止`)
      refreshPlayerUI()
      refreshList()
      return
    }
    await loadAndPlay(state.playMeta.streamUrl, item.type, autoplay)
    setInfo(`正在播放：${item.meta.title}${item.type === 'tv' ? '（只听音频模式，可点击 📺 看画面）' : ''}`)
  } catch (err) {
    setInfo(`播放失败：${err?.message || '未知错误'}`)
  }
  refreshPlayerUI()
  refreshList()
}

async function loadAndPlay(url, type, autoplay) {
  const target = state.modeTvShowVideo && type === 'tv' ? ui.playerVideo : ui.playerAudio
  const useHls = /\.m3u8(\?|$)/i.test(url) && window.Hls && window.Hls.isSupported()
  destroyHls()
  ui.playerAudio.pause()
  ui.playerVideo.pause()
  ui.playerAudio.removeAttribute('src')
  ui.playerVideo.removeAttribute('src')
  ui.playerAudio.load()
  if (useHls) {
    state.hls = new window.Hls({ enableWorker: true, lowLatencyMode: true })
    state.hls.loadSource(url)
    state.hls.attachMedia(target)
    state.hls.on(window.Hls.Events.ERROR, (_e, data) => {
      if (data?.fatal) setInfo('播放错误：直播源可能中断或跨域受限')
    })
    state.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      if (autoplay) target.play().catch(onPlayError)
    })
  } else {
    target.src = url
    target.load()
    if (autoplay) target.play().catch(onPlayError)
  }
  if (state.modeTvShowVideo && type === 'tv') {
    showVideoDock()
  }
}

function destroyHls() {
  if (state.hls) {
    try { state.hls.destroy() } catch (_) {}
    state.hls = null
  }
}

function stopPlayback() {
  ui.playerAudio.pause()
  ui.playerVideo.pause()
  ui.playerAudio.removeAttribute('src')
  ui.playerVideo.removeAttribute('src')
  try { ui.playerAudio.load() } catch (_) {}
  try { ui.playerVideo.load() } catch (_) {}
  destroyHls()
  state.playing = null
  state.playMeta = null
  state.modeTvShowVideo = false
  hideVideoDock()
  syncPlayButton()
  ui.tvVisualBtn.hidden = true
}

function jump(step) {
  const list = getVisibleItems()
  if (!list.length) return
  const idx = state.playing ? list.findIndex(x => x.id === state.playing.id) : -1
  const next = idx < 0 ? 0 : (idx + step + list.length) % list.length
  playItem(list[next], true)
}

function toggleTvVisual() {
  if (!state.playing || state.playing.type !== 'tv') return
  setTvShowVideo(!state.modeTvShowVideo)
}

async function setTvShowVideo(show) {
  if (!state.playing || state.playing.type !== 'tv') return
  state.modeTvShowVideo = !!show
  if (state.playMeta && state.playMeta.streamUrl) {
    const url = state.playMeta.streamUrl
    const wasPlaying = !ui.playerAudio.paused || !ui.playerVideo.paused
    destroyHls()
    ui.playerAudio.pause()
    ui.playerVideo.pause()
    ui.playerAudio.removeAttribute('src')
    ui.playerVideo.removeAttribute('src')
    try { ui.playerAudio.load() } catch (_) {}
    try { ui.playerVideo.load() } catch (_) {}
    const target = show ? ui.playerVideo : ui.playerAudio
    const useHls = /\.m3u8(\?|$)/i.test(url) && window.Hls && window.Hls.isSupported()
    if (useHls) {
      state.hls = new window.Hls({ enableWorker: true, lowLatencyMode: true })
      state.hls.loadSource(url)
      state.hls.attachMedia(target)
      state.hls.on(window.Hls.Events.MANIFEST_PARSED, () => { if (wasPlaying) target.play().catch(() => {}) })
    } else {
      target.src = url
      target.load()
      if (wasPlaying) target.play().catch(() => {})
    }
    if (target === ui.playerVideo) ui.playerAudio.pause()
    else ui.playerVideo.pause()
  }
  show ? showVideoDock() : hideVideoDock()
  refreshPlayerUI()
}

function showVideoDock() {
  if (!state.playing) return
  ui.videoDock.hidden = false
  ui.videoDockTitle.textContent = `📺 ${state.playing.meta.title}`
  document.body.classList.add('has-video-dock')
}
function hideVideoDock() {
  ui.videoDock.hidden = true
  document.body.classList.remove('has-video-dock')
}

function refreshPlayerUI() {
  const item = state.playing
  syncPlayButton()
  if (!item) {
    ui.nowTitle.textContent = '未播放'
    ui.nowSub.textContent = ''
    ui.prevBtn.disabled = true
    ui.nextBtn.disabled = true
    ui.tvVisualBtn.hidden = true
    ui.openAppBtn.disabled = true
    return
  }
  ui.nowTitle.textContent = item.meta.title
  const typeLabel = item.type === 'tv' ? '电视' : '电台'
  ui.nowSub.textContent = [typeLabel, item.meta.country, item.meta.language, item.meta.category].filter(Boolean).join(' · ')
  const list = getVisibleItems()
  ui.prevBtn.disabled = list.length <= 1
  ui.nextBtn.disabled = list.length <= 1
  const canShowVideo = item.type === 'tv' && state.playMeta && state.playMeta.playable
  ui.tvVisualBtn.hidden = !canShowVideo
  if (canShowVideo) {
    ui.tvVisualBtn.textContent = state.modeTvShowVideo ? '🔇' : '📺'
    ui.tvVisualBtn.title = state.modeTvShowVideo ? '切回只听音频' : '看电视画面'
  }
  ui.openAppBtn.disabled = false
}

function syncPlayButton() {
  const playing = !ui.playerAudio.paused || !ui.playerVideo.paused
  ui.playBtn.disabled = !state.playing
  ui.playBtn.textContent = state.playing ? (playing ? '⏸' : '▶') : '▶'
}

function onPlayError(err) {
  const name = String(err?.name || '')
  if (name === 'NotAllowedError') setInfo('播放失败：浏览器阻止了自动播放，请再点一次播放')
  else setInfo('播放失败：请换一个试试或稍后重试')
  syncPlayButton()
}

/* ============================
 *  流地址解析
 * ============================ */

async function resolveStream(item) {
  if (!item) return null
  return item.type === 'tv' ? resolveTvStream(item) : resolveFmStream(item)
}

async function resolveTvStream(item) {
  const channels = await loadTvChannels()
  const channel = channels?.find(c => String(c.id) === String(item.refId).trim())
  if (!channel) return null
  const kind = channel.kind || (channel.streamUrl ? 'hls' : 'external')
  return {
    streamUrl: channel.streamUrl || null,
    watchUrl: channel.watchUrl || null,
    playable: kind === 'hls' && !!channel.streamUrl,
    kind
  }
}

async function loadTvChannels() {
  if (state.tvChannels) return state.tvChannels
  if (state.tvChannelsLoading) {
    await new Promise(resolve => setTimeout(() => resolve(loadTvChannels()), 100))
    return state.tvChannels
  }
  state.tvChannelsLoading = true
  try {
    const res = await fetch('../global-tv/channels.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    state.tvChannels = Array.isArray(data) ? data : []
  } catch (_) {
    state.tvChannels = []
  } finally {
    state.tvChannelsLoading = false
  }
  return state.tvChannels
}

async function resolveFmStream(item) {
  const cache = state.fmCache || {}
  const key = String(item.refId || '').trim()
  if (!key) return null
  const cached = cache[key]
  if (cached && cached.expiresAt && cached.expiresAt > Date.now() && cached.url) {
    return { streamUrl: cached.url, watchUrl: cached.homepage || null, playable: true, kind: 'fm' }
  }
  setInfo(`正在查询电台直播源：${item.meta.title}…`)
  let lastErr = null
  for (const base of FM_API_BASES) {
    try {
      const res = await fetch(`${base}/json/stations/byuuid/${encodeURIComponent(key)}`, { cache: 'no-store' })
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`) ; continue }
      const arr = await res.json()
      const station = Array.isArray(arr) ? arr[0] : null
      if (!station) continue
      const url = station.url_resolved || station.url
      if (!url) continue
      cache[key] = { url, homepage: station.homepage || null, expiresAt: Date.now() + FM_STREAM_CACHE_TTL }
      state.fmCache = cache
      save(FM_STREAM_CACHE_KEY, cache)
      return { streamUrl: url, watchUrl: station.homepage || null, playable: true, kind: 'fm' }
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr) setInfo(`查询电台直播源失败：${lastErr.message || '网络错误'}`)
  return null
}

function pruneFmCache() {
  const cache = state.fmCache || {}
  const now = Date.now()
  let changed = false
  for (const k of Object.keys(cache)) {
    if (!cache[k] || !cache[k].expiresAt || cache[k].expiresAt <= now) {
      delete cache[k]; changed = true
    }
  }
  if (changed) {
    state.fmCache = cache
    save(FM_STREAM_CACHE_KEY, cache)
  }
}

/* ============================
 *  导入 / 导出
 * ============================ */

function exportFavorites() {
  if (!state.items.length) {
    setInfo('还没有统一收藏可导出')
    return
  }
  const data = {
    schema: 'solo-radio-unified-favorites',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: state.items.length,
    items: state.items
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.download = `solo-radio-unified-favorites-${date}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  setInfo(`已导出 ${state.items.length} 条统一收藏`)
}

async function importFavorites(file) {
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [])
    const valid = incoming.filter(x => x && x.type && x.refId && x.meta && typeof x.meta.title === 'string')
    if (!valid.length) {
      setInfo('导入失败：文件格式不正确')
      return
    }
    const current = state.items.slice()
    const seen = new Set(current.map(x => x.id))
    let added = 0
    for (const raw of valid) {
      const id = buildId(raw.type, raw.refId)
      if (seen.has(id)) continue
      if (current.length >= LIMIT) break
      seen.add(id)
      current.push(normalizeItem(raw))
      added++
    }
    state.items = current
    save(state.items)
    refreshList()
    const overflow = valid.length - added
    const msg = overflow ? `，另有 ${overflow} 条因重复或超过 ${LIMIT} 条上限未导入` : ''
    setInfo(`已导入 ${added} 条统一收藏${msg}`)
  } catch (_) {
    setInfo('导入失败：文件读取错误')
  }
}

function buildId(type, refId) {
  return `${type}:${String(refId).trim()}`
}

function normalizeItem(raw) {
  const id = buildId(raw.type, raw.refId)
  return {
    id,
    type: raw.type === 'fm' ? 'fm' : 'tv',
    refId: String(raw.refId).trim(),
    addedAt: raw.addedAt || Date.now(),
    meta: {
      title: String(raw.meta?.title || '未命名').trim(),
      subtitle: String(raw.meta?.subtitle || '').trim(),
      country: String(raw.meta?.country || '').trim(),
      language: String(raw.meta?.language || '').trim(),
      category: String(raw.meta?.category || '').trim()
    }
  }
}

function loadItems() {
  const raw = loadRaw()
  if (!Array.isArray(raw)) { state.items = []; return }
  state.items = raw.map(normalizeItem).slice(0, LIMIT)
}

function save(items) {
  try {
    const clean = (items || []).slice(0, LIMIT)
    localStorage.setItem(STORE_KEY, JSON.stringify(clean))
  } catch (_) {}
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const v = JSON.parse(raw)
    return v ?? fallback
  } catch (_) {
    return fallback
  }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch (_) {}
}

function setInfo(text) {
  ui.info.textContent = text
}
