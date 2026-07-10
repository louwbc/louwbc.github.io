const $ = (s) => document.querySelector(s)

const ui = {
  info: $('#info'),
  searchInput: $('#searchInput'),
  regionSelect: $('#regionSelect'),
  categorySelect: $('#categorySelect'),
  tabAll: $('#tabAll'),
  tabFavorites: $('#tabFavorites'),
  tabRecent: $('#tabRecent'),
  openOfficialBtn: $('#openOfficialBtn'),
  nowTitle: $('#nowTitle'),
  nowMeta: $('#nowMeta'),
  nowNote: $('#nowNote'),
  favCurrentBtn: $('#favCurrentBtn'),
  playerAudio: $('#playerAudio'),
  stagePlaceholder: $('#stagePlaceholder'),
  floatingPlayer: $('#floatingPlayer'),
  floatingTitle: $('#floatingTitle'),
  floatingMeta: $('#floatingMeta'),
  floatingPlayPauseBtn: $('#floatingPlayPauseBtn'),
  floatingOfficialBtn: $('#floatingOfficialBtn'),
  channelList: $('#channelList'),
  listMeta: $('#listMeta'),
  empty: $('#empty')
}

const STORE = {
  favorites: 'global-tv:favorites',
  recent: 'global-tv:recent'
}

const state = {
  channels: [],
  view: 'all',
  currentId: null,
  hls: null
}

init()

async function init() {
  setupControls()
  setupPlayer()
  document.body.classList.add('audio-only')
  await loadChannels()
}

function setupControls() {
  ui.searchInput.addEventListener('input', refreshList)
  ui.regionSelect.addEventListener('change', refreshList)
  ui.categorySelect.addEventListener('change', refreshList)

  for (const btn of [ui.tabAll, ui.tabFavorites, ui.tabRecent]) {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view
      refreshTabs()
      refreshList()
    })
  }

  ui.openOfficialBtn.addEventListener('click', () => {
    const channel = getCurrentChannel()
    if (!channel?.watchUrl) return
    openExternalUrl(channel.watchUrl)
  })

  ui.favCurrentBtn.addEventListener('click', () => {
    const channel = getCurrentChannel()
    if (!channel) return
    toggleFavorite(channel.id)
    refreshCurrentActions()
    refreshList()
  })

  ui.floatingPlayPauseBtn.addEventListener('click', async () => {
    const channel = getCurrentChannel()
    if (!channel || channel.kind === 'external') return
    if (ui.playerAudio.paused) {
      if (!ui.playerAudio.currentSrc && !ui.playerAudio.src) {
        playHlsChannel(channel)
        updateFloatingControls()
        return
      }
      try {
        await ui.playerAudio.play()
      } catch (_) {
        setInfo(`${channel.title} 还没有开始播放`)
      }
    } else {
      ui.playerAudio.pause()
    }
    updateFloatingControls()
  })

  ui.floatingOfficialBtn.addEventListener('click', () => {
    const channel = getCurrentChannel()
    if (!channel?.watchUrl) return
    openExternalUrl(channel.watchUrl)
  })
}

function setupPlayer() {
  ui.playerAudio.addEventListener('playing', () => {
    const channel = getCurrentChannel()
    if (channel) setInfo(`正在收听 ${channel.title}`)
    updateFloatingControls()
  })
  ui.playerAudio.addEventListener('pause', () => {
    updateFloatingControls()
  })
  ui.playerAudio.addEventListener('loadedmetadata', () => {
    updateFloatingControls()
  })
  ui.playerAudio.addEventListener('ended', () => {
    updateFloatingControls()
  })
  ui.playerAudio.addEventListener('error', () => {
    const channel = getCurrentChannel()
    const label = channel?.title || '当前频道'
    setStageMessage('收听失败', `${label} 当前没有成功载入。你可以点击“打开官方直播”继续收听。`)
    setInfo(`${label} 收听失败`)
    updateFloatingControls()
  })
}

async function loadChannels() {
  try {
    const res = await fetch('./channels.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = await res.json()
    state.channels = normalizeChannels(parsed)
    populateFilters(state.channels)
    refreshTabs()
    refreshList()
    if (state.channels.length) {
      selectChannel(state.channels[0], false)
      setInfo(`已载入 ${state.channels.length} 个全球电视直播频道`)
    } else {
      setInfo('没有可用频道')
    }
  } catch (_) {
    state.channels = []
    refreshList()
    setStageMessage('频道加载失败', '请稍后刷新页面再试。')
    setInfo('频道加载失败')
  }
}

function normalizeChannels(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const id = String(item?.id || '').trim()
    const title = String(item?.title || '').trim()
    const region = String(item?.region || '').trim()
    const language = String(item?.language || '').trim()
    const category = String(item?.category || '').trim()
    const kind = String(item?.kind || '').trim()
    const streamUrl = normalizeUrl(item?.streamUrl || '')
    const watchUrl = normalizeUrl(item?.watchUrl || '')
    const note = String(item?.note || '').trim()
    if (!id || !title || seen.has(id)) continue
    if (kind === 'hls' && !streamUrl) continue
    if (!watchUrl) continue
    seen.add(id)
    out.push({ id, title, region, language, category, kind, streamUrl, watchUrl, note })
  }
  return out
}

function populateFilters(channels) {
  fillSelect(ui.regionSelect, extractUnique(channels, 'region'), '所有地区')
  fillSelect(ui.categorySelect, extractUnique(channels, 'category'), '所有分类')
}

function fillSelect(el, values, defaultLabel) {
  const current = el.value
  el.innerHTML = ''
  const first = document.createElement('option')
  first.value = ''
  first.textContent = defaultLabel
  el.appendChild(first)
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    if (value === current) option.selected = true
    el.appendChild(option)
  }
}

function extractUnique(channels, key) {
  const values = new Set()
  for (const channel of channels) {
    const value = String(channel?.[key] || '').trim()
    if (value) values.add(value)
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function refreshTabs() {
  for (const btn of [ui.tabAll, ui.tabFavorites, ui.tabRecent]) {
    const active = btn.dataset.view === state.view
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-selected', active ? 'true' : 'false')
  }
}

function refreshList() {
  const channels = getVisibleChannels()
  ui.channelList.innerHTML = ''
  ui.empty.hidden = channels.length > 0
  ui.listMeta.textContent = buildListMeta(channels.length)

  if (!channels.length) {
    ui.empty.textContent = state.view === 'favorites'
      ? '你还没有收藏频道。'
      : (state.view === 'recent' ? '还没有最近观看记录。' : '当前筛选条件下没有频道。')
    return
  }

  const frag = document.createDocumentFragment()
  for (const channel of channels) frag.appendChild(renderChannelItem(channel))
  ui.channelList.appendChild(frag)
}

function buildListMeta(count) {
  if (state.view === 'favorites') return `收藏中共 ${count} 个频道`
  if (state.view === 'recent') return `最近观看共 ${count} 个频道`
  return `当前共 ${count} 个频道`
}

function getVisibleChannels() {
  const favorites = new Set(loadList(STORE.favorites))
  const recent = loadList(STORE.recent)
  const byId = new Map(state.channels.map((item) => [item.id, item]))

  let base = state.channels
  if (state.view === 'favorites') {
    base = state.channels.filter((channel) => favorites.has(channel.id))
  } else if (state.view === 'recent') {
    base = recent.map((id) => byId.get(id)).filter(Boolean)
  }

  const keyword = String(ui.searchInput.value || '').trim().toLowerCase()
  const region = ui.regionSelect.value
  const category = ui.categorySelect.value

  return base.filter((channel) => {
    if (region && channel.region !== region) return false
    if (category && channel.category !== category) return false
    if (!keyword) return true
    const hay = `${channel.title} ${channel.region} ${channel.language} ${channel.category} ${channel.note}`.toLowerCase()
    return hay.includes(keyword)
  })
}

function renderChannelItem(channel) {
  const card = document.createElement('article')
  card.className = 'channel-item'
  if (channel.id === state.currentId) card.classList.add('active')
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `${channel.title}，${channel.kind === 'external' ? '打开官方直播' : '收听直播'}`)
  card.addEventListener('click', () => selectChannel(channel, true))
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    selectChannel(channel, true)
  })

  const main = document.createElement('div')
  main.className = 'channel-main'

  const title = document.createElement('h3')
  title.className = 'channel-title'
  title.textContent = channel.title

  const sub = document.createElement('div')
  sub.className = 'channel-sub'
  sub.textContent = [channel.region, channel.language, channel.category].filter(Boolean).join(' · ')

  const note = document.createElement('div')
  note.className = 'channel-note'
  note.textContent = channel.note || '官方公开直播频道'

  const tags = document.createElement('div')
  tags.className = 'channel-tags'
  for (const label of [channel.kind === 'external' ? '官方页' : '站内收听', '直播']) {
    const chip = document.createElement('span')
    chip.className = 'tag'
    chip.textContent = label
    tags.appendChild(chip)
  }

  main.append(title, sub, note, tags)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const playBtn = document.createElement('button')
  playBtn.className = 'btn primary'
  playBtn.type = 'button'
  playBtn.textContent = channel.kind === 'external' ? '打开' : '收听'
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    selectChannel(channel, true)
  })

  const officialBtn = document.createElement('button')
  officialBtn.className = 'btn'
  officialBtn.type = 'button'
  officialBtn.textContent = '官网'
  officialBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    openExternalUrl(channel.watchUrl)
  })

  const favBtn = document.createElement('button')
  favBtn.className = 'btn'
  favBtn.type = 'button'
  favBtn.textContent = isFavorite(channel.id) ? '已收藏' : '收藏'
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleFavorite(channel.id)
    refreshCurrentActions()
    refreshList()
  })

  actions.append(playBtn, officialBtn, favBtn)
  card.append(main, actions)
  return card
}

function selectChannel(channel, autoplay) {
  if (!channel) return
  state.currentId = channel.id
  saveRecent(channel.id)
  renderPlayer(channel, autoplay)
  refreshCurrentActions()
  updateFloatingControls()
  refreshList()
}

function renderPlayer(channel, autoplay) {
  ui.nowTitle.textContent = channel.title
  ui.nowMeta.textContent = [channel.region, channel.language, channel.category].filter(Boolean).join(' · ')
  ui.nowNote.textContent = channel.note || '官方公开直播频道'
  destroyHls()

  if (channel.kind === 'external') {
    ui.playerAudio.removeAttribute('src')
    ui.playerAudio.load()
    setStageMessage('该频道需要在官方页面继续收听', '这个频道暂不支持站内直连音频播放。我已经保留了官方直播入口，点击“打开官方直播”即可继续收听。')
    setInfo(`已选中 ${channel.title}，请打开官方直播页继续收听`)
    if (autoplay) openExternalUrl(channel.watchUrl)
    return
  }

  if (!autoplay) {
    ui.playerAudio.removeAttribute('src')
    ui.playerAudio.load()
    setStageMessage('已准备好收听', `点击“收听”即可开始播放 ${channel.title} 的声音。当前页面只提供纯音频模式。`)
    setInfo(`已选中 ${channel.title}`)
    return
  }

  playHlsChannel(channel)
}

function setStageMessage(title, text) {
  const titleEl = ui.stagePlaceholder.querySelector('.placeholder-title')
  const textEl = ui.stagePlaceholder.querySelector('.muted')
  if (titleEl) titleEl.textContent = title
  if (textEl) textEl.textContent = text
  ui.stagePlaceholder.hidden = false
}

function playHlsChannel(channel) {
  const url = channel.streamUrl
  if (!url) {
    setStageMessage('收听失败', '当前频道缺少可播放地址。')
    setInfo(`${channel.title} 缺少可播放地址`)
    return
  }

  ui.stagePlaceholder.hidden = true
  ui.playerAudio.muted = false

  const HlsCtor = window.Hls
  if (HlsCtor && typeof HlsCtor.isSupported === 'function' && HlsCtor.isSupported()) {
    const hls = new HlsCtor({
      enableWorker: true,
      lowLatencyMode: true
    })
    state.hls = hls
    hls.loadSource(url)
    hls.attachMedia(ui.playerAudio)
    hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      ui.playerAudio.play().catch(() => {
        setStageMessage('等待收听', `浏览器还没有自动开始播放 ${channel.title}。请点一下音频控件开始播放。`)
        setInfo(`${channel.title} 已载入，等待收听`)
      })
    })
    hls.on(HlsCtor.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        setStageMessage('收听失败', `${channel.title} 当前没有成功载入。你可以点击“打开官方直播”继续收听。`)
        setInfo(`${channel.title} 收听失败`)
      }
    })
    return
  }

  if (ui.playerAudio.canPlayType('application/vnd.apple.mpegurl')) {
    ui.playerAudio.src = url
    ui.playerAudio.play().catch(() => {
      setStageMessage('等待收听', `浏览器还没有自动开始播放 ${channel.title}。请点一下音频控件开始播放。`)
      setInfo(`${channel.title} 已载入，等待收听`)
    })
    return
  }

  setStageMessage('浏览器不支持 HLS', '当前浏览器无法直接播放这类直播流。你可以点击“打开官方直播”继续收听。')
  setInfo('当前浏览器不支持 HLS 音频播放')
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy()
    } catch (_) {}
    state.hls = null
  }
  try {
    ui.playerAudio.pause()
  } catch (_) {}
}

function refreshCurrentActions() {
  const channel = getCurrentChannel()
  const hasCurrent = !!channel
  ui.openOfficialBtn.disabled = !hasCurrent || !channel.watchUrl
  ui.favCurrentBtn.disabled = !hasCurrent
  ui.favCurrentBtn.textContent = hasCurrent && isFavorite(channel.id) ? '取消收藏' : '加入收藏'
  ui.floatingOfficialBtn.disabled = !hasCurrent || !channel.watchUrl
}

function getCurrentChannel() {
  return state.channels.find((item) => item.id === state.currentId) || null
}

function updateFloatingControls() {
  const channel = getCurrentChannel()
  const hasCurrent = !!channel
  ui.floatingPlayer.hidden = !hasCurrent
  if (!hasCurrent) {
    ui.floatingTitle.textContent = '未开始收听'
    ui.floatingMeta.textContent = ''
    ui.floatingPlayPauseBtn.disabled = true
    ui.floatingPlayPauseBtn.textContent = '开始收听'
    return
  }

  ui.floatingTitle.textContent = channel.title
  ui.floatingMeta.textContent = [channel.region, channel.language, channel.category].filter(Boolean).join(' · ')

  if (channel.kind === 'external') {
    ui.floatingPlayPauseBtn.disabled = true
    ui.floatingPlayPauseBtn.textContent = '站内不可播'
    return
  }

  ui.floatingPlayPauseBtn.disabled = false
  if (!ui.playerAudio.currentSrc && !ui.playerAudio.src) {
    ui.floatingPlayPauseBtn.textContent = '开始收听'
    return
  }
  ui.floatingPlayPauseBtn.textContent = ui.playerAudio.paused ? '继续播放' : '暂停'
}

function toggleFavorite(id) {
  const list = loadList(STORE.favorites)
  const next = list.includes(id) ? list.filter((item) => item !== id) : [id, ...list]
  save(STORE.favorites, next.slice(0, 50))
}

function isFavorite(id) {
  return loadList(STORE.favorites).includes(id)
}

function saveRecent(id) {
  const current = loadList(STORE.recent).filter((item) => item !== id)
  current.unshift(id)
  save(STORE.recent, current.slice(0, 20))
}

function setInfo(text) {
  ui.info.textContent = text
}

function loadList(key) {
  const list = load(key, [])
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

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (_) {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (_) {}
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!/^https?:$/.test(url.protocol)) return ''
    return url.toString()
  } catch (_) {
    return ''
  }
}

function openExternalUrl(url) {
  const href = normalizeUrl(url)
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}
