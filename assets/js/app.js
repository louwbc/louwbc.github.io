const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))

const state = {
  apiBase: 'https://de1.api.radio-browser.info/json',
  stations: [],
  playing: null,
  favorites: load('favorites', []),
  recent: load('recent', []),
  limit: 50,
  offset: 0,
  filters: null,
  langCounts: {},
  includeInsecure: load('includeInsecure', false),
  loading: false,
  hasMore: true,
  playContext: 'discover'
}

const audio = $('#audio')
const playBtn = $('#playBtn')
const stopBtn = $('#stopBtn')
const favBtn = $('#favBtn')
const volume = $('#volume')
const nowTitle = $('#nowTitle')
const nowSub = $('#nowSub')
const resultInfo = $('#resultInfo')
const sentinel = $('#sentinel')
const includeInsecureEl = $('#includeInsecure')
const prevBtn = $('#prevBtn')
const nextBtn = $('#nextBtn')

init()

async function init() {
  registerSW()
  discoverApiBase()
  bindUI()
  setVolume(load('volume', 1))
  await populateFilters()
  applyPreferredLanguage()
  await searchStations()
  renderFavs()
  renderRecent()
  setupMediaSession()
}

function bindUI() {
  $('#searchBtn').addEventListener('click', () => searchStations())
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchStations()
  })
  $('#languageSelect').addEventListener('change', (e) => {
    const v = e.target.value
    if (v) save('preferredLanguage', v)
    else localStorage.removeItem('preferredLanguage')
    searchStations()
  })
  includeInsecureEl.checked = !!state.includeInsecure
  includeInsecureEl.addEventListener('change', () => {
    state.includeInsecure = includeInsecureEl.checked
    save('includeInsecure', state.includeInsecure)
    searchStations()
  })
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && state.hasMore && !state.loading) {
        fetchStations(false)
      }
    }
  })
  io.observe(sentinel)
  volume.addEventListener('input', (e) => {
    setVolume(parseFloat(e.target.value))
  })
  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play()
    else audio.pause()
  })
  stopBtn.addEventListener('click', stop)
  prevBtn.addEventListener('click', prevStation)
  nextBtn.addEventListener('click', nextStation)
  favBtn.addEventListener('click', toggleFavCurrent)
  $('.tabs').addEventListener('click', (e) => {
    if (e.target.matches('.tab')) {
      const tab = e.target.dataset.tab
      $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
      $$('.panel').forEach(p => p.classList.toggle('active', p.id === tab))
    }
  })
  audio.addEventListener('play', () => $('#playIcon').textContent = '⏸')
  audio.addEventListener('pause', () => $('#playIcon').textContent = '▶')
  audio.addEventListener('ended', () => $('#playIcon').textContent = '▶')
  audio.addEventListener('error', () => {
    nowSub.textContent = '播放失败，尝试其它电台'
  })
}

async function populateFilters() {
  try {
    const [countries, languages, tags] = await Promise.all([
      api('/countries?order=name&hidebroken=true'),
      api('/languages?order=stationcount&reverse=true&hidebroken=true'),
      api('/tags?order=stationcount&reverse=true&hidebroken=true')
    ])
    const countrySelect = $('#countrySelect')
    countries.slice(0, 300).forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.name
      opt.textContent = `${c.name} (${c.stationcount})`
      countrySelect.appendChild(opt)
    })
    const langSelect = $('#languageSelect')
    languages.slice(0, 200).forEach(l => {
      const opt = document.createElement('option')
      opt.value = l.name
      opt.textContent = `${l.name} (${l.stationcount})`
      langSelect.appendChild(opt)
      state.langCounts[l.name] = l.stationcount
    })
    const genreSelect = $('#genreSelect')
    tags.slice(0, 200).forEach(t => {
      const opt = document.createElement('option')
      opt.value = t.name
      opt.textContent = `${t.name} (${t.stationcount})`
      genreSelect.appendChild(opt)
    })
  } catch (e) {
    console.warn('过滤条件加载失败', e)
  }
}

function applyPreferredLanguage() {
  const langSelect = $('#languageSelect')
  if (!langSelect) return
  if (langSelect.value) return
  const preferred = load('preferredLanguage', 'English')
  const opts = Array.from(langSelect.options || [])
  const match = opts.find(o => String(o.value).toLowerCase() === String(preferred).toLowerCase())
    || opts.find(o => String(o.value).toLowerCase() === 'english')
  if (match) langSelect.value = match.value
}

async function searchStations() {
  const name = $('#searchInput').value.trim()
  const country = $('#countrySelect').value
  const language = $('#languageSelect').value
  const tag = $('#genreSelect').value
  state.filters = { name, country, language, tag }
  state.offset = 0
  state.stations = []
  const listEl = $('#stationList')
  listEl.innerHTML = ''
  $('#emptyDiscover').hidden = true
  await fetchStations(true)
}

async function fetchStations(reset) {
  if (state.loading) return
  state.loading = true
  const { name, country, language, tag } = state.filters || {}
  const params = new URLSearchParams({
    order: 'votes',
    reverse: 'true',
    hidebroken: 'true',
    limit: String(state.limit),
    offset: String(state.offset),
  })
  if (name) params.set('name', name)
  if (country) params.set('country', country)
  if (language) {
    params.set('language', language)
    params.set('language_exact', 'true')
  }
  if (tag) params.set('tag', tag)
  let results = []
  try {
    results = await api('/stations/search?' + params.toString())
    if ((!results || results.length === 0) && language) {
      const enc = encodeURIComponent(language)
      const alt = new URLSearchParams({
        order: 'votes',
        reverse: 'true',
        hidebroken: 'true',
        limit: String(state.limit),
        offset: String(state.offset),
      })
      results = await api(`/stations/bylanguage/${enc}?${alt.toString()}`)
      if (country) results = results.filter(s => s.country === country)
      if (tag) {
        const t = tag.toLowerCase()
        results = results.filter(s => (s.tags || '').toLowerCase().includes(t))
      }
    }
  } catch (e) {
    results = []
  }
  results = results.filter(s => s.url_resolved && (state.includeInsecure || s.url_resolved.startsWith('https')))
  if (!results.length && state.stations.length === 0) {
    $('#emptyDiscover').hidden = false
  }
  const listEl = $('#stationList')
  for (const s of results) {
    const li = renderStationItem(s, 'discover')
    listEl.appendChild(li)
  }
  state.stations.push(...results)
  state.offset += results.length
  state.hasMore = results.length >= state.limit
  updateResultInfo()
  state.loading = false
}

function renderStationItem(s, list) {
  const li = document.createElement('li')
  li.className = 'item'
  const play = document.createElement('button')
  play.className = 'icon-btn'
  play.textContent = '▶'
  play.addEventListener('click', () => playStation(s, list || 'discover'))
  const meta = document.createElement('div')
  meta.className = 'meta'
  const name = document.createElement('div')
  name.className = 'name'
  name.textContent = s.name || '未命名电台'
  const sub = document.createElement('div')
  sub.className = 'sub'
  sub.textContent = [s.country, s.language, s.codec?.toUpperCase(), s.bitrate ? `${s.bitrate}kbps` : ''].filter(Boolean).join(' · ')
  meta.append(name, sub)
  const actions = document.createElement('div')
  actions.className = 'actions'
  const fav = document.createElement('button')
  fav.className = 'icon-btn'
  fav.textContent = isFav(s) ? '★' : '☆'
  fav.addEventListener('click', () => {
    toggleFav(s)
    fav.textContent = isFav(s) ? '★' : '☆'
    renderFavs()
  })
  actions.append(fav)
  li.append(play, meta, actions)
  return li
}

function updateResultInfo() {
  const { language } = state.filters || {}
  const total = language ? state.langCounts[language] : null
  const parts = []
  parts.push(`已加载 ${state.stations.length} 条`)
  if (total != null) parts.push(`该语言目录总数 ${total} 条`)
  parts.push(state.includeInsecure ? `包含非HTTPS流` : `仅展示 HTTPS 可用流`)
  resultInfo.textContent = parts.join(' · ')
  resultInfo.hidden = false
}

function playStation(s, list) {
  if (!s?.url_resolved) return
  audio.src = s.url_resolved
  audio.play().catch(() => {})
  state.playing = s
  state.playContext = list || state.playContext || 'discover'
  nowTitle.textContent = s.name || '未命名电台'
  nowSub.textContent = [s.country, s.tags].filter(Boolean).join(' · ')
  favBtn.textContent = isFav(s) ? '★' : '☆'
  addRecent(s)
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.name || 'Radio',
      artist: s.country || '',
      album: '全球FM收音机',
      artwork: [
        { src: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' }
      ]
    })
  }
}

function stop() {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  nowTitle.textContent = '未播放'
  nowSub.textContent = ''
}

function toggleFavCurrent() {
  if (!state.playing) return
  toggleFav(state.playing)
  favBtn.textContent = isFav(state.playing) ? '★' : '☆'
  renderFavs()
}

function isFav(s) {
  return state.favorites.some(x => x.stationuuid === s.stationuuid)
}

function toggleFav(s) {
  const i = state.favorites.findIndex(x => x.stationuuid === s.stationuuid)
  if (i >= 0) state.favorites.splice(i, 1)
  else state.favorites.unshift(s)
  state.favorites = state.favorites.slice(0, 200)
  save('favorites', state.favorites)
}

function addRecent(s) {
  const filtered = state.recent.filter(x => x.stationuuid !== s.stationuuid)
  filtered.unshift(s)
  state.recent = filtered.slice(0, 50)
  save('recent', state.recent)
  renderRecent()
}

function renderFavs() {
  const list = $('#favList')
  list.innerHTML = ''
  if (!state.favorites.length) {
    $('#emptyFav').style.display = ''
    return
  }
  $('#emptyFav').style.display = 'none'
  for (const s of state.favorites) {
    const li = renderStationItem(s, 'favorites')
    list.appendChild(li)
  }
}

function renderRecent() {
  const list = $('#recentList')
  list.innerHTML = ''
  if (!state.recent.length) {
    $('#emptyRecent').style.display = ''
    return
  }
  $('#emptyRecent').style.display = 'none'
  for (const s of state.recent) {
    const li = renderStationItem(s, 'recent')
    list.appendChild(li)
  }
}

async function api(path) {
  const url = `${state.apiBase}${path}`
  const res = await fetch(url, { headers: { 'User-Agent': 'SoloRadio/1.0 (+web)' } })
  if (!res.ok) throw new Error('API error')
  return res.json()
}

async function discoverApiBase() {
  try {
    const res = await fetch('https://api.radio-browser.info/json/servers')
    const servers = await res.json()
    const fastest = servers.sort((a,b) => a.name.localeCompare(b.name))[0]
    if (fastest?.name) state.apiBase = `https://${fastest.name}/json`
  } catch (_) {}
}

function setVolume(v) {
  audio.volume = v
  volume.value = String(v)
  save('volume', v)
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.setActionHandler('play', () => audio.play())
  navigator.mediaSession.setActionHandler('pause', () => audio.pause())
  navigator.mediaSession.setActionHandler('stop', stop)
  navigator.mediaSession.setActionHandler('previoustrack', prevStation)
  navigator.mediaSession.setActionHandler('nexttrack', nextStation)
}

// PWA
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        location.reload()
      })
    }).catch(() => {})
  }
  let deferredPrompt = null
  const btn = $('#installBtn')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    btn.hidden = false
  })
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    btn.hidden = true
  })
}

function getCurrentList() {
  if (state.playContext === 'favorites') return state.favorites
  if (state.playContext === 'recent') return state.recent
  return state.stations
}

function findCurrentIndex(arr) {
  if (!state.playing) return -1
  const id = state.playing.stationuuid
  return arr.findIndex(x => x.stationuuid === id)
}

function nextStation() {
  const arr = getCurrentList()
  if (!arr.length) return
  let i = findCurrentIndex(arr)
  i = (i >= 0) ? (i + 1) % arr.length : 0
  playStation(arr[i], state.playContext)
}

function prevStation() {
  const arr = getCurrentList()
  if (!arr.length) return
  let i = findCurrentIndex(arr)
  i = (i >= 0) ? (i - 1 + arr.length) % arr.length : 0
  playStation(arr[i], state.playContext)
}
