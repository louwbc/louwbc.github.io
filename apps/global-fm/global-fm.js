const $ = (s) => document.querySelector(s)

const ui = {
  q: $('#q'),
  tag: $('#tag'),
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
  tabPodcasts: $('#tabPodcasts'),
  exportFavBtn: $('#exportFavBtn'),
  importFavBtn: $('#importFavBtn'),
  importFavFile: $('#importFavFile'),
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
  preferredLanguage: 'global-fm:preferredLanguage',
  preferredTag: 'global-fm:preferredTag',
  podcasts: 'global-fm:podcasts',
  recommendedCache: 'global-fm:recommendedCache',
  recommendedCacheMeta: 'global-fm:recommendedCacheMeta',
  recommendedCountry: 'global-fm:recommendedCountry'
}

const FALLBACK_RECOMMENDED_PODCASTS = [
  { id: 'https://feeds.simplecast.com/Sl5CSM3S', title: 'The Daily', feedUrl: 'https://feeds.simplecast.com/Sl5CSM3S', language: '' },
  { id: 'https://feeds.simplecast.com/tOjNXec5', title: 'The Joe Rogan Experience', feedUrl: 'https://feeds.simplecast.com/tOjNXec5', language: '' },
  { id: 'https://feeds.simplecast.com/5y9M3Z9t', title: 'Crime Junkie', feedUrl: 'https://feeds.simplecast.com/5y9M3Z9t', language: '' },
  { id: 'https://feeds.simplecast.com/54nAGcIl', title: 'The Daily (alt)', feedUrl: 'https://feeds.simplecast.com/54nAGcIl', language: '' }
]

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
  podcastView: 'recommended',
  podcastSearching: false,
  podcastExternalSearching: false,
  podcastExternalResults: [],
  podcastExternalKeyword: '',
  podcastExternalCountry: '',
  podcastFilterLang: '',
  podcastFilterKeyword: '',
  podcastFilterFrom: '',
  podcastFilterTo: '',
  podcastSelectedId: null,
  podcastEpisodes: [],
  recommendedCountry: load(STORE.recommendedCountry, 'english-learning'),
  recommendedLoading: false,
  apiBase: 'https://de1.api.radio-browser.info/json'
}

const TAB_BTNS = [ui.tabFav, ui.tabDiscover, ui.tabRecent, ui.tabPodcasts]

init()

async function init() {
  ui.vol.value = String(load(STORE.volume, 1))
  ui.audio.volume = Number(ui.vol.value)
  ui.insecure.checked = !!load(STORE.includeInsecure, false)
  setupFavoritesBackup()
  setupTabs()
  setupPlayerControls()
  setupInfiniteScroll()
  setupPwaInstall()
  await discoverApiBase()
  await loadLanguages()
  applyPreferredLanguage()
  await loadTags()
  applyPreferredTag()
  setDefaultTab()
  const cachedRec = loadRecommendedCache()
  if (!cachedRec || !cachedRec.length) loadBundledRecommended(true)
  if (state.tab === 'discover') await search(true)
  else setInfo('已显示收藏')
}

function setupFavoritesBackup() {
  ui.exportFavBtn.addEventListener('click', () => exportFavorites())
  ui.importFavBtn.addEventListener('click', () => ui.importFavFile.click())
  ui.importFavFile.addEventListener('change', async () => {
    const file = ui.importFavFile.files?.[0]
    ui.importFavFile.value = ''
    if (!file) return
    await importFavoritesFromFile(file)
  })
}

function exportFavorites() {
  const favorites = loadFavorites().map(minStation)
  const payload = {
    schema: 'global-fm-favorites',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `global-fm-favorites-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  setInfo(`已导出 ${favorites.length} 个收藏`)
}

async function importFavoritesFromFile(file) {
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : (parsed?.favorites || [])
    if (!Array.isArray(list)) {
      setInfo('导入失败：文件格式不正确')
      return
    }

    const incoming = []
    for (const s of list) {
      const url = s?.url_resolved || s?.url
      if (!url) continue
      incoming.push(minStation({ ...s, url_resolved: url }))
    }
    if (!incoming.length) {
      setInfo('导入失败：没有可用的电台数据')
      return
    }

    const merged = mergeUniqueStations(incoming, loadFavorites())
    saveFavorites(merged.slice(0, 500))
    refreshPlayerFav()
    refreshList()
    setInfo(`已导入 ${incoming.length} 个收藏（当前共 ${merged.length} 个）`)
  } catch (_) {
    setInfo('导入失败：无法解析文件')
  }
}

function mergeUniqueStations(primary, secondary) {
  const out = []
  for (const s of (primary || [])) {
    if (!out.some(x => sameStation(x, s))) out.push(s)
  }
  for (const s of (secondary || [])) {
    if (!out.some(x => sameStation(x, s))) out.push(s)
  }
  return out
}

function setDefaultTab() {
  const favs = loadFavorites()
  state.tab = favs.length ? 'favorites' : 'discover'
  refreshList()
}

function setupTabs() {
  for (const btn of TAB_BTNS) {
    btn.addEventListener('click', () => {
      setTab(btn.dataset.tab, false)
    })
    btn.addEventListener('keydown', (e) => {
      const key = e.key
      if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return
      e.preventDefault()
      const current = TAB_BTNS.findIndex(x => x === btn)
      const nextIdx =
        key === 'Home' ? 0 :
        key === 'End' ? (TAB_BTNS.length - 1) :
        key === 'ArrowLeft' ? (current - 1 + TAB_BTNS.length) % TAB_BTNS.length :
        (current + 1) % TAB_BTNS.length
      const nextBtn = TAB_BTNS[nextIdx]
      setTab(nextBtn.dataset.tab, true)
    })
  }
}

function setTab(tab, focus) {
  state.tab = tab
  if (state.tab !== 'podcasts') {
    state.podcastSelectedId = null
    state.podcastEpisodes = []
  } else {
    const mine = loadPodcasts()
    if (!mine.length) state.podcastView = 'recommended'
  }
  refreshList()
  if (state.tab === 'discover' && !state.stations.length) search(true)
  if (focus) {
    const btn = TAB_BTNS.find(x => x.dataset.tab === state.tab)
    btn?.focus()
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
    if (ui.audio.paused) await ui.audio.play().catch((err) => onPlayError(err))
    else ui.audio.pause()
    syncPlayButton()
  })

  ui.prevBtn.addEventListener('click', () => jump(-1))
  ui.nextBtn.addEventListener('click', () => jump(1))
  ui.favBtn.addEventListener('click', () => {
    if (!state.playing) return
    if (isEpisode(state.playing)) return
    toggleFavorite(state.playing)
    refreshPlayerFav()
    refreshList()
  })

  ui.audio.addEventListener('play', syncPlayButton)
  ui.audio.addEventListener('pause', syncPlayButton)
  ui.audio.addEventListener('ended', () => jump(1))
  ui.audio.addEventListener('error', () => setInfo('播放失败：音频源不可用或已断开'))
  ui.audio.addEventListener('waiting', () => {
    if (!ui.audio.paused && state.playing) setInfo('缓冲中…')
  })

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
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistration('./').then(r => r?.unregister()).catch(() => {})
    return
  }
  navigator.serviceWorker.register('./sw.js').then((reg) => reg.update().catch(() => {})).catch(() => {})

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

ui.searchBtn.addEventListener('click', () => {
  setTab('discover', false)
  search(true)
})
ui.q.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  setTab('discover', false)
  search(true)
})
ui.insecure.addEventListener('change', () => {
  save(STORE.includeInsecure, ui.insecure.checked)
  setTab('discover', false)
  search(true)
})
ui.lang.addEventListener('change', () => {
  if (ui.lang.value) save(STORE.preferredLanguage, ui.lang.value)
  setTab('discover', false)
  search(true)
})
ui.tag.addEventListener('change', () => {
  if (ui.tag.value) save(STORE.preferredTag, ui.tag.value)
  else save(STORE.preferredTag, '')
  setTab('discover', false)
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
    const tag = ui.tag.value
    const lang = ui.lang.value
    const includeInsecure = ui.insecure.checked
    const offset = state.page * state.pageSize

    const payload = {
      name: q || undefined,
      tag: tag || undefined,
      tag_exact: false,
      language: lang || undefined,
      language_exact: false,
      hidebroken: true,
      order: 'clickcount',
      reverse: true,
      offset,
      limit: state.pageSize
    }

    let results = await apiPost('/stations/search', payload)
    results = filterHttps(results, includeInsecure)

    if (results.length === 0 && offset === 0) {
      if (tag && !q && !lang) {
        const byTag = await apiGet(`/stations/bytag/${encodeURIComponent(tag)}?hidebroken=true&order=clickcount&reverse=true&offset=0&limit=${state.pageSize}`)
        results = filterHttps(byTag, includeInsecure)
      } else if (lang && !q && !tag) {
        const byLang = await apiGet(`/stations/bylanguage/${encodeURIComponent(lang)}?hidebroken=true&order=clickcount&reverse=true&offset=0&limit=${state.pageSize}`)
        results = filterHttps(byLang, includeInsecure)
      }
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
  for (const btn of TAB_BTNS) {
    const active = btn.dataset.tab === tab
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-selected', active ? 'true' : 'false')
    btn.tabIndex = active ? 0 : -1
  }

  let items = []
  if (tab === 'discover') items = state.stations
  if (tab === 'favorites') items = loadFavorites()
  if (tab === 'recent') items = loadRecent()
  if (tab === 'podcasts') {
    if (state.podcastSelectedId) items = filterEpisodes(state.podcastEpisodes)
    else if (state.podcastView === 'external') items = filterExternalPodcastResults(state.podcastExternalResults)
    else {
      const base = (state.podcastView === 'mine') ? loadPodcasts() : getRecommendedPodcasts()
      items = filterPodcastSources(base)
    }
  }

  ui.list.innerHTML = ''
  if (tab === 'podcasts') {
    ui.empty.hidden = true
    ui.empty.textContent = ''
    const frag = document.createDocumentFragment()
    frag.appendChild(renderPodcastsHeader())
    if (!items.length) {
      frag.appendChild(renderPodcastsEmptyCard())
    } else if (state.podcastSelectedId) {
      for (const s of items) frag.appendChild(renderEpisodeItem(s))
    } else if (state.podcastView === 'external') {
      for (const s of items) frag.appendChild(renderExternalPodcastItem(s))
    } else {
      for (const s of items) frag.appendChild(renderPodcastItem(s, state.podcastView))
    }
    ui.list.appendChild(frag)
    return
  }
  if (!items.length) {
    ui.empty.hidden = false
    if (tab === 'favorites') {
      ui.empty.textContent = ''
      const wrap = document.createElement('div')
      wrap.className = 'card card-pad'
      const title = document.createElement('div')
      title.textContent = '还没有收藏'
      title.style.fontWeight = '700'
      const tip = document.createElement('div')
      tip.className = 'muted'
      tip.style.marginTop = '6px'
      tip.textContent = '去“发现”里找到电台后，点 ☆ 收藏。'
      const btn = document.createElement('button')
      btn.className = 'btn primary'
      btn.style.marginTop = '12px'
      btn.textContent = '去发现'
      btn.addEventListener('click', () => {
        state.tab = 'discover'
        refreshList()
        if (!state.stations.length) search(true)
      })
      wrap.append(title, tip, btn)
      ui.empty.appendChild(wrap)
    } else {
      if (tab === 'discover') ui.empty.textContent = '没有结果：可以试试切换分类/语言，或勾选“包含非HTTPS”'
      else if (tab === 'recent') ui.empty.textContent = '暂无内容：去“发现”播放一个电台，最近会出现在这里'
      else ui.empty.textContent = '暂无内容'
    }
    return
  }
  ui.empty.hidden = true

  const frag = document.createDocumentFragment()
  for (const s of items) frag.appendChild(renderStationItem(s, tab))
  ui.list.appendChild(frag)
}

function renderPodcastsEmptyCard() {
  const wrap = document.createElement('div')
  wrap.className = 'card card-pad'
  const title = document.createElement('div')
  title.textContent = state.podcastSelectedId
    ? '没有可播放的剧集'
    : (state.podcastView === 'mine'
      ? '还没有播客源'
      : (state.podcastView === 'external' ? '没有外部搜索结果' : '没有推荐播客'))
  title.style.fontWeight = '700'
  const tip = document.createElement('div')
  tip.className = 'muted'
  tip.style.marginTop = '6px'
  tip.textContent = state.podcastSelectedId
    ? '这个播客源可能不支持跨域（CORS），或者没有可用音频链接。'
    : (state.podcastView === 'mine'
      ? '添加一个播客 RSS 地址后，就可以像电台一样连续收听剧集。'
      : (state.podcastView === 'external'
        ? '输入关键词后点“搜索更多”，先找节目，再跳到外部页面继续收听。'
        : '暂无推荐。你可以切换到“我添加的”或自己添加一个播客 RSS。'))

  wrap.append(title, tip)
  if (!state.podcastSelectedId) {
    const row = document.createElement('div')
    row.className = 'row'
    row.style.marginTop = '12px'
    row.style.alignItems = 'center'
    const input = document.createElement('input')
    input.className = 'input'
    input.type = 'url'
    input.inputMode = 'url'
    input.placeholder = '粘贴播客 RSS 地址（需支持跨域/CORS）…'
    input.autocomplete = 'off'
    input.style.flex = '1 1 320px'
    const addBtn = document.createElement('button')
    addBtn.className = 'btn primary'
    addBtn.textContent = '添加'
    const onAdd = async () => {
      const feedUrl = normalizeUrl(input.value)
      if (!feedUrl) return
      input.value = ''
      await addPodcast(feedUrl, feedUrl, true)
    }
    addBtn.addEventListener('click', onAdd)
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      onAdd()
    })
    row.append(input, addBtn)
    wrap.appendChild(row)
  }
  return wrap
}

function renderStationItem(s, tab) {
  const card = document.createElement('div')
  card.className = 'card card-pad item'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `播放 ${s.name || '未命名电台'}`)
  if (state.playing && sameMedia(state.playing, s)) card.classList.add('playing')
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    playStation(s, tab)
  })
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('button')) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    playStation(s, tab)
  })

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
  play.className = 'btn primary icon-btn'
  const isCurrent = state.playing && sameMedia(state.playing, s)
  play.textContent = (isCurrent && !ui.audio.paused) ? '⏸' : '▶'
  play.setAttribute('aria-label', isCurrent ? '播放/暂停' : '播放')
  play.addEventListener('click', async () => {
    if (state.playing && sameMedia(state.playing, s)) {
      if (ui.audio.paused) await ui.audio.play().catch((err) => onPlayError(err))
      else ui.audio.pause()
      syncPlayButton()
      refreshList()
      return
    }
    playStation(s, tab)
  })

  const fav = document.createElement('button')
  fav.className = 'btn icon-btn'
  fav.textContent = isFavorite(s) ? '★' : '☆'
  fav.setAttribute('aria-label', isFavorite(s) ? '取消收藏' : '收藏')
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
  state.podcastSelectedId = null
  state.podcastEpisodes = []
  state.playing = s
  state.playContext = context || 'discover'

  ui.audio.crossOrigin = 'anonymous'
  ui.audio.src = url
  ui.audio.play().catch((err) => onPlayError(err))

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

function onPlayError(err) {
  const name = String(err?.name || '')
  if (name === 'NotAllowedError') setInfo('播放失败：浏览器阻止了自动播放，请再点一次播放')
  else if (state.playing && isEpisode(state.playing)) setInfo('播放失败：该播客剧集音频不可用或跨域限制')
  else setInfo('播放失败：请换一个电台试试')
  syncPlayButton()
}

function syncPlayButton() {
  ui.playBtn.textContent = ui.audio.paused ? '▶' : '⏸'
}

function refreshPlayerFav() {
  if (!state.playing || isEpisode(state.playing)) {
    ui.favBtn.disabled = true
    ui.favBtn.textContent = '☆'
    return
  }
  ui.favBtn.disabled = false
  ui.favBtn.textContent = isFavorite(state.playing) ? '★' : '☆'
}

function jump(step) {
  const list = currentPlayList()
  if (!list.length) return
  const idx = state.playing ? list.findIndex(x => sameMedia(x, state.playing)) : -1
  const next = idx < 0 ? 0 : (idx + step + list.length) % list.length
  playAny(list[next], state.playContext)
  refreshList()
}

function currentPlayList() {
  if (state.playContext === 'podcasts') return state.podcastEpisodes
  if (state.playContext === 'favorites') return loadFavorites()
  if (state.playContext === 'recent') return loadRecent()
  return state.stations
}

function sameStation(a, b) {
  const ida = a?.stationuuid || a?.uuid || a?.name
  const idb = b?.stationuuid || b?.uuid || b?.name
  return String(ida) === String(idb)
}

function isEpisode(x) {
  return x?.kind === 'episode'
}

function episodeId(x) {
  return x?.guid || x?.id || x?.audioUrl || x?.title
}

function sameMedia(a, b) {
  if (isEpisode(a) || isEpisode(b)) return isEpisode(a) && isEpisode(b) && String(episodeId(a)) === String(episodeId(b))
  return sameStation(a, b)
}

function playAny(item, context) {
  if (isEpisode(item)) playEpisode(item, context)
  else playStation(item, context)
}

function loadPodcasts() {
  return load(STORE.podcasts, [])
}

function savePodcasts(list) {
  save(STORE.podcasts, list)
}

function loadRecommendedCache() {
  const list = load(STORE.recommendedCache, null)
  return Array.isArray(list) ? list : null
}

function saveRecommendedCache(list, meta) {
  save(STORE.recommendedCache, Array.isArray(list) ? list : [])
  save(STORE.recommendedCacheMeta, meta || {})
}

function getRecommendedPodcasts() {
  const cached = loadRecommendedCache()
  if (cached && cached.length) return cached
  return FALLBACK_RECOMMENDED_PODCASTS
}

function normalizeUrl(u) {
  try {
    const url = new URL(String(u || '').trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch (_) {
    return ''
  }
}

async function addPodcast(feedUrl, title, openAfterAdd, language) {
  const normalized = normalizeUrl(feedUrl)
  if (!normalized) return
  const list = loadPodcasts()
  const exists = list.some(x => String(x.feedUrl) === String(normalized))
  if (exists) {
    if (openAfterAdd) {
      state.tab = 'podcasts'
      state.podcastSelectedId = normalized
      await openPodcast(normalized)
    }
    return
  }
  const added = { id: normalized, title: title || normalized, feedUrl: normalized, language: language || '', addedAt: Date.now() }
  savePodcasts([added, ...list].slice(0, 50))
  if (openAfterAdd) {
    state.podcastView = 'mine'
    state.tab = 'podcasts'
    state.podcastSelectedId = normalized
    await openPodcast(normalized)
  } else {
    refreshList()
    setInfo('已添加到“我添加的”')
  }
}

async function loadBundledRecommended(silent) {
  if (state.recommendedLoading) return
  state.recommendedLoading = true
  refreshList()
  try {
    if (!silent) setInfo('加载推荐中…')
    const res = await fetch('./recommended-podcasts.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('recommended')
    const parsed = await res.json()
    if (!Array.isArray(parsed)) throw new Error('format')
    const seen = new Set()
    const out = []
    for (const p of parsed) {
      const feedUrl = normalizeUrl(p?.feedUrl || p?.id || '')
      if (!feedUrl || seen.has(feedUrl)) continue
      seen.add(feedUrl)
      const title = String(p?.title || feedUrl)
      const language = String(p?.language || '')
      out.push({ id: feedUrl, title, feedUrl, language })
    }
    if (out.length) {
      saveRecommendedCache(out, { source: 'bundled', loadedAt: Date.now(), count: out.length })
      if (state.tab === 'podcasts' && state.podcastView === 'recommended' && !state.podcastSelectedId) refreshList()
      if (!silent) setInfo(`已加载 ${out.length} 个推荐播客`)
    } else {
      if (!silent) setInfo('没有可用的推荐播客')
    }
  } catch (_) {
    if (!silent) setInfo('加载失败：无法读取推荐播客列表')
  } finally {
    state.recommendedLoading = false
    refreshList()
  }
}

function renderPodcastsHeader() {
  const card = document.createElement('div')
  card.className = 'card card-pad'
  const row = document.createElement('div')
  row.className = 'row'
  row.style.alignItems = 'center'
  row.style.justifyContent = 'space-between'

  const left = document.createElement('div')
  left.style.fontWeight = '700'
  if (state.podcastSelectedId) {
    if (state.podcastSelectedId === 'search') left.textContent = '搜索结果'
    else {
      const p = getPodcastSourceById(state.podcastSelectedId)
      left.textContent = p?.title || '播客'
    }
  } else {
    left.textContent = '播客'
  }

  const actions = document.createElement('div')
  actions.className = 'row'
  actions.style.gap = '8px'
  actions.style.flexWrap = 'nowrap'

  if (state.podcastSelectedId) {
    const back = document.createElement('button')
    back.className = 'btn'
    back.textContent = '返回'
    back.addEventListener('click', () => {
      state.podcastSelectedId = null
      state.podcastEpisodes = []
      refreshList()
      setInfo('已显示播客源')
    })
    actions.append(back)
  } else {
    const tabs = document.createElement('div')
    tabs.className = 'row tabs'
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', '播客列表切换')

    const rec = document.createElement('button')
    rec.className = 'btn tab'
    rec.textContent = '推荐'
    rec.setAttribute('role', 'tab')
    rec.classList.toggle('active', state.podcastView === 'recommended')
    rec.setAttribute('aria-selected', state.podcastView === 'recommended' ? 'true' : 'false')
    rec.tabIndex = state.podcastView === 'recommended' ? 0 : -1
    rec.addEventListener('click', () => {
      state.podcastView = 'recommended'
      refreshList()
      setInfo('已显示推荐播客')
    })

    const mine = document.createElement('button')
    mine.className = 'btn tab'
    mine.textContent = '我添加的'
    mine.setAttribute('role', 'tab')
    mine.classList.toggle('active', state.podcastView === 'mine')
    mine.setAttribute('aria-selected', state.podcastView === 'mine' ? 'true' : 'false')
    mine.tabIndex = state.podcastView === 'mine' ? 0 : -1
    mine.addEventListener('click', () => {
      state.podcastView = 'mine'
      refreshList()
      setInfo('已显示我添加的播客')
    })

    const external = document.createElement('button')
    external.className = 'btn tab'
    external.textContent = '搜索更多'
    external.setAttribute('role', 'tab')
    external.classList.toggle('active', state.podcastView === 'external')
    external.setAttribute('aria-selected', state.podcastView === 'external' ? 'true' : 'false')
    external.tabIndex = state.podcastView === 'external' ? 0 : -1
    external.addEventListener('click', () => {
      state.podcastView = 'external'
      refreshList()
      setInfo(state.podcastExternalResults.length ? '已显示外部搜索结果' : '输入关键词后点“搜索更多”')
    })

    tabs.append(rec, mine, external)
    actions.append(tabs)
  }

  row.append(left, actions)
  const row2 = document.createElement('div')
  row2.className = 'row'
  row2.style.marginTop = '10px'
  row2.style.alignItems = 'center'
  const input = document.createElement('input')
  input.className = 'input'
  input.type = 'url'
  input.inputMode = 'url'
  input.placeholder = '粘贴播客 RSS 地址（需支持跨域/CORS）…'
  input.autocomplete = 'off'
  input.style.flex = '1 1 320px'
  const add = document.createElement('button')
  add.className = 'btn primary'
  add.textContent = '添加'
  const onAdd = async () => {
    const feedUrl = normalizeUrl(input.value)
    if (!feedUrl) return
    input.value = ''
    await addPodcast(feedUrl, feedUrl, true)
  }
  add.addEventListener('click', onAdd)
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    onAdd()
  })
  row2.append(input, add)

  const rowRec = document.createElement('div')
  rowRec.className = 'row'
  rowRec.style.marginTop = '10px'
  rowRec.style.alignItems = 'center'

  const loadBtn = document.createElement('button')
  loadBtn.className = 'btn'
  loadBtn.textContent = state.recommendedLoading ? '加载中…' : '更新推荐'
  loadBtn.disabled = !!state.recommendedLoading
  loadBtn.addEventListener('click', async () => {
    await loadBundledRecommended(false)
  })

  const recMeta = load(STORE.recommendedCacheMeta, {})
  const recTip = document.createElement('div')
  recTip.className = 'muted'
  recTip.style.flex = '1 1 260px'
  const count = Number(recMeta?.count) || (loadRecommendedCache()?.length || 0)
  const date = Number.isFinite(recMeta?.loadedAt) ? fmtDate(recMeta.loadedAt) : ''
  recTip.textContent = (recMeta?.source === 'bundled')
    ? `当前：${count} 个（${date || '未记录日期'}）`
    : `当前：${count || '未加载'} 个（可点“更新推荐”加载更多）`

  rowRec.append(loadBtn, recTip)

  const row3 = document.createElement('div')
  row3.className = 'row'
  row3.style.marginTop = '10px'
  row3.style.alignItems = 'center'

  const lang = document.createElement('select')
  lang.className = 'input'
  lang.setAttribute('aria-label', '播客语言')
  lang.style.flex = '0 1 180px'
  lang.appendChild(new Option('所有语言', ''))
  for (const v of availablePodcastLanguages()) {
    const label = v === 'unknown' ? '未知' : v
    lang.appendChild(new Option(label, v))
  }
  lang.value = state.podcastFilterLang || ''
  lang.addEventListener('change', () => {
    state.podcastFilterLang = lang.value
    refreshList()
  })

  const country = document.createElement('select')
  country.className = 'input'
  country.setAttribute('aria-label', '外部搜索地区')
  country.style.flex = '0 1 170px'
  country.appendChild(new Option('全部地区', ''))
  for (const opt of podcastExternalCountryOptions()) {
    country.appendChild(new Option(opt.label, opt.value))
  }
  country.value = state.podcastExternalCountry || ''
  country.addEventListener('change', () => {
    state.podcastExternalCountry = country.value
    if (state.podcastView === 'external' && state.podcastExternalResults.length) refreshList()
  })

  const from = document.createElement('input')
  from.className = 'input'
  from.type = 'date'
  from.setAttribute('aria-label', '起始日期')
  from.style.flex = '0 1 170px'
  from.value = state.podcastFilterFrom || ''
  from.addEventListener('change', () => {
    state.podcastFilterFrom = from.value
    if (state.tab === 'podcasts') refreshList()
  })

  const to = document.createElement('input')
  to.className = 'input'
  to.type = 'date'
  to.setAttribute('aria-label', '截止日期')
  to.style.flex = '0 1 170px'
  to.value = state.podcastFilterTo || ''
  to.addEventListener('change', () => {
    state.podcastFilterTo = to.value
    if (state.tab === 'podcasts') refreshList()
  })

  const kw = document.createElement('input')
  kw.className = 'input'
  kw.type = 'search'
  kw.placeholder = '关键词（回车筛选）…'
  kw.setAttribute('aria-label', '播客关键词')
  kw.autocomplete = 'off'
  kw.style.flex = '1 1 220px'
  kw.value = state.podcastFilterKeyword || ''
  kw.addEventListener('input', () => { state.podcastFilterKeyword = kw.value })
  kw.addEventListener('change', () => refreshList())
  kw.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (state.podcastView === 'external') searchExternalPodcasts()
    else refreshList()
  })

  const searchBtn = document.createElement('button')
  searchBtn.className = 'btn primary'
  searchBtn.textContent = state.podcastSearching ? '搜索中…' : '搜索可播放剧集'
  searchBtn.disabled = !!state.podcastSearching
  searchBtn.addEventListener('click', () => searchPodcastEpisodes())

  const moreBtn = document.createElement('button')
  moreBtn.className = 'btn'
  moreBtn.textContent = state.podcastExternalSearching ? '外部搜索中…' : '搜索更多'
  moreBtn.disabled = !!state.podcastExternalSearching
  moreBtn.addEventListener('click', () => searchExternalPodcasts())

  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn'
  clearBtn.textContent = '清除筛选'
  clearBtn.addEventListener('click', () => {
    state.podcastFilterLang = ''
    state.podcastFilterKeyword = ''
    state.podcastFilterFrom = ''
    state.podcastFilterTo = ''
    state.podcastExternalResults = []
    state.podcastExternalKeyword = ''
    if (state.podcastView === 'external') state.podcastView = 'recommended'
    refreshList()
    setInfo('已清除筛选')
  })

  row3.append(lang, country, from, to, kw, searchBtn, moreBtn, clearBtn)
  card.append(row, row2, rowRec, row3)
  return card
}

function renderPodcastItem(p, view) {
  const isMine = view === 'mine'
  const card = document.createElement('div')
  card.className = 'card card-pad item'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `打开播客 ${p.title || '未命名播客'}`)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    openPodcast(p.id)
  })
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('button')) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    openPodcast(p.id)
  })

  const main = document.createElement('div')
  main.className = 'item-main'
  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = p.title || '未命名播客'
  const sub = document.createElement('div')
  sub.className = 'item-sub muted'
  sub.textContent = p.feedUrl || ''
  main.append(title, sub)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const open = document.createElement('button')
  open.className = 'btn primary icon-btn'
  open.textContent = '▶'
  open.setAttribute('aria-label', '打开并播放')
  open.addEventListener('click', async () => {
    await openPodcast(p.id, true)
  })

  if (isMine) {
    const del = document.createElement('button')
    del.className = 'btn icon-btn'
    del.textContent = '✕'
    del.setAttribute('aria-label', '删除播客')
    del.addEventListener('click', () => {
      if (!confirm('删除这个播客源？')) return
      const list = loadPodcasts().filter(x => String(x.id) !== String(p.id))
      savePodcasts(list)
      if (String(state.podcastSelectedId) === String(p.id)) {
        state.podcastSelectedId = null
        state.podcastEpisodes = []
      }
      refreshList()
      setInfo('已删除播客源')
    })
    actions.append(open, del)
  } else {
    const addBtn = document.createElement('button')
    addBtn.className = 'btn icon-btn'
    addBtn.textContent = '＋'
    addBtn.setAttribute('aria-label', '添加到我添加的')
    addBtn.addEventListener('click', async () => {
      await addPodcast(p.feedUrl, p.title, false, p.language)
    })
    actions.append(open, addBtn)
  }
  card.append(main, actions)
  return card
}

function renderEpisodeItem(ep) {
  const card = document.createElement('div')
  card.className = 'card card-pad item'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `播放 ${ep.title || '未命名剧集'}`)
  if (state.playing && sameMedia(state.playing, ep)) card.classList.add('playing')
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    playEpisode(ep, 'podcasts')
  })
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('button')) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    playEpisode(ep, 'podcasts')
  })

  const main = document.createElement('div')
  main.className = 'item-main'
  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = ep.title || '未命名剧集'
  const sub = document.createElement('div')
  sub.className = 'item-sub muted'
  sub.textContent = [ep.podcastTitle, ep.publishedAt ? fmtDate(ep.publishedAt) : ''].filter(Boolean).join(' · ')
  main.append(title, sub)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const play = document.createElement('button')
  play.className = 'btn primary icon-btn'
  const isCurrent = state.playing && sameMedia(state.playing, ep)
  play.textContent = (isCurrent && !ui.audio.paused) ? '⏸' : '▶'
  play.setAttribute('aria-label', isCurrent ? '播放/暂停' : '播放')
  play.addEventListener('click', async () => {
    if (state.playing && sameMedia(state.playing, ep)) {
      if (ui.audio.paused) await ui.audio.play().catch((err) => onPlayError(err))
      else ui.audio.pause()
      syncPlayButton()
      refreshList()
      return
    }
    playEpisode(ep, 'podcasts')
  })

  actions.append(play)
  card.append(main, actions)
  return card
}

function renderExternalPodcastItem(p) {
  const card = document.createElement('div')
  card.className = 'card card-pad'

  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = p.title || '未命名播客'

  const sub = document.createElement('div')
  sub.className = 'item-sub muted'
  sub.textContent = [p.author, p.sourceLabel, p.genreLabel].filter(Boolean).join(' · ')

  const desc = document.createElement('div')
  desc.className = 'item-sub muted'
  desc.style.marginTop = '8px'
  desc.textContent = p.summary || '可跳转到外部页面继续收听'

  const links = document.createElement('div')
  links.className = 'row'
  links.style.marginTop = '12px'
  links.style.gap = '8px'
  links.style.flexWrap = 'wrap'

  const openBtn = document.createElement('button')
  openBtn.className = 'btn primary'
  openBtn.textContent = '打开外部页'
  openBtn.addEventListener('click', () => openExternalUrl(p.openUrl))
  links.append(openBtn)

  if (p.feedUrl) {
    const rssBtn = document.createElement('button')
    rssBtn.className = 'btn'
    rssBtn.textContent = '查看 RSS'
    rssBtn.addEventListener('click', () => openExternalUrl(p.feedUrl))
    links.append(rssBtn)

    const addBtn = document.createElement('button')
    addBtn.className = 'btn'
    addBtn.textContent = '添加到我添加的'
    addBtn.addEventListener('click', async () => {
      await addPodcast(p.feedUrl, p.title, false, p.language)
    })
    links.append(addBtn)
  }

  const webBtn = document.createElement('button')
  webBtn.className = 'btn'
  webBtn.textContent = '网页搜索'
  webBtn.addEventListener('click', () => openExternalUrl(p.webSearchUrl))
  links.append(webBtn)

  card.append(title, sub, desc, links)
  return card
}

function playEpisode(ep, context) {
  const url = ep?.audioUrl
  if (!url) return
  state.playing = ep
  state.playContext = context || 'podcasts'

  ui.audio.removeAttribute('crossorigin')
  ui.audio.src = url
  ui.audio.play().catch((err) => onPlayError(err))

  ui.nowTitle.textContent = ep.title || '播客'
  ui.nowSub.textContent = [ep.podcastTitle, ep.publishedAt ? fmtDate(ep.publishedAt) : ''].filter(Boolean).join(' · ')
  refreshPlayerFav()
  syncPlayButton()

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title || '播客',
      artist: ep.podcastTitle || '',
      album: ''
    })
  }
}

function fmtDate(ms) {
  try {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch (_) {
    return ''
  }
}

function getPodcastSourceById(id) {
  const mine = loadPodcasts().find(x => String(x.id) === String(id))
  if (mine) return mine
  const rec = getRecommendedPodcasts().find(x => String(x.id) === String(id))
  if (rec) return rec
  return null
}

function availablePodcastLanguages() {
  const set = new Set()
  const all = [...getRecommendedPodcasts(), ...loadPodcasts(), ...state.podcastExternalResults]
  for (const p of all) {
    const v = String(p?.language || '').trim().toLowerCase()
    if (v) set.add(v)
    else set.add('unknown')
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function filterPodcastSources(list) {
  const kw = String(state.podcastFilterKeyword || '').trim().toLowerCase()
  const lang = String(state.podcastFilterLang || '').trim().toLowerCase()
  const out = []
  for (const p of (list || [])) {
    const pLang = String(p?.language || '').trim().toLowerCase() || 'unknown'
    if (lang && pLang !== lang) continue
    if (kw) {
      const hay = `${p?.title || ''} ${p?.feedUrl || ''}`.toLowerCase()
      if (!hay.includes(kw)) continue
    }
    out.push(p)
  }
  return out
}

function parseDateInput(s, isEnd) {
  const v = String(s || '').trim()
  if (!v) return null
  const ms = Date.parse(`${v}T00:00:00`)
  if (!Number.isFinite(ms)) return null
  return isEnd ? (ms + 24 * 60 * 60 * 1000 - 1) : ms
}

function filterEpisodes(list) {
  const kw = String(state.podcastFilterKeyword || '').trim().toLowerCase()
  const from = parseDateInput(state.podcastFilterFrom, false)
  const to = parseDateInput(state.podcastFilterTo, true)
  const out = []
  for (const ep of (list || [])) {
    if (kw) {
      const hay = `${ep?.title || ''} ${ep?.podcastTitle || ''} ${ep?.summary || ''}`.toLowerCase()
      if (!hay.includes(kw)) continue
    }
    if (from !== null || to !== null) {
      const t = Number.isFinite(ep?.publishedAt) ? ep.publishedAt : null
      if (t === null) continue
      if (from !== null && t < from) continue
      if (to !== null && t > to) continue
    }
    out.push(ep)
  }
  return out
}

function filterExternalPodcastResults(list) {
  const kw = String(state.podcastFilterKeyword || '').trim().toLowerCase()
  const searchedKw = String(state.podcastExternalKeyword || '').trim().toLowerCase()
  const lang = String(state.podcastFilterLang || '').trim().toLowerCase()
  const country = String(state.podcastExternalCountry || '').trim().toLowerCase()
  const kwTokens = tokenizeExternalKeyword(kw)
  const out = []
  for (const p of (list || [])) {
    const pLang = String(p?.language || '').trim().toLowerCase() || 'unknown'
    if (lang && pLang !== lang) continue
    const pCountry = String(p?.countryCode || '').trim().toLowerCase()
    if (country && pCountry !== country) continue
    // The remote API already searched by keyword. Re-filter only when the user
    // edits the keyword after results are loaded and hasn't searched again yet.
    if (kw && kw !== searchedKw) {
      const hay = `${p?.title || ''} ${p?.author || ''} ${p?.summary || ''} ${p?.countryLabel || ''}`.toLowerCase()
      if (kwTokens.length) {
        if (!kwTokens.every(token => hay.includes(token))) continue
      } else if (!hay.includes(kw)) {
        continue
      }
    }
    out.push(p)
  }
  return out
}

async function searchExternalPodcasts() {
  if (state.podcastExternalSearching) return
  const kw = String(state.podcastFilterKeyword || '').trim()
  if (!kw) {
    state.podcastView = 'external'
    state.podcastExternalResults = []
    refreshList()
    setInfo('先输入关键词，再点“搜索更多”')
    return
  }

  state.podcastExternalSearching = true
  state.podcastView = 'external'
  refreshList()
  try {
    setInfo('外部搜索中…')
    const countries = resolveExternalSearchCountries(kw, state.podcastExternalCountry)
    const all = []
    for (const code of countries) {
      const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=24&country=${encodeURIComponent(code)}&term=${encodeURIComponent(kw)}`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const results = Array.isArray(json?.results) ? json.results : []
      for (const item of results) all.push({ ...item, _searchCountry: code })
    }
    state.podcastExternalKeyword = kw
    state.podcastExternalResults = sortExternalPodcasts(
      dedupeExternalPodcasts(all.map(normalizeExternalPodcast).filter(Boolean)),
      kw,
      state.podcastExternalCountry,
      state.podcastFilterLang
    )
    refreshList()
    setInfo(state.podcastExternalResults.length
      ? `已找到 ${state.podcastExternalResults.length} 个外部播客，可跳转继续收听`
      : '没有找到外部播客结果')
  } catch (_) {
    state.podcastExternalResults = []
    refreshList()
    setInfo('外部搜索失败，请稍后重试')
  } finally {
    state.podcastExternalSearching = false
    refreshList()
  }
}

function normalizeExternalPodcast(item) {
  const title = String(item?.collectionName || item?.trackName || '').trim()
  const openUrl = normalizeUrl(item?.collectionViewUrl || item?.trackViewUrl || item?.artistViewUrl || '')
  const feedUrl = normalizeUrl(item?.feedUrl || '')
  const fallbackQuery = title || String(item?.artistName || '').trim()
  if (!title && !openUrl && !feedUrl && !fallbackQuery) return null

  const genres = Array.isArray(item?.genres) ? item.genres.filter(Boolean).slice(0, 3) : []
  const language = mapExternalPodcastLanguage(item)
  const summary = stripHtml(item?.description || item?.artistName || '')
  const searchQuery = fallbackQuery || String(state.podcastFilterKeyword || '').trim()
  const countryCode = String(item?._searchCountry || item?.country || '').trim().toLowerCase()
  const countryLabel = externalCountryLabel(countryCode)
  return {
    id: String(item?.collectionId || item?.trackId || openUrl || feedUrl || title),
    title: title || fallbackQuery || '未命名播客',
    author: String(item?.artistName || '').trim(),
    summary,
    sourceLabel: countryLabel ? `Apple Podcasts · ${countryLabel}` : 'Apple Podcasts',
    genreLabel: genres.join(' / '),
    language,
    countryCode,
    countryLabel,
    openUrl: openUrl || feedUrl || buildWebSearchUrl(searchQuery),
    feedUrl,
    webSearchUrl: buildWebSearchUrl(searchQuery)
  }
}

function mapExternalPodcastLanguage(item) {
  const values = [
    item?.language,
    item?.country,
    item?._searchCountry,
    Array.isArray(item?.genres) ? item.genres.join(' ') : ''
  ]
  const text = values.filter(Boolean).join(' ').toLowerCase()
  if (!text) return ''
  if (text.includes('hindi')) return 'hindi'
  if (text.includes('tamil')) return 'tamil'
  if (text.includes('telugu')) return 'telugu'
  if (text.includes('malayalam')) return 'malayalam'
  if (text.includes('kannada')) return 'kannada'
  if (text.includes('marathi')) return 'marathi'
  if (text.includes('bengali')) return 'bengali'
  if (text.includes('punjabi')) return 'punjabi'
  if (text.includes('chinese') || text.includes('mandarin') || text.includes('cn') || text.includes('zh')) return 'chinese'
  if (text.includes('japanese') || text.includes('jp') || text.includes('ja')) return 'japanese'
  if (text.includes('korean') || text.includes('kr') || text.includes('ko')) return 'korean'
  if (text.includes('french') || text.includes('fr')) return 'french'
  if (text.includes('german') || text.includes('de')) return 'german'
  if (text.includes('spanish') || text.includes('es')) return 'spanish'
  if (text.includes('portuguese') || text.includes('pt')) return 'portuguese'
  if (text.includes('italian') || text.includes('it')) return 'italian'
  if (text.includes('russian') || text.includes('ru')) return 'russian'
  if (text.includes('arabic') || text.includes('ar')) return 'arabic'
  return 'english'
}

function podcastExternalCountryOptions() {
  return [
    { value: 'in', label: '印度（英语优先）' },
    { value: 'us', label: '美国' },
    { value: 'gb', label: '英国' },
    { value: 'au', label: '澳大利亚' },
    { value: 'ca', label: '加拿大' }
  ]
}

function resolveExternalSearchCountries(keyword, selected) {
  const manual = String(selected || '').trim().toLowerCase()
  if (manual === 'in') return ['in', 'us', 'gb', 'ca']
  if (manual) return [manual]

  const kw = String(keyword || '').trim().toLowerCase()
  const indianHints = ['india', 'indian', 'hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali', 'punjabi', 'bollywood']
  if (indianHints.some(x => kw.includes(x))) return ['in', 'us', 'gb']
  return ['us', 'in', 'gb']
}

function externalCountryLabel(code) {
  const v = String(code || '').trim().toLowerCase()
  const found = podcastExternalCountryOptions().find(x => x.value === v)
  return found?.label || String(code || '').toUpperCase()
}

function dedupeExternalPodcasts(list) {
  const out = []
  const seen = new Set()
  for (const item of (list || [])) {
    const key = String(item?.feedUrl || item?.openUrl || item?.id || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function tokenizeExternalKeyword(keyword) {
  const stopWords = new Set([
    'podcast', 'podcasts', 'show', 'shows', 'audio', 'listen',
    'english', 'india', 'indian'
  ])
  return String(keyword || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(x => x.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(x => x && x.length > 1 && !stopWords.has(x))
}

function sortExternalPodcasts(list, keyword, selectedCountry, selectedLang) {
  const kw = String(keyword || '').trim().toLowerCase()
  const country = String(selectedCountry || '').trim().toLowerCase()
  const lang = String(selectedLang || '').trim().toLowerCase()
  const indianHints = ['india', 'indian', 'english india', 'english indian', 'bollywood', 'startup india']
  const preferIndianEnglish = country === 'in' || (!country && indianHints.some(x => kw.includes(x)))

  return (list || []).slice().sort((a, b) => {
    const scoreA = externalPodcastRank(a, preferIndianEnglish, lang)
    const scoreB = externalPodcastRank(b, preferIndianEnglish, lang)
    return scoreB - scoreA
  })
}

function externalPodcastRank(item, preferIndianEnglish, selectedLang) {
  let score = 0
  const lang = String(item?.language || '').trim().toLowerCase()
  const country = String(item?.countryCode || '').trim().toLowerCase()
  if (selectedLang && lang === selectedLang) score += 100
  if (preferIndianEnglish) {
    if (country === 'in') score += 80
    if (lang === 'english') score += 60
    if (lang === 'unknown') score += 20
  }
  if (item?.feedUrl) score += 10
  return score
}

function buildWebSearchUrl(query) {
  const q = String(query || '').trim()
  return `https://www.google.com/search?q=${encodeURIComponent(`${q} podcast`)}`
}

function openExternalUrl(url) {
  const href = normalizeUrl(url)
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function searchPodcastEpisodes() {
  if (state.podcastSearching) return
  const kw = String(state.podcastFilterKeyword || '').trim().toLowerCase()
  const lang = String(state.podcastFilterLang || '').trim().toLowerCase()
  const sourcesAll = [...getRecommendedPodcasts(), ...loadPodcasts()]
  const uniq = []
  for (const p of sourcesAll) {
    const id = String(p?.feedUrl || p?.id || '').trim()
    if (!id) continue
    if (uniq.some(x => String(x.feedUrl) === id)) continue
    uniq.push({ ...p, id, feedUrl: id, language: p?.language })
  }

  let sources = uniq
  if (lang) sources = sources.filter(p => (String(p?.language || '').trim().toLowerCase() || 'unknown') === lang)
  if (kw) {
    const matched = sources.filter(p => String(p?.title || '').toLowerCase().includes(kw))
    if (matched.length) sources = matched
  }
  sources = sources.slice(0, 10)
  if (!sources.length) {
    setInfo('没有可搜索的播客源')
    return
  }

  state.podcastSearching = true
  refreshList()
  try {
    setInfo('搜索中…')
    const episodes = []
    const seen = new Set()
    let failed = 0
    for (const src of sources) {
      try {
        const res = await fetch(src.feedUrl, { mode: 'cors' })
        if (!res.ok) throw new Error('feed')
        const xml = await res.text()
        const parsed = parseFeed(xml)
        const title = parsed?.title || src.title || src.feedUrl
        for (const ep of (parsed.items || [])) {
          const key = String(ep?.audioUrl || ep?.guid || ep?.id || ep?.title || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          episodes.push({ ...ep, podcastTitle: title })
        }
      } catch (_) {
        failed += 1
      }
    }

    const filtered = filterEpisodes(episodes)
      .slice()
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))

    state.podcastSelectedId = 'search'
    state.podcastEpisodes = filtered
    refreshList()
    setInfo(`已找到 ${filtered.length} 个可播放剧集${failed ? `（${failed} 个源加载失败）` : ''}`)
  } finally {
    state.podcastSearching = false
    refreshList()
  }
}

async function openPodcast(id, autoPlay) {
  const list = loadPodcasts()
  const p = getPodcastSourceById(id)
  if (!p?.feedUrl) return
  state.tab = 'podcasts'
  state.podcastSelectedId = id
  state.podcastEpisodes = []
  refreshList()
  setInfo('加载播客中…')
  try {
    const res = await fetch(p.feedUrl, { mode: 'cors' })
    if (!res.ok) throw new Error('feed')
    const xml = await res.text()
    const parsed = parseFeed(xml)
    const title = parsed?.title || p.title || p.feedUrl
    const language = canonicalPodcastLanguage(parsed?.language || p?.language || '')
    const inMine = list.some(x => String(x.id) === String(id))
    if (inMine) {
      const updatedList = list.map(x => String(x.id) === String(id) ? { ...x, title, language: language || x.language || '' } : x)
      savePodcasts(updatedList)
    }
    state.podcastEpisodes = (parsed.items || []).slice(0, 80)
    if (!state.podcastEpisodes.length) {
      setInfo('没有可播放的剧集')
    } else {
      setInfo(`已加载 ${state.podcastEpisodes.length} 个剧集`)
      if (autoPlay) playEpisode(state.podcastEpisodes[0], 'podcasts')
    }
  } catch (_) {
    state.podcastEpisodes = []
    setInfo('加载失败：该播客源可能不支持跨域（CORS）')
  } finally {
    refreshList()
  }
}

function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText || '', 'text/xml')
  const root = doc.documentElement
  const lower = String(root?.nodeName || '').toLowerCase()

  if (lower === 'rss') return parseRss(doc)
  if (lower === 'feed') return parseAtom(doc)
  const rss = doc.querySelector('rss')
  if (rss) return parseRss(doc)
  const feed = doc.querySelector('feed')
  if (feed) return parseAtom(doc)
  return { title: '', language: '', items: [] }
}

function parseRss(doc) {
  const ch = doc.querySelector('channel')
  const title = textOf(ch?.querySelector('title')) || ''
  const language = canonicalPodcastLanguage(textOf(ch?.querySelector('language')) || '')
  const items = []
  const nodes = Array.from(doc.querySelectorAll('channel > item'))
  for (const it of nodes) {
    const t = textOf(it.querySelector('title')) || '未命名剧集'
    const guid = textOf(it.querySelector('guid')) || ''
    const pub = textOf(it.querySelector('pubDate')) || textOf(it.querySelector('date')) || ''
    const publishedAt = Date.parse(pub || '') || null
    const audioUrl = pickRssAudioUrl(it)
    if (!audioUrl) continue
    const summary = stripHtml(textOf(it.querySelector('description')) || textOf(it.querySelector('itunes\\:summary')) || '')
    items.push({ kind: 'episode', id: guid || audioUrl, guid: guid || audioUrl, podcastTitle: title, title: t, summary, audioUrl, publishedAt })
  }
  items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
  return { title, language, items }
}

function parseAtom(doc) {
  const feed = doc.querySelector('feed')
  const title = textOf(feed?.querySelector('title')) || ''
  const language = canonicalPodcastLanguage(feed?.getAttribute('xml:lang') || '')
  const items = []
  const nodes = Array.from(doc.querySelectorAll('feed > entry'))
  for (const en of nodes) {
    const t = textOf(en.querySelector('title')) || '未命名剧集'
    const guid = textOf(en.querySelector('id')) || ''
    const pub = textOf(en.querySelector('published')) || textOf(en.querySelector('updated')) || ''
    const publishedAt = Date.parse(pub || '') || null
    const audioUrl = pickAtomAudioUrl(en)
    if (!audioUrl) continue
    const summary = stripHtml(textOf(en.querySelector('summary')) || textOf(en.querySelector('content')) || '')
    items.push({ kind: 'episode', id: guid || audioUrl, guid: guid || audioUrl, podcastTitle: title, title: t, summary, audioUrl, publishedAt })
  }
  items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
  return { title, language, items }
}

function textOf(el) {
  return String(el?.textContent || '').trim()
}

function canonicalPodcastLanguage(raw) {
  const v = String(raw || '').trim().toLowerCase()
  if (!v) return ''
  const base = v.split(/[-_]/)[0]
  const map = {
    en: 'english',
    zh: 'chinese',
    ja: 'japanese',
    ko: 'korean',
    fr: 'french',
    de: 'german',
    es: 'spanish',
    it: 'italian',
    ru: 'russian',
    pt: 'portuguese',
    ar: 'arabic'
  }
  return map[base] || v
}

function stripHtml(s) {
  const v = String(s || '')
  if (!v) return ''
  return v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeMediaUrl(u) {
  const url = normalizeUrl(u)
  if (!url) return ''
  if (location.protocol === 'https:' && url.startsWith('http://')) return ''
  return url
}

function pickRssAudioUrl(itemEl) {
  const enc = itemEl.querySelector('enclosure[url]')
  if (enc) {
    const type = String(enc.getAttribute('type') || '').trim().toLowerCase()
    const url = normalizeMediaUrl(enc.getAttribute('url') || '')
    if (url && (!type || type.startsWith('audio/'))) return url
  }
  const media = itemEl.querySelector('media\\:content[url]')
  if (media) {
    const type = String(media.getAttribute('type') || '').trim().toLowerCase()
    const url = normalizeMediaUrl(media.getAttribute('url') || '')
    if (url && (!type || type.startsWith('audio/'))) return url
  }
  return ''
}

function pickAtomAudioUrl(entryEl) {
  const links = Array.from(entryEl.querySelectorAll('link'))
  const enclosure = links.find(l => String(l.getAttribute('rel') || '').trim().toLowerCase() === 'enclosure') || null
  if (enclosure) {
    const type = String(enclosure.getAttribute('type') || '').trim().toLowerCase()
    const url = normalizeMediaUrl(enclosure.getAttribute('href') || '')
    if (url && (!type || type.startsWith('audio/'))) return url
  }
  const audio = links.find(l => String(l.getAttribute('type') || '').trim().toLowerCase().startsWith('audio/')) || null
  if (audio) {
    const url = normalizeMediaUrl(audio.getAttribute('href') || '')
    if (url) return url
  }
  return ''
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
  if (state.tab === 'favorites') refreshList()
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

async function loadTags() {
  try {
    const tags = await apiGet('/tags?order=stationcount&reverse=true&hidebroken=true')
    const cleaned = (tags || [])
      .map(x => ({ name: x.name || '', count: x.stationcount || 0 }))
      .filter(x => x.name)
      .slice(0, 200)
    for (const t of cleaned) {
      const opt = document.createElement('option')
      opt.value = t.name
      opt.textContent = `${t.name} (${t.count})`
      ui.tag.appendChild(opt)
    }
  } catch (_) {}
}

function applyPreferredTag() {
  const preferred = load(STORE.preferredTag, '')
  if (!preferred) return
  const opts = Array.from(ui.tag.options)
  const match = opts.find(o => o.value.toLowerCase() === String(preferred).toLowerCase())
  if (match) ui.tag.value = match.value
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
