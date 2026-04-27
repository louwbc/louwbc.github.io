const $ = (s) => document.querySelector(s)

const ui = {
  q: $('#q'),
  lang: $('#lang'),
  insecure: $('#insecure'),
  searchBtn: $('#searchBtn'),
  info: $('#info'),
  list: $('#list'),
  empty: $('#empty'),
  sentinel: $('#sentinel'),
  tabDiscover: $('#tabDiscover'),
  tabFav: $('#tabFav'),
  tabRecent: $('#tabRecent'),
  nowTitle: $('#nowTitle'),
  nowSub: $('#nowSub'),
  prevBtn: $('#prevBtn'),
  playBtn: $('#playBtn'),
  nextBtn: $('#nextBtn'),
  favBtn: $('#favBtn'),
  vol: $('#vol'),
  audio: $('#audio'),
  installBtn: $('#installBtn')
}

const STORE = {
  favorites: 'global-fm:favorites',
  recent: 'global-fm:recent',
  volume: 'global-fm:volume',
  includeInsecure: 'global-fm:includeInsecure',
  preferredLanguage: 'global-fm:preferredLanguage'
}

const state = {
  tab: 'discover',
  stations: [],
  page: 0,
  pageSize: 60,
  loading: false,
  hasMore: true,
  lastQuery: '',
  playing: null,
  playContext: 'discover',
  apiBase: 'https://de1.api.radio-browser.info/json'
}

init()

async function init() {
  ui.vol.value = String(load(STORE.volume, 1))
  ui.audio.volume = Number(ui.vol.value)
  ui.insecure.checked = !!load(STORE.includeInsecure, false)
  setupTabs()
  setupPlayerControls()
  setupInfiniteScroll()
  setupPwaInstall()
  await discoverApiBase()
  await loadLanguages()
  applyPreferredLanguage()
  await search(true)
}

function setupTabs() {
  for (const btn of [ui.tabDiscover, ui.tabFav, ui.tabRecent]) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab
      refreshList()
    })
  }
}

function setupPlayerControls() {
  ui.vol.addEventListener('input', () => {
    const v = Number(ui.vol.value)
    ui.audio.volume = v
    save(STORE.volume, v)
  })

  ui.playBtn.addEventListener('click', async () => {
    if (!state.playing) return
    if (ui.audio.paused) await ui.audio.play().catch(() => {})
    else ui.audio.pause()
    syncPlayButton()
  })

  ui.prevBtn.addEventListener('click', () => jump(-1))
  ui.nextBtn.addEventListener('click', () => jump(1))
  ui.favBtn.addEventListener('click', () => {
    if (!state.playing) return
    toggleFavorite(state.playing)
    refreshPlayerFav()
    refreshList()
  })

  ui.audio.addEventListener('play', syncPlayButton)
  ui.audio.addEventListener('pause', syncPlayButton)
  ui.audio.addEventListener('ended', () => jump(1))

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => ui.audio.play())
    navigator.mediaSession.setActionHandler('pause', () => ui.audio.pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => jump(-1))
    navigator.mediaSession.setActionHandler('nexttrack', () => jump(1))
  }
}

function setupInfiniteScroll() {
  const io = new IntersectionObserver((entries) => {
    const e = entries[0]
    if (!e.isIntersecting) return
    if (state.tab !== 'discover') return
    if (state.loading || !state.hasMore) return
    search(false)
  }, { rootMargin: '700px 0px' })
  io.observe(ui.sentinel)
}

function setupPwaInstall() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('./sw.js').catch(() => {})

  let deferred = null
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    ui.installBtn.hidden = false
  })
  ui.installBtn.addEventListener('click', async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    deferred = null
    ui.installBtn.hidden = true
  })
}

function setInfo(text) {
  ui.info.textContent = text
}

ui.searchBtn.addEventListener('click', () => search(true))
ui.q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search(true)
})
ui.insecure.addEventListener('change', () => {
  save(STORE.includeInsecure, ui.insecure.checked)
  search(true)
})
ui.lang.addEventListener('change', () => {
  if (ui.lang.value) save(STORE.preferredLanguage, ui.lang.value)
  search(true)
})

async function search(reset) {
  if (state.loading) return
  state.loading = true
  try {
    if (reset) {
      state.page = 0
      state.hasMore = true
      state.stations = []
      state.lastQuery = ui.q.value.trim()
      ui.list.innerHTML = ''
      ui.empty.hidden = true
      setInfo('搜索中…')
    }
    if (!state.hasMore) return

    const q = ui.q.value.trim()
    const lang = ui.lang.value
    const includeInsecure = ui.insecure.checked
    const offset = state.page * state.pageSize

    const payload = {
      name: q || undefined,
      language: lang || undefined,
      language_exact: !!lang,
      hidebroken: true,
      order: 'clickcount',
      reverse: true,
      offset,
      limit: state.pageSize
    }

    let results = await apiPost('/stations/search', payload)
    results = filterHttps(results, includeInsecure)

    if (results.length === 0 && lang && offset === 0) {
      const byLang = await apiGet(`/stations/bylanguage/${encodeURIComponent(lang)}?hidebroken=true&order=clickcount&reverse=true&offset=0&limit=${state.pageSize}`)
      results = filterHttps(byLang, includeInsecure)
    }

    if (results.length === 0) {
      state.hasMore = false
      if (state.page === 0) {
        ui.empty.hidden = false
        setInfo('没有结果')
      } else {
        setInfo('已加载到底')
      }
      return
    }

    state.page += 1
    state.stations.push(...results)
    setInfo(`已加载 ${state.stations.length} 个电台`)
    refreshList()
  } catch (_) {
    setInfo('加载失败，请稍后重试')
  } finally {
    state.loading = false
  }
}

function filterHttps(items, includeInsecure) {
  const out = []
  for (const s of (items || [])) {
    const url = s?.url_resolved || s?.url
    if (!url) continue
    if (!includeInsecure && !String(url).startsWith('https://')) continue
    out.push({ ...s, url_resolved: url })
  }
  return out
}

function refreshList() {
  const tab = state.tab
  ui.tabDiscover.classList.toggle('primary', tab === 'discover')
  ui.tabFav.classList.toggle('primary', tab === 'favorites')
  ui.tabRecent.classList.toggle('primary', tab === 'recent')

  let items = []
  if (tab === 'discover') items = state.stations
  if (tab === 'favorites') items = loadFavorites()
  if (tab === 'recent') items = loadRecent()

  ui.list.innerHTML = ''
  if (!items.length) {
    ui.empty.hidden = false
    ui.empty.textContent = tab === 'discover' ? '没有结果' : '暂无内容'
    return
  }
  ui.empty.hidden = true

  const frag = document.createDocumentFragment()
  for (const s of items) frag.appendChild(renderItem(s, tab))
  ui.list.appendChild(frag)
}

function renderItem(s, tab) {
  const card = document.createElement('div')
  card.className = 'card card-pad item'

  const main = document.createElement('div')
  main.className = 'item-main'
  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = s.name || '未命名电台'
  const sub = document.createElement('div')
  sub.className = 'item-sub muted'
  const bits = []
  if (s.country) bits.push(s.country)
  if (s.language) bits.push(s.language)
  if (s.codec) bits.push(s.codec)
  if (s.bitrate) bits.push(`${s.bitrate}kbps`)
  sub.textContent = bits.join(' · ')
  main.append(title, sub)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const play = document.createElement('button')
  play.className = 'btn primary'
  play.textContent = (state.playing && sameStation(state.playing, s) && !ui.audio.paused) ? '暂停' : '播放'
  play.addEventListener('click', async () => {
    if (state.playing && sameStation(state.playing, s)) {
      if (ui.audio.paused) await ui.audio.play().catch(() => {})
      else ui.audio.pause()
      syncPlayButton()
      refreshList()
      return
    }
    playStation(s, tab)
  })

  const fav = document.createElement('button')
  fav.className = 'btn'
  fav.textContent = isFavorite(s) ? '已收藏' : '收藏'
  fav.addEventListener('click', () => {
    toggleFavorite(s)
    refreshPlayerFav()
    refreshList()
  })

  actions.append(play, fav)
  card.append(main, actions)
  return card
}

function playStation(s, context) {
  const url = s?.url_resolved || s?.url
  if (!url) return
  state.playing = s
  state.playContext = context || 'discover'

  ui.audio.src = url
  ui.audio.play().catch(() => {})

  ui.nowTitle.textContent = s.name || '未命名电台'
  ui.nowSub.textContent = [s.country, s.language].filter(Boolean).join(' · ')
  refreshPlayerFav()
  syncPlayButton()
  pushRecent(s)

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.name || '全球FM',
      artist: s.country || '',
      album: s.language || ''
    })
  }
}

function syncPlayButton() {
  ui.playBtn.textContent = ui.audio.paused ? '播放' : '暂停'
}

function refreshPlayerFav() {
  ui.favBtn.textContent = (state.playing && isFavorite(state.playing)) ? '已收藏' : '收藏'
}

function jump(step) {
  const list = currentPlayList()
  if (!list.length) return
  const idx = state.playing ? list.findIndex(x => sameStation(x, state.playing)) : -1
  const next = idx < 0 ? 0 : (idx + step + list.length) % list.length
  playStation(list[next], state.playContext)
  refreshList()
}

function currentPlayList() {
  if (state.playContext === 'favorites') return loadFavorites()
  if (state.playContext === 'recent') return loadRecent()
  return state.stations
}

function sameStation(a, b) {
  const ida = a?.stationuuid || a?.uuid || a?.name
  const idb = b?.stationuuid || b?.uuid || b?.name
  return String(ida) === String(idb)
}

function loadFavorites() {
  return load(STORE.favorites, [])
}
function saveFavorites(list) {
  save(STORE.favorites, list)
}
function isFavorite(s) {
  const favs = loadFavorites()
  return favs.some(x => sameStation(x, s))
}
function toggleFavorite(s) {
  const favs = loadFavorites()
  const i = favs.findIndex(x => sameStation(x, s))
  if (i >= 0) favs.splice(i, 1)
  else favs.unshift(minStation(s))
  saveFavorites(favs.slice(0, 500))
}

function loadRecent() {
  return load(STORE.recent, [])
}
function pushRecent(s) {
  const rec = loadRecent().filter(x => !sameStation(x, s))
  rec.unshift(minStation(s))
  save(STORE.recent, rec.slice(0, 200))
}

function minStation(s) {
  return {
    stationuuid: s.stationuuid,
    name: s.name,
    country: s.country,
    language: s.language,
    codec: s.codec,
    bitrate: s.bitrate,
    url_resolved: s.url_resolved || s.url
  }
}

async function loadLanguages() {
  try {
    const langs = await apiGet('/languages?order=stationcount&reverse=true&hidebroken=true')
    const cleaned = (langs || [])
      .map(x => ({ name: x.name || '', count: x.stationcount || 0 }))
      .filter(x => x.name)
      .slice(0, 200)
    for (const l of cleaned) {
      const opt = document.createElement('option')
      opt.value = l.name
      opt.textContent = `${l.name} (${l.count})`
      ui.lang.appendChild(opt)
    }
  } catch (_) {}
}

function applyPreferredLanguage() {
  const preferred = load(STORE.preferredLanguage, 'english')
  const opts = Array.from(ui.lang.options)
  const match = opts.find(o => o.value.toLowerCase() === String(preferred).toLowerCase())
  if (match) ui.lang.value = match.value
}

async function discoverApiBase() {
  try {
    const res = await fetch('https://api.radio-browser.info/json/servers')
    const servers = await res.json()
    const pick = servers.sort((a, b) => String(a.name).localeCompare(String(b.name)))[0]
    if (pick?.name) state.apiBase = `https://${pick.name}/json`
  } catch (_) {}
}

async function apiGet(path) {
  const res = await fetch(`${state.apiBase}${path}`, { headers: { 'User-Agent': 'GlobalFM/1.0 (+web)' } })
  if (!res.ok) throw new Error('api')
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${state.apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'GlobalFM/1.0 (+web)' },
    body: JSON.stringify(body || {})
  })
  if (!res.ok) throw new Error('api')
  return res.json()
}

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch (_) {
    return fallback
  }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch (_) {}
}
