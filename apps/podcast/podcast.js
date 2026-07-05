const $ = (s) => document.querySelector(s)

const ui = {
  info: $('#info'),
  list: $('#list'),
  empty: $('#empty'),
  nowTitle: $('#nowTitle'),
  nowSub: $('#nowSub'),
  prevBtn: $('#prevBtn'),
  playBtn: $('#playBtn'),
  nextBtn: $('#nextBtn'),
  vol: $('#vol'),
  audio: $('#audio')
}

const STORE = {
  podcasts: 'podcast:podcasts',
  podcastsLegacy: 'global-fm:podcasts',
  recommendedCache: 'podcast:recommendedCache',
  recommendedCacheLegacy: 'global-fm:recommendedCache',
  recommendedCacheMeta: 'podcast:recommendedCacheMeta',
  recommendedCacheMetaLegacy: 'global-fm:recommendedCacheMeta',
  indieCache: 'podcast:indieCache',
  indieCacheMeta: 'podcast:indieCacheMeta',
  indieRemoved: 'podcast:indieRemoved',
  volume: 'podcast:volume',
  volumeLegacy: 'global-fm:volume'
}

const FALLBACK_RECOMMENDED_PODCASTS = [
  { id: 'https://feeds.simplecast.com/Sl5CSM3S', title: 'The Daily', feedUrl: 'https://feeds.simplecast.com/Sl5CSM3S', language: '' },
  { id: 'https://feeds.simplecast.com/tOjNXec5', title: 'The Joe Rogan Experience', feedUrl: 'https://feeds.simplecast.com/tOjNXec5', language: '' },
  { id: 'https://feeds.simplecast.com/5y9M3Z9t', title: 'Crime Junkie', feedUrl: 'https://feeds.simplecast.com/5y9M3Z9t', language: '' }
]

const INDIE_CATEGORY_ORDER = [
  '访谈与观点',
  '故事与调查',
  '设计与创意',
  '科技与产品',
  '历史与思想',
  '科学与自然',
  '文化与语言',
  '心理与成长',
  '亲子与教育',
  '旅行与世界',
  '体育',
  '地区与全球观察',
  '商业与财经'
]

const state = {
  view: 'recommended',
  searching: false,
  externalSearching: false,
  selectedId: null,
  episodes: [],
  playing: null,
  playContext: 'episodes',
  recommendedLoading: false,
  indieLoading: false,
  filterKeyword: '',
  filterLang: '',
  filterCategory: '',
  filterFrom: '',
  filterTo: '',
  externalCountry: '',
  externalKeyword: '',
  externalResults: []
}

init()

async function init() {
  ui.vol.value = String(loadValue([STORE.volume, STORE.volumeLegacy], 1))
  ui.audio.volume = Number(ui.vol.value)
  setupPlayer()
  migrateLegacyStores()
  await loadBundledRecommended(true)
  await loadBundledIndie(true)
  refreshList()
  setInfo('已显示推荐播客')
}

function setupPlayer() {
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
    refreshList()
  })

  ui.prevBtn.addEventListener('click', () => jump(-1))
  ui.nextBtn.addEventListener('click', () => jump(1))
  ui.audio.addEventListener('play', () => {
    syncPlayButton()
    refreshList()
  })
  ui.audio.addEventListener('pause', () => {
    syncPlayButton()
    refreshList()
  })
  ui.audio.addEventListener('ended', () => jump(1))
  ui.audio.addEventListener('error', () => setInfo('播放失败：音频源不可用或已断开'))
}

function setInfo(text) {
  ui.info.textContent = text
}

function refreshList() {
  ui.list.innerHTML = ''
  ui.empty.hidden = true
  ui.empty.textContent = ''

  const frag = document.createDocumentFragment()
  frag.appendChild(renderHeader())

  let items = []
  if (state.selectedId) {
    items = filterEpisodes(state.episodes)
  } else if (state.view === 'external') {
    items = filterExternalPodcastResults(state.externalResults)
  } else {
    const base = state.view === 'mine'
      ? loadPodcasts()
      : state.view === 'indie'
        ? getIndiePodcasts()
        : getRecommendedPodcasts()
    items = filterPodcastSources(base)
  }

  if (!items.length) {
    frag.appendChild(renderEmptyCard())
  } else if (state.selectedId) {
    for (const item of items) frag.appendChild(renderEpisodeItem(item))
  } else if (state.view === 'external') {
    for (const item of items) frag.appendChild(renderExternalPodcastItem(item))
  } else {
    for (const item of items) frag.appendChild(renderPodcastItem(item))
  }

  if (shouldShowSearchEngineFallback(items)) {
    frag.appendChild(renderSearchEngineFallbackCard(items))
  }

  ui.list.appendChild(frag)
}

function renderHeader() {
  const card = document.createElement('div')
  card.className = 'card card-pad'

  const row = document.createElement('div')
  row.className = 'row'
  row.style.alignItems = 'center'
  row.style.justifyContent = 'space-between'

  const title = document.createElement('div')
  title.style.fontWeight = '700'
  title.textContent = state.selectedId ? currentTitle() : '全球播客'

  const actions = document.createElement('div')
  actions.className = 'row'
  actions.style.gap = '8px'

  if (state.selectedId) {
    const back = document.createElement('button')
    back.className = 'btn'
    back.textContent = '返回'
    back.addEventListener('click', () => {
      state.selectedId = null
      state.episodes = []
      refreshList()
      setInfo('已显示播客源')
    })
    actions.append(back)
  } else {
    actions.append(renderViewTabs())
  }

  row.append(title, actions)

  const addRow = document.createElement('div')
  addRow.className = 'row'
  addRow.style.marginTop = '10px'
  addRow.style.alignItems = 'center'

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
  addRow.append(input, addBtn)

  const recRow = document.createElement('div')
  recRow.className = 'row'
  recRow.style.marginTop = '10px'
  recRow.style.alignItems = 'center'

  const cacheMode = state.view === 'indie' ? 'indie' : 'recommended'
  const loadBtn = document.createElement('button')
  loadBtn.className = 'btn'
  loadBtn.textContent = cacheMode === 'indie'
    ? (state.indieLoading ? '加载中…' : '更新独立播客300')
    : (state.recommendedLoading ? '加载中…' : '更新推荐')
  loadBtn.disabled = cacheMode === 'indie'
    ? !!state.indieLoading
    : !!state.recommendedLoading
  loadBtn.addEventListener('click', async () => {
    if (cacheMode === 'indie') await loadBundledIndie(false)
    else await loadBundledRecommended(false)
  })

  const meta = cacheMode === 'indie'
    ? loadIndieCacheMeta()
      : loadRecommendedCacheMeta()
  const tip = document.createElement('div')
  tip.className = 'muted'
  tip.style.flex = '1 1 260px'
  const cacheList = cacheMode === 'indie'
    ? loadIndieCache()
      : loadRecommendedCache()
  const cacheLabel = cacheMode === 'indie'
    ? '当前独立播客300'
      : '当前推荐'
  const actionLabel = cacheMode === 'indie'
    ? '更新独立播客300'
      : '更新推荐'
  const count = Number(meta?.count) || (cacheList?.length || 0)
  const date = Number.isFinite(meta?.loadedAt) ? fmtDate(meta.loadedAt) : ''
  tip.textContent = count
    ? `${cacheLabel}：${count} 个（${date || '未记录日期'}）`
    : `${cacheLabel}：未加载（可点“${actionLabel}”）`
  recRow.append(loadBtn, tip)

  const filterRow = document.createElement('div')
  filterRow.className = 'row'
  filterRow.style.marginTop = '10px'
  filterRow.style.alignItems = 'center'

  const lang = document.createElement('select')
  lang.className = 'input'
  lang.style.flex = '0 1 180px'
  lang.appendChild(new Option('所有语言', ''))
  for (const value of availablePodcastLanguages()) {
    lang.appendChild(new Option(value === 'unknown' ? '未知' : value, value))
  }
  lang.value = state.filterLang
  lang.addEventListener('change', () => {
    state.filterLang = lang.value
    refreshList()
  })

  let category = null
  if (!state.selectedId && state.view === 'indie') {
    category = document.createElement('select')
    category.className = 'input'
    category.style.flex = '0 1 190px'
    category.appendChild(new Option('全部分类', ''))
    for (const value of availableIndieCategories()) {
      category.appendChild(new Option(value, value))
    }
    category.value = state.filterCategory
    category.addEventListener('change', () => {
      state.filterCategory = category.value
      refreshList()
    })
  }

  const country = document.createElement('select')
  country.className = 'input'
  country.style.flex = '0 1 180px'
  country.appendChild(new Option('全部地区', ''))
  for (const opt of podcastExternalCountryOptions()) {
    country.appendChild(new Option(opt.label, opt.value))
  }
  country.value = state.externalCountry
  country.addEventListener('change', () => {
    state.externalCountry = country.value
    refreshList()
  })

  const from = document.createElement('input')
  from.className = 'input'
  from.type = 'date'
  from.style.flex = '0 1 170px'
  from.value = state.filterFrom
  from.addEventListener('change', () => {
    state.filterFrom = from.value
    refreshList()
  })

  const to = document.createElement('input')
  to.className = 'input'
  to.type = 'date'
  to.style.flex = '0 1 170px'
  to.value = state.filterTo
  to.addEventListener('change', () => {
    state.filterTo = to.value
    refreshList()
  })

  const kw = document.createElement('input')
  kw.className = 'input'
  kw.type = 'search'
  kw.placeholder = '关键词（回车搜索）…'
  kw.autocomplete = 'off'
  kw.style.flex = '1 1 240px'
  kw.value = state.filterKeyword
  kw.addEventListener('input', () => {
    state.filterKeyword = kw.value
  })
  kw.addEventListener('change', () => refreshList())
  kw.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (state.view === 'external' && !state.selectedId) searchExternalPodcasts()
    else if (!state.selectedId) searchPodcastEpisodes()
    else refreshList()
  })

  const searchPlayableBtn = document.createElement('button')
  searchPlayableBtn.className = 'btn primary'
  searchPlayableBtn.textContent = state.searching ? '搜索中…' : '搜索可播放剧集'
  searchPlayableBtn.disabled = !!state.searching
  searchPlayableBtn.addEventListener('click', () => searchPodcastEpisodes())

  const searchMoreBtn = document.createElement('button')
  searchMoreBtn.className = 'btn'
  searchMoreBtn.textContent = state.externalSearching ? '外部搜索中…' : '搜索更多'
  searchMoreBtn.disabled = !!state.externalSearching
  searchMoreBtn.addEventListener('click', () => searchExternalPodcasts())

  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn'
  clearBtn.textContent = '清除筛选'
  clearBtn.addEventListener('click', () => {
    state.filterKeyword = ''
    state.filterLang = ''
    state.filterCategory = ''
    state.filterFrom = ''
    state.filterTo = ''
    state.externalCountry = ''
    state.externalKeyword = ''
    state.externalResults = []
    if (state.view === 'external') state.view = 'recommended'
    refreshList()
    setInfo('已清除筛选')
  })

  if (category) filterRow.append(category)
  filterRow.append(lang, country, from, to, kw, searchPlayableBtn, searchMoreBtn, clearBtn)
  card.append(row, addRow, recRow, filterRow)
  return card
}

function renderViewTabs() {
  const tabs = document.createElement('div')
  tabs.className = 'row tabs'
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', '播客视图切换')

  for (const item of [
    { value: 'recommended', label: '推荐', info: '已显示推荐播客' },
    { value: 'indie', label: '独立播客300', info: '已显示 300 个海外知名独立播客，可按分类筛选' },
    { value: 'mine', label: '我添加的', info: '已显示我添加的播客' },
    { value: 'external', label: '搜索更多', info: state.externalResults.length ? '已显示外部搜索结果' : '输入关键词后点“搜索更多”' }
  ]) {
    const btn = document.createElement('button')
    btn.className = 'btn tab'
    btn.textContent = item.label
    btn.setAttribute('role', 'tab')
    btn.classList.toggle('active', state.view === item.value)
    btn.setAttribute('aria-selected', state.view === item.value ? 'true' : 'false')
    btn.tabIndex = state.view === item.value ? 0 : -1
    btn.addEventListener('click', async () => {
      state.view = item.value
      if (item.value === 'indie' && !getIndiePodcasts().length) await loadBundledIndie(true)
      refreshList()
      setInfo(item.info)
    })
    tabs.append(btn)
  }
  return tabs
}

function renderEmptyCard() {
  const wrap = document.createElement('div')
  wrap.className = 'card card-pad'

  const title = document.createElement('div')
  title.style.fontWeight = '700'
  if (state.selectedId) title.textContent = '没有可播放的剧集'
  else if (state.view === 'mine') title.textContent = '还没有播客源'
  else if (state.view === 'indie') title.textContent = '还没有独立播客'
  else if (state.view === 'external') title.textContent = '没有外部搜索结果'
  else title.textContent = '没有推荐播客'

  const tip = document.createElement('div')
  tip.className = 'muted'
  tip.style.marginTop = '6px'
  if (state.selectedId) tip.textContent = '这个播客源可能不支持跨域（CORS），或者没有可用音频链接。'
  else if (state.view === 'mine') tip.textContent = '添加一个播客 RSS 地址后，就可以在这里连续收听剧集。'
  else if (state.view === 'indie') tip.textContent = '这里会固定放 300 个海外知名独立播客，用户不用搜索，直接点选，也可以按分类筛选。'
  else if (state.view === 'external') tip.textContent = '输入关键词后点“搜索更多”，先找节目；如果还不够，下面还能继续扩展到搜索引擎和 RSS 搜索。'
  else tip.textContent = '暂无推荐。你可以切换到“我添加的”或自己添加一个播客 RSS。'

  wrap.append(title, tip)

  if (state.selectedId && state.view === 'indie') {
    const actions = document.createElement('div')
    actions.className = 'row'
    actions.style.marginTop = '12px'
    actions.style.gap = '8px'
    actions.style.flexWrap = 'wrap'

    const delBtn = document.createElement('button')
    delBtn.className = 'btn'
    delBtn.textContent = '从独立播客300删除'
    delBtn.addEventListener('click', () => {
      removeIndiePodcast(state.selectedId)
    })
    actions.append(delBtn)
    wrap.append(actions)
  }

  return wrap
}

function renderPodcastItem(p) {
  const isMine = state.view === 'mine'
  const isIndie = state.view === 'indie'
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
  sub.textContent = [p.category || '', p.author || '', p.language || '', p.feedUrl || ''].filter(Boolean).join(' · ')
  main.append(title, sub)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const openBtn = document.createElement('button')
  openBtn.className = 'btn primary icon-btn'
  openBtn.textContent = '▶'
  openBtn.setAttribute('aria-label', '打开并播放')
  openBtn.addEventListener('click', async () => {
    await openPodcast(p.id, true)
  })
  actions.append(openBtn)

  if (isMine) {
    const del = document.createElement('button')
    del.className = 'btn icon-btn'
    del.textContent = '✕'
    del.setAttribute('aria-label', '删除播客')
    del.addEventListener('click', () => {
      if (!confirm('删除这个播客源？')) return
      const list = loadPodcasts().filter(x => String(x.id) !== String(p.id))
      savePodcasts(list)
      if (String(state.selectedId) === String(p.id)) {
        state.selectedId = null
        state.episodes = []
      }
      refreshList()
      setInfo('已删除播客源')
    })
    actions.append(del)
  } else {
    if (isIndie) {
      const delBtn = document.createElement('button')
      delBtn.className = 'btn icon-btn'
      delBtn.textContent = '✕'
      delBtn.setAttribute('aria-label', '从独立播客300删除')
      delBtn.addEventListener('click', () => {
        removeIndiePodcast(p.id)
      })
      actions.append(delBtn)
    }

    const addBtn = document.createElement('button')
    addBtn.className = 'btn icon-btn'
    addBtn.textContent = '＋'
    addBtn.setAttribute('aria-label', '添加到我添加的')
    addBtn.addEventListener('click', async () => {
      await addPodcast(p.feedUrl, p.title, false, p.language)
    })
    actions.append(addBtn)
  }

  card.append(main, actions)
  return card
}

function renderEpisodeItem(ep) {
  const card = document.createElement('div')
  card.className = 'card card-pad item'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  if (state.playing && sameEpisode(state.playing, ep)) card.classList.add('playing')
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    playEpisode(ep)
  })
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('button')) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    playEpisode(ep)
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
  const playBtn = document.createElement('button')
  playBtn.className = 'btn primary icon-btn'
  const current = state.playing && sameEpisode(state.playing, ep)
  playBtn.textContent = current && !ui.audio.paused ? '⏸' : '▶'
  playBtn.addEventListener('click', async () => {
    if (current) {
      if (ui.audio.paused) await ui.audio.play().catch((err) => onPlayError(err))
      else ui.audio.pause()
      return
    }
    playEpisode(ep)
  })
  actions.append(playBtn)

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

  const actions = document.createElement('div')
  actions.className = 'row'
  actions.style.marginTop = '12px'
  actions.style.gap = '8px'
  actions.style.flexWrap = 'wrap'

  const openBtn = document.createElement('button')
  openBtn.className = 'btn primary'
  openBtn.textContent = '打开外部页'
  openBtn.addEventListener('click', () => openExternalUrl(p.openUrl))
  actions.append(openBtn)

  if (p.feedUrl) {
    const rssBtn = document.createElement('button')
    rssBtn.className = 'btn'
    rssBtn.textContent = '查看 RSS'
    rssBtn.addEventListener('click', () => openExternalUrl(p.feedUrl))
    actions.append(rssBtn)

    const addBtn = document.createElement('button')
    addBtn.className = 'btn'
    addBtn.textContent = '添加到我添加的'
    addBtn.addEventListener('click', async () => {
      await addPodcast(p.feedUrl, p.title, false, p.language)
    })
    actions.append(addBtn)
  }

  const webBtn = document.createElement('button')
  webBtn.className = 'btn'
  webBtn.textContent = '网页搜索'
  webBtn.addEventListener('click', () => openExternalUrl(p.webSearchUrl))
  actions.append(webBtn)

  card.append(title, sub, desc, actions)
  return card
}

function shouldShowSearchEngineFallback(items) {
  if (state.selectedId || state.view !== 'external') return false
  const kw = String(state.filterKeyword || state.externalKeyword || '').trim()
  if (!kw) return false
  return true
}

function renderSearchEngineFallbackCard(items) {
  const card = document.createElement('div')
  card.className = 'card card-pad'

  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = '继续扩展搜索'

  const tip = document.createElement('div')
  tip.className = 'item-sub muted'
  tip.style.marginTop = '6px'
  const count = Array.isArray(items) ? items.length : 0
  tip.textContent = count
    ? `当前目录里已找到 ${count} 个结果；如果你觉得还不够，可以继续用搜索引擎扩搜官网、RSS 和更多长尾播客。`
    : '目录里暂时没找到结果，可以继续用搜索引擎扩搜官网、RSS 和更多长尾播客。'

  const actions = document.createElement('div')
  actions.className = 'row'
  actions.style.marginTop = '12px'
  actions.style.gap = '8px'
  actions.style.flexWrap = 'wrap'

  for (const link of buildSearchEngineFallbackLinks(String(state.filterKeyword || state.externalKeyword || '').trim(), state.externalCountry)) {
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.textContent = link.label
    btn.addEventListener('click', () => openExternalUrl(link.url))
    actions.append(btn)
  }

  const hints = document.createElement('div')
  hints.className = 'item-sub muted'
  hints.style.marginTop = '10px'
  hints.textContent = buildSearchHintText(String(state.filterKeyword || state.externalKeyword || '').trim(), state.externalCountry)

  card.append(title, tip, actions, hints)
  return card
}

function currentTitle() {
  if (state.selectedId === 'search') return '搜索结果'
  const source = getPodcastSourceById(state.selectedId)
  return source?.title || '全球播客'
}

function currentPlayList() {
  return filterEpisodes(state.episodes)
}

function syncPlayButton() {
  ui.playBtn.textContent = ui.audio.paused ? '▶' : '⏸'
}

function onPlayError(err) {
  const name = String(err?.name || '')
  if (name === 'NotAllowedError') setInfo('播放失败：浏览器阻止了自动播放，请再点一次播放')
  else setInfo('播放失败：该播客剧集音频不可用或跨域限制')
  syncPlayButton()
  refreshList()
}

function jump(step) {
  const list = currentPlayList()
  if (!list.length) return
  const idx = state.playing ? list.findIndex(x => sameEpisode(x, state.playing)) : -1
  const next = idx < 0 ? 0 : (idx + step + list.length) % list.length
  playEpisode(list[next])
}

function playEpisode(ep) {
  if (!ep?.audioUrl) return
  state.playing = ep
  state.playContext = 'episodes'
  ui.audio.src = ep.audioUrl
  ui.audio.play().catch((err) => onPlayError(err))
  ui.nowTitle.textContent = ep.title || '全球播客'
  ui.nowSub.textContent = [ep.podcastTitle, ep.publishedAt ? fmtDate(ep.publishedAt) : ''].filter(Boolean).join(' · ')
  syncPlayButton()
  refreshList()
}

function sameEpisode(a, b) {
  return String(a?.guid || a?.id || a?.audioUrl || '') === String(b?.guid || b?.id || b?.audioUrl || '')
}

function loadPodcasts() {
  return loadValue([STORE.podcasts, STORE.podcastsLegacy], [])
}

function savePodcasts(list) {
  save(STORE.podcasts, list)
}

function loadRecommendedCache() {
  const list = loadValue([STORE.recommendedCache, STORE.recommendedCacheLegacy], null)
  return Array.isArray(list) ? list : null
}

function loadIndieCache() {
  const list = loadValue([STORE.indieCache], null)
  return Array.isArray(list) ? list : null
}

function loadRecommendedCacheMeta() {
  return loadValue([STORE.recommendedCacheMeta, STORE.recommendedCacheMetaLegacy], {})
}

function loadIndieCacheMeta() {
  return loadValue([STORE.indieCacheMeta], {})
}

function loadIndieRemovedIds() {
  const list = loadValue([STORE.indieRemoved], [])
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const value = String(item || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function saveRecommendedCache(list, meta) {
  save(STORE.recommendedCache, Array.isArray(list) ? list : [])
  save(STORE.recommendedCacheMeta, meta || {})
}

function saveIndieCache(list, meta) {
  save(STORE.indieCache, Array.isArray(list) ? list : [])
  save(STORE.indieCacheMeta, meta || {})
}

function saveIndieRemovedIds(list) {
  save(STORE.indieRemoved, Array.isArray(list) ? list : [])
}

function getRecommendedPodcasts() {
  const cached = loadRecommendedCache()
  if (cached && cached.length) return cached
  return FALLBACK_RECOMMENDED_PODCASTS
}

function getIndiePodcasts() {
  const cached = loadIndieCache()
  if (cached && cached.length) {
    const removed = new Set(loadIndieRemovedIds())
    if (!removed.size) return cached
    return cached.filter(item => !removed.has(String(item?.id || '')))
  }
  return []
}

function removeIndiePodcast(id) {
  const value = String(id || '').trim()
  if (!value) return
  const source = getPodcastSourceById(value)
  const label = source?.title || '这个播客'
  if (!confirm(`从独立播客300删除“${label}”？`)) return

  const removed = loadIndieRemovedIds()
  if (!removed.includes(value)) saveIndieRemovedIds([value, ...removed])

  const list = loadIndieCache()
  if (Array.isArray(list) && list.length) {
    const next = list.filter(item => String(item?.id || '') !== value)
    saveIndieCache(next, {
      ...loadIndieCacheMeta(),
      count: next.length,
      removedAt: Date.now()
    })
  }

  if (String(state.selectedId) === value) {
    state.selectedId = null
    state.episodes = []
  }

  refreshList()
  setInfo('已从独立播客300删除')
}

function migrateLegacyStores() {
  if (localStorage.getItem(STORE.podcasts) == null) {
    const podcasts = loadValue([STORE.podcastsLegacy], null)
    if (Array.isArray(podcasts)) save(STORE.podcasts, podcasts)
  }
  if (localStorage.getItem(STORE.recommendedCache) == null) {
    const cache = loadValue([STORE.recommendedCacheLegacy], null)
    if (Array.isArray(cache)) save(STORE.recommendedCache, cache)
  }
  if (localStorage.getItem(STORE.recommendedCacheMeta) == null) {
    const meta = loadValue([STORE.recommendedCacheMetaLegacy], null)
    if (meta && typeof meta === 'object') save(STORE.recommendedCacheMeta, meta)
  }
}

function normalizeBundledPodcastList(parsed) {
  const out = []
  const seen = new Set()
  for (const item of (Array.isArray(parsed) ? parsed : [])) {
    const feedUrl = normalizeUrl(item?.feedUrl || item?.id || '')
    if (!feedUrl || seen.has(feedUrl)) continue
    seen.add(feedUrl)
    out.push({
      id: feedUrl,
      title: String(item?.title || feedUrl),
      feedUrl,
      language: String(item?.language || ''),
      author: String(item?.author || ''),
      category: String(item?.category || '')
    })
  }
  return out
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
  const exists = list.some(x => String(x.feedUrl) === normalized)
  if (exists) {
    if (openAfterAdd) await openPodcast(normalized, true)
    else setInfo('这个播客已经在“我添加的”里')
    return
  }
  const added = { id: normalized, title: title || normalized, feedUrl: normalized, language: language || '', addedAt: Date.now() }
  savePodcasts([added, ...list].slice(0, 50))
  state.view = 'mine'
  if (openAfterAdd) await openPodcast(normalized, true)
  else {
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
    const out = normalizeBundledPodcastList(parsed)
    if (out.length) {
      saveRecommendedCache(out, { source: 'bundled', loadedAt: Date.now(), count: out.length })
      if (!silent) setInfo(`已加载 ${out.length} 个推荐播客`)
    } else if (!silent) {
      setInfo('没有可用的推荐播客')
    }
  } catch (_) {
    if (!silent) setInfo('加载失败：无法读取推荐播客列表')
  } finally {
    state.recommendedLoading = false
    refreshList()
  }
}

async function loadBundledIndie(silent) {
  if (state.indieLoading) return
  state.indieLoading = true
  refreshList()
  try {
    if (!silent) setInfo('加载独立播客300中…')
    const res = await fetch('./indie-podcasts.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('indie')
    const parsed = await res.json()
    const removed = new Set(loadIndieRemovedIds())
    const out = normalizeBundledPodcastList(parsed)
      .filter(item => !removed.has(String(item?.id || '')))
      .slice(0, 300)
    if (out.length) {
      saveIndieCache(out, { source: 'bundled', loadedAt: Date.now(), count: out.length })
      if (!silent) setInfo(`已加载 ${out.length} 个独立播客`)
    } else if (!silent) {
      setInfo('没有独立播客')
    }
  } catch (_) {
    if (!silent) setInfo('加载失败：无法读取独立播客列表')
  } finally {
    state.indieLoading = false
    refreshList()
  }
}

function getPodcastSourceById(id) {
  return loadPodcasts().find(x => String(x.id) === String(id))
    || getIndiePodcasts().find(x => String(x.id) === String(id))
    || getRecommendedPodcasts().find(x => String(x.id) === String(id))
    || null
}

function availablePodcastLanguages() {
  const set = new Set()
  const all = [...getRecommendedPodcasts(), ...getIndiePodcasts(), ...loadPodcasts(), ...state.externalResults]
  for (const item of all) {
    const value = String(item?.language || '').trim().toLowerCase()
    set.add(value || 'unknown')
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function availableIndieCategories() {
  const set = new Set()
  for (const item of getIndiePodcasts()) {
    const value = normalizePodcastCategory(item?.category || '')
    if (value) set.add(value)
  }
  const out = []
  for (const value of INDIE_CATEGORY_ORDER) {
    if (!set.has(value)) continue
    out.push(value)
    set.delete(value)
  }
  return out.concat(Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN')))
}

function normalizePodcastCategory(value) {
  return String(value || '').trim()
}

function filterPodcastSources(list) {
  const kw = String(state.filterKeyword || '').trim().toLowerCase()
  const lang = String(state.filterLang || '').trim().toLowerCase()
  const category = state.view === 'indie' ? normalizePodcastCategory(state.filterCategory) : ''
  const out = []
  for (const item of (list || [])) {
    const itemLang = String(item?.language || '').trim().toLowerCase() || 'unknown'
    if (lang && itemLang !== lang) continue
    const itemCategory = normalizePodcastCategory(item?.category || '')
    if (category && itemCategory !== category) continue
    if (kw) {
      const hay = `${item?.title || ''} ${item?.author || ''} ${item?.category || ''} ${item?.feedUrl || ''}`.toLowerCase()
      if (!hay.includes(kw)) continue
    }
    out.push(item)
  }
  return out
}

function parseDateInput(value, isEnd) {
  const v = String(value || '').trim()
  if (!v) return null
  const ms = Date.parse(`${v}T00:00:00`)
  if (!Number.isFinite(ms)) return null
  return isEnd ? ms + 24 * 60 * 60 * 1000 - 1 : ms
}

function filterEpisodes(list) {
  const kw = String(state.filterKeyword || '').trim().toLowerCase()
  const from = parseDateInput(state.filterFrom, false)
  const to = parseDateInput(state.filterTo, true)
  const out = []
  for (const item of (list || [])) {
    if (kw) {
      const hay = `${item?.title || ''} ${item?.podcastTitle || ''} ${item?.summary || ''}`.toLowerCase()
      if (!hay.includes(kw)) continue
    }
    if (from !== null || to !== null) {
      const t = Number.isFinite(item?.publishedAt) ? item.publishedAt : null
      if (t === null) continue
      if (from !== null && t < from) continue
      if (to !== null && t > to) continue
    }
    out.push(item)
  }
  return out
}

function filterExternalPodcastResults(list) {
  const kw = String(state.filterKeyword || '').trim().toLowerCase()
  const searchedKw = String(state.externalKeyword || '').trim().toLowerCase()
  const lang = String(state.filterLang || '').trim().toLowerCase()
  const country = String(state.externalCountry || '').trim().toLowerCase()
  const tokens = tokenizeExternalKeyword(kw)
  const out = []
  for (const item of (list || [])) {
    const itemLang = String(item?.language || '').trim().toLowerCase() || 'unknown'
    if (lang && itemLang !== lang) continue
    const itemCountry = String(item?.countryCode || '').trim().toLowerCase()
    if (country && itemCountry !== country) continue
    if (kw && kw !== searchedKw) {
      const hay = `${item?.title || ''} ${item?.author || ''} ${item?.summary || ''} ${item?.countryLabel || ''}`.toLowerCase()
      if (tokens.length ? !tokens.every(token => hay.includes(token)) : !hay.includes(kw)) continue
    }
    out.push(item)
  }
  return out
}

async function searchExternalPodcasts() {
  if (state.externalSearching) return
  const kw = String(state.filterKeyword || '').trim()
  if (!kw) {
    state.view = 'external'
    state.externalResults = []
    refreshList()
    setInfo('先输入关键词，再点“搜索更多”')
    return
  }

  state.externalSearching = true
  state.view = 'external'
  refreshList()
  try {
    setInfo('外部搜索中…')
    const countries = resolveExternalSearchCountries(kw, state.externalCountry)
    const plans = buildExternalSearchPlans(kw)
    const all = []
    let matchedPlan = ''
    for (const plan of plans) {
      const batch = await fetchExternalPodcastBatch(plan.queries, countries)
      if (!batch.length) continue
      matchedPlan = plan.label
      all.push(...batch)
      break
    }
    state.externalKeyword = kw
    state.externalResults = sortExternalPodcasts(
      dedupeExternalPodcasts(all.map(normalizeExternalPodcast).filter(Boolean)),
      kw,
      state.externalCountry,
      state.filterLang
    )
    refreshList()
    setInfo(state.externalResults.length
      ? `已找到 ${state.externalResults.length} 个外部播客，可跳转继续收听${matchedPlan && matchedPlan !== '原词搜索' ? `（已自动放宽为${matchedPlan}）` : ''}`
      : '没有找到外部播客结果')
  } catch (_) {
    state.externalResults = []
    refreshList()
    setInfo('外部搜索失败，请稍后重试')
  } finally {
    state.externalSearching = false
    refreshList()
  }
}

async function fetchExternalPodcastBatch(queries, countries) {
  const all = []
  for (const query of (queries || [])) {
    for (const code of (countries || [])) {
      const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=24&country=${encodeURIComponent(code)}&term=${encodeURIComponent(query)}`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const results = Array.isArray(json?.results) ? json.results : []
      for (const item of results) {
        all.push({ ...item, _searchCountry: code, _searchQuery: query })
      }
    }
  }
  return all
}

function buildExternalSearchPlans(keyword) {
  const original = normalizeQuery(keyword)
  const relaxed = buildRelaxedQueries(original)
  const broad = buildBroadQueries(original)
  const plans = [
    { label: '原词搜索', queries: original ? [original] : [] },
    { label: '近义词搜索', queries: relaxed },
    { label: '宽松主题搜索', queries: broad }
  ]
  return plans.filter(plan => plan.queries.length)
}

function buildSearchEngineFallbackLinks(keyword, countryCode) {
  const kw = normalizeQuery(keyword)
  if (!kw) return []
  const region = externalCountryLabel(countryCode)
  const scoped = region ? `${kw} ${region}` : kw
  const rssQuery = `${scoped} rss podcast`
  const siteQuery = `${scoped} podcast official site`
  return [
    { label: 'Google 搜索', url: `https://www.google.com/search?q=${encodeURIComponent(`${scoped} podcast`)}` },
    { label: 'Bing 搜索', url: `https://www.bing.com/search?q=${encodeURIComponent(`${scoped} podcast`)}` },
    { label: 'DuckDuckGo', url: `https://duckduckgo.com/?q=${encodeURIComponent(`${scoped} podcast`)}` },
    { label: '搜 RSS', url: `https://www.google.com/search?q=${encodeURIComponent(rssQuery)}` },
    { label: '搜官网', url: `https://www.google.com/search?q=${encodeURIComponent(siteQuery)}` }
  ]
}

function buildSearchHintText(keyword, countryCode) {
  const kw = normalizeQuery(keyword)
  if (!kw) return ''
  const parts = []
  const region = externalCountryLabel(countryCode)
  if (region) parts.push(`地区提示：${region}`)
  const hints = [
    `${kw} podcast`,
    `${kw} rss`,
    `${kw} official site`
  ]
  if (region) hints.push(`${kw} ${region} podcast`)
  parts.push(`建议搜索词：${hints.join(' / ')}`)
  return parts.join(' · ')
}

function buildRelaxedQueries(keyword) {
  const out = []
  const q = normalizeQuery(keyword)
  if (!q) return out

  pushUnique(out, q.replace(/\bindian\b/g, 'india'))
  pushUnique(out, q.replace(/\bindia\b/g, 'indian'))
  pushUnique(out, q.replace(/\bstartup\b/g, 'entrepreneur'))
  pushUnique(out, q.replace(/\bstartup\b/g, 'founder'))
  pushUnique(out, q.replace(/\bstartup\b/g, 'business'))

  if (q.includes('indian startup') || q.includes('india startup')) {
    pushUnique(out, 'startup india')
    pushUnique(out, 'india entrepreneur')
    pushUnique(out, 'indian entrepreneur')
    pushUnique(out, 'india business podcast')
  }

  return out.filter(item => item && item !== q).slice(0, 6)
}

function buildBroadQueries(keyword) {
  const out = []
  const q = normalizeQuery(keyword)
  if (!q) return out

  const tokens = tokenizeExternalKeyword(q)
  const topicTokens = tokens.filter(token => !isRegionLikeToken(token))
  const regionTokens = tokens.filter(token => isRegionLikeToken(token))

  if (topicTokens.length) pushUnique(out, topicTokens.join(' '))
  if (regionTokens.length && topicTokens.length) {
    pushUnique(out, `${regionTokens.join(' ')} ${topicTokens[0]}`)
    pushUnique(out, `${topicTokens[0]} ${regionTokens.join(' ')}`)
  }

  if (tokens.includes('startup')) {
    pushUnique(out, 'startup podcast')
    pushUnique(out, 'founder podcast')
    pushUnique(out, 'entrepreneur podcast')
  }

  return out.filter(item => item && item !== q).slice(0, 6)
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function isRegionLikeToken(token) {
  return [
    'india', 'indian', 'singapore', 'singaporean', 'philippines', 'philippine',
    'filipino', 'malaysia', 'malaysian', 'hong', 'kong', 'uae', 'dubai',
    'abu', 'dhabi', 'emirates', 'emirati', 'manila'
  ].includes(String(token || '').trim().toLowerCase())
}

function pushUnique(list, value) {
  const v = normalizeQuery(value)
  if (!v) return
  if (!list.includes(v)) list.push(v)
}

async function searchPodcastEpisodes() {
  if (state.searching) return
  const kw = String(state.filterKeyword || '').trim().toLowerCase()
  const lang = String(state.filterLang || '').trim().toLowerCase()
  let sources = [...getRecommendedPodcasts(), ...getIndiePodcasts(), ...loadPodcasts()]
  const uniq = []
  for (const item of sources) {
    const id = String(item?.feedUrl || item?.id || '').trim()
    if (!id || uniq.some(x => String(x.feedUrl) === id)) continue
    uniq.push({ ...item, id, feedUrl: id })
  }
  sources = uniq
  if (lang) sources = sources.filter(item => (String(item?.language || '').trim().toLowerCase() || 'unknown') === lang)
  sources = sources.slice(0, 16)
  if (!sources.length) {
    setInfo('没有可搜索的播客源')
    return
  }

  state.searching = true
  refreshList()
  try {
    setInfo('搜索中…')
    const episodes = []
    const seen = new Set()
    let failed = 0
    for (const source of sources) {
      try {
        const res = await fetch(source.feedUrl, { mode: 'cors' })
        if (!res.ok) throw new Error('feed')
        const xml = await res.text()
        const parsed = parseFeed(xml)
        const title = parsed?.title || source.title || source.feedUrl
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

    let filtered = filterEpisodes(episodes)
      .slice()
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))

    if (kw) {
      const tokens = tokenizeExternalKeyword(kw)
      filtered = filtered.filter((item) => {
        const hay = `${item?.title || ''} ${item?.podcastTitle || ''} ${item?.summary || ''}`.toLowerCase()
        return tokens.length ? tokens.every(token => hay.includes(token)) : hay.includes(kw)
      })
    }

    state.selectedId = 'search'
    state.episodes = filtered
    refreshList()
    setInfo(`已找到 ${filtered.length} 个可播放剧集${failed ? `（${failed} 个源加载失败）` : ''}`)
  } finally {
    state.searching = false
    refreshList()
  }
}

async function openPodcast(id, autoPlay) {
  const source = getPodcastSourceById(id)
  if (!source?.feedUrl) return
  state.selectedId = id
  state.episodes = []
  refreshList()
  setInfo('加载播客中…')
  try {
    const res = await fetch(source.feedUrl, { mode: 'cors' })
    if (!res.ok) throw new Error('feed')
    const xml = await res.text()
    const parsed = parseFeed(xml)
    const title = parsed?.title || source.title || source.feedUrl
    const language = canonicalPodcastLanguage(parsed?.language || source?.language || '')
    const mine = loadPodcasts()
    if (mine.some(x => String(x.id) === String(id))) {
      savePodcasts(mine.map(x => String(x.id) === String(id) ? { ...x, title, language: language || x.language || '' } : x))
    }
    state.episodes = (parsed.items || []).slice(0, 80)
    if (!state.episodes.length) {
      setInfo('没有可播放的剧集')
    } else {
      setInfo(`已加载 ${state.episodes.length} 个剧集`)
      if (autoPlay) playEpisode(state.episodes[0])
    }
  } catch (_) {
    state.episodes = []
    setInfo('加载失败：该播客源可能不支持跨域（CORS）')
  } finally {
    refreshList()
  }
}

function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText || '', 'text/xml')
  const root = doc.documentElement
  const name = String(root?.nodeName || '').toLowerCase()
  if (name === 'rss') return parseRss(doc)
  if (name === 'feed') return parseAtom(doc)
  if (doc.querySelector('rss')) return parseRss(doc)
  if (doc.querySelector('feed')) return parseAtom(doc)
  return { title: '', language: '', items: [] }
}

function parseRss(doc) {
  const ch = doc.querySelector('channel')
  const title = textOf(ch?.querySelector('title')) || ''
  const language = canonicalPodcastLanguage(textOf(ch?.querySelector('language')) || '')
  const items = []
  for (const node of Array.from(doc.querySelectorAll('channel > item'))) {
    const audioUrl = pickRssAudioUrl(node)
    if (!audioUrl) continue
    const epTitle = textOf(node.querySelector('title')) || '未命名剧集'
    const guid = textOf(node.querySelector('guid')) || audioUrl
    const pub = textOf(node.querySelector('pubDate')) || textOf(node.querySelector('date')) || ''
    items.push({
      kind: 'episode',
      id: guid,
      guid,
      title: epTitle,
      podcastTitle: title,
      summary: stripHtml(textOf(node.querySelector('description')) || textOf(node.querySelector('itunes\\:summary')) || ''),
      audioUrl,
      publishedAt: Date.parse(pub || '') || null
    })
  }
  items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
  return { title, language, items }
}

function parseAtom(doc) {
  const feed = doc.querySelector('feed')
  const title = textOf(feed?.querySelector('title')) || ''
  const language = canonicalPodcastLanguage(feed?.getAttribute('xml:lang') || '')
  const items = []
  for (const node of Array.from(doc.querySelectorAll('feed > entry'))) {
    const audioUrl = pickAtomAudioUrl(node)
    if (!audioUrl) continue
    const epTitle = textOf(node.querySelector('title')) || '未命名剧集'
    const guid = textOf(node.querySelector('id')) || audioUrl
    const pub = textOf(node.querySelector('published')) || textOf(node.querySelector('updated')) || ''
    items.push({
      kind: 'episode',
      id: guid,
      guid,
      title: epTitle,
      podcastTitle: title,
      summary: stripHtml(textOf(node.querySelector('summary')) || textOf(node.querySelector('content')) || ''),
      audioUrl,
      publishedAt: Date.parse(pub || '') || null
    })
  }
  items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
  return { title, language, items }
}

function textOf(el) {
  return String(el?.textContent || '').trim()
}

function canonicalPodcastLanguage(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return ''
  const base = value.split(/[-_]/)[0]
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
  return map[base] || value
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeMediaUrl(u) {
  const url = normalizeUrl(u)
  if (!url) return ''
  if (location.protocol === 'https:' && url.startsWith('http://')) return ''
  return url
}

function pickRssAudioUrl(itemEl) {
  const enclosure = itemEl.querySelector('enclosure[url]')
  if (enclosure) {
    const type = String(enclosure.getAttribute('type') || '').trim().toLowerCase()
    const url = normalizeMediaUrl(enclosure.getAttribute('url') || '')
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
  const enclosure = links.find(link => String(link.getAttribute('rel') || '').trim().toLowerCase() === 'enclosure')
  if (enclosure) {
    const type = String(enclosure.getAttribute('type') || '').trim().toLowerCase()
    const url = normalizeMediaUrl(enclosure.getAttribute('href') || '')
    if (url && (!type || type.startsWith('audio/'))) return url
  }
  const audio = links.find(link => String(link.getAttribute('type') || '').trim().toLowerCase().startsWith('audio/'))
  if (!audio) return ''
  return normalizeMediaUrl(audio.getAttribute('href') || '')
}

function fmtDate(ms) {
  try {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch (_) {
    return ''
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
  const searchQuery = fallbackQuery || String(state.filterKeyword || '').trim()
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
    { value: 'sg', label: '新加坡（英语优先）' },
    { value: 'ph', label: '菲律宾（英语优先）' },
    { value: 'my', label: '马来西亚（英语优先）' },
    { value: 'hk', label: '香港（英语优先）' },
    { value: 'ae', label: '阿联酋（英语优先）' },
    { value: 'us', label: '美国' },
    { value: 'gb', label: '英国' },
    { value: 'au', label: '澳大利亚' },
    { value: 'ca', label: '加拿大' }
  ]
}

function resolveExternalSearchCountries(keyword, selected) {
  const manual = String(selected || '').trim().toLowerCase()
  if (manual === 'in') return ['in', 'us', 'gb', 'ca']
  if (manual === 'sg') return ['sg', 'us', 'gb', 'au']
  if (manual === 'ph') return ['ph', 'us', 'gb', 'au']
  if (manual === 'my') return ['my', 'sg', 'gb', 'au']
  if (manual === 'hk') return ['hk', 'sg', 'gb', 'au']
  if (manual === 'ae') return ['ae', 'gb', 'us', 'au']
  if (manual) return [manual]
  const kw = String(keyword || '').trim().toLowerCase()
  const indianHints = ['india', 'indian', 'hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali', 'punjabi', 'bollywood']
  const singaporeHints = ['singapore', 'singaporean', 'sg', 'singlish']
  const philippinesHints = ['philippines', 'philippine', 'filipino', 'manila', 'tagalog', 'cebuano']
  const malaysiaHints = ['malaysia', 'malaysian', 'kuala lumpur', 'malay', 'bahasa malaysia']
  const hongKongHints = ['hong kong', 'hongkong', 'hk', 'cantonese hong kong']
  const uaeHints = ['uae', 'dubai', 'abu dhabi', 'emirates', 'emirati']
  if (indianHints.some(x => kw.includes(x))) return ['in', 'us', 'gb']
  if (singaporeHints.some(x => kw.includes(x))) return ['sg', 'us', 'gb']
  if (philippinesHints.some(x => kw.includes(x))) return ['ph', 'us', 'gb']
  if (malaysiaHints.some(x => kw.includes(x))) return ['my', 'sg', 'gb']
  if (hongKongHints.some(x => kw.includes(x))) return ['hk', 'sg', 'gb']
  if (uaeHints.some(x => kw.includes(x))) return ['ae', 'gb', 'us']
  return ['us', 'in', 'gb']
}

function externalCountryLabel(code) {
  const value = String(code || '').trim().toLowerCase()
  const found = podcastExternalCountryOptions().find(item => item.value === value)
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
  const stopWords = new Set(['podcast', 'podcasts', 'show', 'shows', 'audio', 'listen', 'english', 'india', 'indian'])
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
  return `https://www.google.com/search?q=${encodeURIComponent(`${String(query || '').trim()} podcast`)}`
}

function openExternalUrl(url) {
  const href = normalizeUrl(url)
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function loadValue(keys, fallback) {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) continue
      const parsed = JSON.parse(raw)
      if (parsed !== null && parsed !== undefined) return parsed
    } catch (_) {}
  }
  return fallback
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (_) {}
}
