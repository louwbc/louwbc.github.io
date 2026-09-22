const $ = (s) => document.querySelector(s)

const ui = {
  info: $('#info'),
  searchInput: $('#searchInput'),
  languageSelect: $('#languageSelect'),
  regionSelect: $('#regionSelect'),
  countrySelect: $('#countrySelect'),
  categorySelect: $('#categorySelect'),
  availabilitySelect: $('#availabilitySelect'),
  tabAll: $('#tabAll'),
  tabFavorites: $('#tabFavorites'),
  tabRecent: $('#tabRecent'),
  exportFavoritesBtn: $('#exportFavoritesBtn'),
  importFavoritesBtn: $('#importFavoritesBtn'),
  importFavoritesInput: $('#importFavoritesInput'),
  subtitleBtn: $('#subtitleBtn'),
  floatingSubtitleBtn: $('#floatingSubtitleBtn'),
  playerFullscreenBtn: $('#playerFullscreenBtn'),
  openOfficialBtn: $('#openOfficialBtn'),
  modeAudioBtn: $('#modeAudioBtn'),
  modeVideoBtn: $('#modeVideoBtn'),
  nowOverline: $('#nowOverline'),
  nowTitle: $('#nowTitle'),
  nowMeta: $('#nowMeta'),
  nowNote: $('#nowNote'),
  favCurrentBtn: $('#favCurrentBtn'),
  unfiCurrentBtn: $('#unfiCurrentBtn'),
  stageWrap: $('#stageWrap'),
  stageShell: $('#stageShell'),
  playerAudio: $('#playerAudio'),
  videoMount: $('#videoMount'),
  playerVideo: $('#playerVideo'),
  stagePlaceholder: $('#stagePlaceholder'),
  floatingPlayer: $('#floatingPlayer'),
  floatingVideoWrap: $('#floatingVideoWrap'),
  floatingVideoMount: $('#floatingVideoMount'),
  floatingTitle: $('#floatingTitle'),
  floatingMeta: $('#floatingMeta'),
  floatingPlayPauseBtn: $('#floatingPlayPauseBtn'),
  floatingFullscreenBtn: $('#floatingFullscreenBtn'),
  floatingOfficialBtn: $('#floatingOfficialBtn'),
  channelList: $('#channelList'),
  listMeta: $('#listMeta'),
  empty: $('#empty')
}

const STORE = {
  favorites: 'global-tv:favorites',
  recent: 'global-tv:recent',
  playbackMode: 'global-tv:playbackMode',
  subtitleEnabled: 'global-tv:subtitleEnabled'
}

const FAVORITES_LIMIT = 100
const UNIFIED_FAV_STORE_KEY = 'solo-radio:unified-favorites'
const UNIFIED_FAV_LIMIT = 600
const handledKeyboardEvents = new WeakSet()

const state = {
  channels: [],
  view: 'all',
  currentId: null,
  hls: null,
  playbackMode: loadPlaybackMode(),
  subtitleEnabled: loadSubtitleEnabled(),
  subtitleAvailable: false,
  stageInView: true,
  videoDocked: false,
  stageObserver: null
}

init()

async function init() {
  setupControls()
  setupPlayer()
  setupKeyboardShortcuts()
  setupStageObserver()
  applyPlaybackMode(state.playbackMode, { persist: false, rerender: false })
  setDefaultStageMessage()
  await loadChannels()

  try {
    const params = new URLSearchParams(window.location.search || '')
    const channelId = String(params.get('channel') || '').trim()
    if (channelId) {
      const channel = findChannelById(channelId)
      if (channel) {
        selectChannel(channel, false)
        requestAnimationFrame(() => {
          try {
            const el = document.querySelector(`[data-channel-id="${CSS.escape(channelId)}"]`)
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          } catch (_) {}
        })
      }
    }
  } catch (_) {}
}

function setupControls() {
  ui.searchInput.addEventListener('input', refreshList)
  ui.languageSelect.addEventListener('change', refreshList)
  ui.regionSelect.addEventListener('change', refreshList)
  ui.countrySelect.addEventListener('change', refreshList)
  ui.categorySelect.addEventListener('change', refreshList)
  ui.availabilitySelect.addEventListener('change', refreshList)
  ui.modeAudioBtn.addEventListener('click', () => switchPlaybackMode('audio'))
  ui.modeVideoBtn.addEventListener('click', () => switchPlaybackMode('video'))
  ui.exportFavoritesBtn.addEventListener('click', exportFavorites)
  ui.importFavoritesBtn.addEventListener('click', () => {
    ui.importFavoritesInput.click()
  })
  ui.importFavoritesInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await importFavorites(file)
  })

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
  ui.playerFullscreenBtn.addEventListener('click', () => {
    togglePlayerFullscreen()
  })

  ui.favCurrentBtn.addEventListener('click', () => {
    const channel = getCurrentChannel()
    if (!channel) return
    const result = toggleFavorite(channel.id)
    handleFavoriteToggleResult(result, channel.title)
    refreshCurrentActions()
    refreshList()
  })

  if (ui.unfiCurrentBtn) {
    ui.unfiCurrentBtn.addEventListener('click', () => {
      const channel = getCurrentChannel()
      if (!channel) return
      toggleUnifiedFavoriteForChannel(channel)
      refreshCurrentActions()
      refreshList()
    })
  }

  ui.floatingPlayPauseBtn.addEventListener('click', async () => {
    const channel = getCurrentChannel()
    if (!channel || channel.kind === 'external') return
    const media = getPlaybackMedia()
    if (media.paused) {
      if (!hasMediaSource(media)) {
        playHlsChannel(channel)
        updateFloatingControls()
        return
      }
      try {
        await media.play()
      } catch (_) {
        setInfo(`${channel.title} 还没有开始${getPlaybackVerb()}`)
      }
    } else {
      media.pause()
    }
    updateFloatingControls()
  })

  ui.floatingOfficialBtn.addEventListener('click', () => {
    const channel = getCurrentChannel()
    if (!channel?.watchUrl) return
    openExternalUrl(channel.watchUrl)
  })
  ui.floatingFullscreenBtn.addEventListener('click', () => {
    togglePlayerFullscreen()
  })

  ui.subtitleBtn.addEventListener('click', toggleSubtitle)
  ui.floatingSubtitleBtn.addEventListener('click', toggleSubtitle)

  document.addEventListener('fullscreenchange', updateFullscreenButtons)
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtons)
}

function setupPlayer() {
  for (const media of [ui.playerAudio, ui.playerVideo]) {
    media.addEventListener('playing', () => {
      const channel = getCurrentChannel()
      if (channel) setInfo(`正在${getPlaybackVerb()} ${channel.title}`)
      updateFloatingControls()
    })
    media.addEventListener('pause', () => {
      updateFloatingControls()
    })
    media.addEventListener('loadedmetadata', () => {
      updateFloatingControls()
    })
    media.addEventListener('ended', () => {
      updateFloatingControls()
    })
    media.addEventListener('error', () => {
      const channel = getCurrentChannel()
      const label = channel?.title || '当前频道'
      setStageMessage(`${getPlaybackVerb()}失败`, `${label} 当前没有成功载入。你可以点击“打开官方直播”继续${getPlaybackVerb()}。`)
      setInfo(`${label} ${getPlaybackVerb()}失败`)
      updateFloatingControls()
    })
  }

  ui.playerVideo.addEventListener('webkitbeginfullscreen', () => {
    setInfo('原生视频全屏里浏览器可能会接管键盘。若要继续用 N / P / Space，请改用“页面全屏”。')
    updateFullscreenButtons()
  })
  ui.playerVideo.addEventListener('webkitendfullscreen', updateFullscreenButtons)
  ui.playerVideo.textTracks.addEventListener('addtrack', () => {
    checkSubtitleAvailability()
    applySubtitleMode()
  })
  ui.playerVideo.textTracks.addEventListener('change', () => {
    checkSubtitleAvailability()
  })
  ui.playerVideo.textTracks.addEventListener('removetrack', () => {
    checkSubtitleAvailability()
  })
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcut, true)
  window.addEventListener('keydown', handleKeyboardShortcut)
}

async function handleKeyboardShortcut(event) {
  if (handledKeyboardEvents.has(event)) return
  handledKeyboardEvents.add(event)
  if (shouldIgnoreKeyboardShortcut(event)) {
    return
  }

  const key = String(event.key || '').toLowerCase()

  if (event.code === 'KeyN' || key === 'n') {
    event.preventDefault()
    playRelativeChannel(1)
    return
  }

  if (event.code === 'KeyP' || key === 'p') {
    event.preventDefault()
    playRelativeChannel(-1)
    return
  }

  if (event.code === 'Space' || key === ' ') {
    const channel = getCurrentChannel()
    if (!channel || channel.kind === 'external') return
    event.preventDefault()
    await toggleCurrentPlayback()
    return
  }

  if (event.code === 'KeyF' || key === 'f') {
    if (!canUsePlayerFullscreen()) return
    event.preventDefault()
    await togglePlayerFullscreen()
  }

  if (event.code === 'KeyC' || key === 'c') {
    if (!canUseSubtitle()) {
      const channel = getCurrentChannel()
      if (state.playbackMode !== 'video') {
        setInfo('字幕切换仅在“看电视”模式下可用')
      } else if (!channel) {
        setInfo('请先选择一个频道')
      } else {
        setInfo('当前频道没有可用字幕')
      }
      return
    }
    event.preventDefault()
    toggleSubtitle()
  }
}

async function loadChannels() {
  try {
    const res = await fetch('./channels.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = await res.json()
    state.channels = normalizeChannels(parsed)
    const favoriteSync = syncStoredFavorites(state.channels)
    const favoriteChannels = getFavoriteChannels()
    state.view = favoriteChannels.length ? 'favorites' : 'all'
    populateFilters(state.channels)
    refreshTabs()
    refreshList()
    if (state.channels.length) {
      const initialChannel = favoriteChannels[0] || state.channels[0]
      selectChannel(initialChannel, false)
      const playableCount = state.channels.filter((item) => item.kind === 'hls').length
      const externalCount = state.channels.filter((item) => item.kind === 'external').length
      const syncText = favoriteSync.removedCount ? `，已清理 ${favoriteSync.removedCount} 个失效收藏` : ''
      const initialViewText = favoriteChannels.length ? '，已优先显示收藏频道' : ''
      setInfo(`已载入 ${state.channels.length} 个可用频道，其中 ${playableCount} 个可站内收听，${externalCount} 个需打开官网${syncText}${initialViewText}`)
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
    const country = inferCountry(item)
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
    out.push({ id, title, region, country, language, category, kind, streamUrl, watchUrl, note })
  }
  return out
}

function populateFilters(channels) {
  fillSelect(ui.languageSelect, extractUnique(channels, 'language'), '所有语言')
  fillSelect(ui.regionSelect, extractUnique(channels, 'region'), '所有地区')
  fillSelect(ui.countrySelect, extractUnique(channels, 'country'), '所有国家')
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
      ? getFavoritesEmptyMessage()
      : (state.view === 'recent' ? '还没有最近观看记录。' : '当前筛选条件下没有频道。')
    return
  }

  const frag = document.createDocumentFragment()
  for (const channel of channels) frag.appendChild(renderChannelItem(channel))
  ui.channelList.appendChild(frag)
}

function buildListMeta(count) {
  const visible = getVisibleChannels()
  const playableCount = visible.filter((item) => item.kind === 'hls').length
  const externalCount = visible.filter((item) => item.kind === 'external').length
  const suffix = `站内可播 ${playableCount} 个 · 官网打开 ${externalCount} 个`
  if (state.view === 'favorites') return `收藏中共 ${count} 个频道 · ${suffix}`
  if (state.view === 'recent') return `最近观看共 ${count} 个频道 · ${suffix}`
  return `当前共 ${count} 个频道 · ${suffix}`
}

function getVisibleChannels() {
  const favoriteIds = loadFavoriteIds()
  const recent = loadList(STORE.recent)
  const byId = new Map(state.channels.map((item) => [item.id, item]))

  let base = state.channels
  if (state.view === 'favorites') {
    base = favoriteIds.map((id) => byId.get(id)).filter(Boolean)
  } else if (state.view === 'recent') {
    base = recent.map((id) => byId.get(id)).filter(Boolean)
  }

  const keyword = String(ui.searchInput.value || '').trim().toLowerCase()
  const language = ui.languageSelect.value
  const region = ui.regionSelect.value
  const country = ui.countrySelect.value
  const category = ui.categorySelect.value
  const availability = ui.availabilitySelect.value

  return base.filter((channel) => {
    if (language && channel.language !== language) return false
    if (region && channel.region !== region) return false
    if (country && channel.country !== country) return false
    if (category && channel.category !== category) return false
    if (availability && channel.kind !== availability) return false
    if (!keyword) return true
    const hay = `${channel.title} ${channel.region} ${channel.country} ${channel.language} ${channel.category} ${channel.note}`.toLowerCase()
    return hay.includes(keyword)
  })
}

function getNavigableChannels() {
  return getVisibleChannels()
}

function getFavoriteChannels() {
  const byId = new Map(state.channels.map((item) => [item.id, item]))
  return loadFavoriteIds().map((id) => byId.get(id)).filter(Boolean)
}

function renderChannelItem(channel) {
  const card = document.createElement('article')
  card.className = 'channel-item'
  card.tabIndex = 0
  card.setAttribute('data-channel-id', String(channel.id || ''))
  if (channel.id === state.currentId) card.classList.add('active')
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `${channel.title}，${channel.kind === 'external' ? '打开官方直播' : `${getPlaybackVerb()}直播`}`)
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
  sub.textContent = [channel.region, channel.country, channel.language, channel.category].filter(Boolean).join(' · ')

  const note = document.createElement('div')
  note.className = 'channel-note'
  note.textContent = channel.note || '官方公开直播频道'

  const tags = document.createElement('div')
  tags.className = 'channel-tags'
  for (const label of [getKindLabel(channel.kind), '直播']) {
    const chip = document.createElement('span')
    chip.className = 'tag'
    chip.textContent = label
    tags.appendChild(chip)
  }

  main.append(title, sub, note, tags)

  const actions = document.createElement('div')
  actions.className = 'item-actions'

  const primaryRow = document.createElement('div')
  primaryRow.className = 'item-primary-row'

  const playBtn = document.createElement('button')
  playBtn.className = 'btn primary'
  playBtn.type = 'button'
  playBtn.textContent = channel.kind === 'external' ? '打开' : getPlayButtonLabel()
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

  primaryRow.append(playBtn, officialBtn)

  const secondaryRow = document.createElement('div')
  secondaryRow.className = 'item-secondary-row'

  const favBtn = document.createElement('button')
  favBtn.className = 'btn'
  favBtn.type = 'button'
  favBtn.textContent = isFavorite(channel.id) ? '已收藏' : '收藏'
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const result = toggleFavorite(channel.id)
    handleFavoriteToggleResult(result, channel.title)
    refreshCurrentActions()
    refreshList()
  })

  const unfiId = `tv:${channel.id}`
  const inUnified = (loadRawUnified() || []).some(x => String(x.id) === String(unfiId))
  const unfiBtn = document.createElement('button')
  unfiBtn.className = 'btn icon-btn tiny'
  unfiBtn.type = 'button'
  unfiBtn.textContent = inUnified ? '✓' : '✚'
  unfiBtn.title = inUnified ? '已加入统一收藏' : '加入统一收藏'
  unfiBtn.setAttribute('aria-label', unfiBtn.title)
  unfiBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleUnifiedFavoriteForChannel(channel)
    refreshList()
  })

  secondaryRow.append(favBtn, unfiBtn)

  actions.append(primaryRow, secondaryRow)

  if (state.view === 'favorites') {
    const favs = loadFavoriteIds()
    const pos = getFavoritePosition(channel.id)
    if (favs.length > 1 && pos) {
      const reorderRow = document.createElement('div')
      reorderRow.className = 'item-reorder-row'
      const atTop = pos.index === 0
      const atBottom = pos.index === favs.length - 1
      const makeR = (icon, label, disabled, onClick) => {
        const b = document.createElement('button')
        b.className = 'btn icon-btn tiny'
        b.type = 'button'
        b.textContent = icon
        b.setAttribute('aria-label', label)
        b.disabled = disabled
        b.addEventListener('click', (ev) => {
          ev.stopPropagation()
          if (b.disabled) return
          onClick()
        })
        return b
      }
      const name = channel.title
      reorderRow.append(
        makeR('⤒', '移到最前', atTop, () => {
          const r = moveFavoriteToTop(channel.id); if (r) setInfo(`已将「${name}」移到第 ${r.position} 位`); refreshList()
        }),
        makeR('↑', '上移一位', atTop, () => {
          const r = moveFavoriteUp(channel.id); if (r) setInfo(`已将「${name}」上移到第 ${r.position} 位`); refreshList()
        }),
        makeR('↓', '下移一位', atBottom, () => {
          const r = moveFavoriteDown(channel.id); if (r) setInfo(`已将「${name}」下移到第 ${r.position} 位`); refreshList()
        }),
        makeR('⤓', '移到最后', atBottom, () => {
          const r = moveFavoriteToBottom(channel.id); if (r) setInfo(`已将「${name}」移到第 ${r.position} 位`); refreshList()
        })
      )
      actions.append(reorderRow)
    }
  }

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

function playRelativeChannel(step) {
  const list = getNavigableChannels()
  if (!list.length) {
    setInfo('当前列表里没有可切换的频道')
    return
  }

  const currentId = getCurrentChannel()?.id || ''
  const currentIndex = list.findIndex((item) => item.id === currentId)
  const baseIndex = currentIndex >= 0 ? currentIndex : (step > 0 ? -1 : 0)
  const nextIndex = modulo(baseIndex + step, list.length)
  const target = list[nextIndex]
  if (!target) return
  selectChannel(target, true)
  setInfo(`已切到 ${target.title}`)
}

function renderPlayer(channel, autoplay) {
  ui.nowTitle.textContent = channel.title
  ui.nowMeta.textContent = [channel.region, channel.country, channel.language, channel.category].filter(Boolean).join(' · ')
  ui.nowNote.textContent = channel.note || '官方公开直播频道'
  ui.nowOverline.textContent = state.playbackMode === 'video' ? '正在观看' : '正在收听'
  destroyHls()

  if (channel.kind === 'external') {
    resetAllMedia()
    setStageMessage(`该频道需要在官方页面继续${getPlaybackVerb()}`, `这个频道暂不支持站内直连${getPlaybackModeLabel()}。我已经保留了官方直播入口，点击“打开官方直播”即可继续${getPlaybackVerb()}。`)
    setInfo(`已选中 ${channel.title}，请打开官方直播页继续${getPlaybackVerb()}`)
    syncFloatingVideoDock()
    if (autoplay) openExternalUrl(channel.watchUrl)
    return
  }

  if (!autoplay) {
    resetAllMedia()
    setStageMessage(getReadyStageTitle(), `点击“${getPlayButtonLabel()}”即可开始${getPlaybackVerb()} ${channel.title}。${getReadyStageDescription()}`)
    setInfo(`已选中 ${channel.title}`)
    syncFloatingVideoDock()
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
    setStageMessage(`${getPlaybackVerb()}失败`, '当前频道缺少可播放地址。')
    setInfo(`${channel.title} 缺少可播放地址`)
    return
  }

  const media = getPlaybackMedia()
  resetAllMedia(media)
  ui.stagePlaceholder.hidden = true
  media.muted = false
  syncFloatingVideoDock()

  const HlsCtor = window.Hls
  if (HlsCtor && typeof HlsCtor.isSupported === 'function' && HlsCtor.isSupported()) {
    const hls = new HlsCtor({
      enableWorker: true,
      lowLatencyMode: true,
      enableWebVTT: true,
      renderTextTracksNatively: true
    })
    state.hls = hls
    hls.loadSource(url)
    hls.attachMedia(media)
    hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      if (state.playbackMode === 'video') {
        checkSubtitleAvailability()
        applySubtitleMode()
      }
      media.play().catch(() => {
        setStageMessage(getWaitingStageTitle(), `浏览器还没有自动开始${getPlaybackVerb()} ${channel.title}。请点一下播放器开始。`)
        setInfo(`${channel.title} 已载入，等待${getPlaybackVerb()}`)
      })
    })
    hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, () => {
      checkSubtitleAvailability()
      applySubtitleMode()
    })
    hls.on(HlsCtor.Events.SUBTITLE_TRACK_SWITCH, () => {
      checkSubtitleAvailability()
    })
    hls.on(HlsCtor.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        setStageMessage(`${getPlaybackVerb()}失败`, `${channel.title} 当前没有成功载入。你可以点击“打开官方直播”继续${getPlaybackVerb()}。`)
        setInfo(`${channel.title} ${getPlaybackVerb()}失败`)
      }
    })
    return
  }

  if (media.canPlayType('application/vnd.apple.mpegurl')) {
    media.src = url
    media.play().catch(() => {
      setStageMessage(getWaitingStageTitle(), `浏览器还没有自动开始${getPlaybackVerb()} ${channel.title}。请点一下播放器开始。`)
      setInfo(`${channel.title} 已载入，等待${getPlaybackVerb()}`)
    })
    setTimeout(() => {
      if (state.playbackMode === 'video') {
        checkSubtitleAvailability()
        applySubtitleMode()
      }
    }, 2000)
    return
  }

  setStageMessage('浏览器不支持 HLS', '当前浏览器无法直接播放这类直播流。你可以点击“打开官方直播”继续收听。')
  setInfo(`当前浏览器不支持 HLS ${getPlaybackModeLabel()}`)
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy()
    } catch (_) {}
    state.hls = null
  }
  resetAllMedia()
  syncFloatingVideoDock()
}

function refreshCurrentActions() {
  const channel = getCurrentChannel()
  const hasCurrent = !!channel
  ui.openOfficialBtn.disabled = !hasCurrent || !channel.watchUrl
  ui.favCurrentBtn.disabled = !hasCurrent
  ui.favCurrentBtn.textContent = hasCurrent && isFavorite(channel.id) ? '取消收藏' : '加入收藏'
  if (ui.unfiCurrentBtn) {
    ui.unfiCurrentBtn.disabled = !hasCurrent
    if (hasCurrent) {
      const unfiId = `tv:${channel.id}`
      const inU = (loadRawUnified() || []).some(x => String(x.id) === String(unfiId))
      ui.unfiCurrentBtn.textContent = inU ? '✓ 已加入统一收藏' : '加入统一收藏'
    } else {
      ui.unfiCurrentBtn.textContent = '加入统一收藏'
    }
  }
  ui.floatingOfficialBtn.disabled = !hasCurrent || !channel.watchUrl
  updateSubtitleButtons()
  updateFullscreenButtons()
}

async function togglePlayerFullscreen() {
  const channel = getCurrentChannel()
  if (!canUsePlayerFullscreen(channel)) return

  if (isPlayerFullscreen()) {
    exitPlayerFullscreen()
    return
  }

  try {
    if (ui.stageShell.requestFullscreen) {
      await ui.stageShell.requestFullscreen()
    } else if (ui.stageShell.webkitRequestFullscreen) {
      ui.stageShell.webkitRequestFullscreen()
    } else if (ui.playerVideo.webkitEnterFullscreen) {
      ui.playerVideo.webkitEnterFullscreen()
    } else {
      setInfo('当前浏览器不支持页面全屏')
      return
    }
    setInfo('已进入页面全屏，可继续用 N / P / Space 控制')
  } catch (_) {
    setInfo('进入全屏失败，请再试一次')
  }
  updateFullscreenButtons()
}

function exitPlayerFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    } else if (ui.playerVideo.webkitDisplayingFullscreen && ui.playerVideo.webkitExitFullscreen) {
      ui.playerVideo.webkitExitFullscreen()
    }
  } catch (_) {}
  updateFullscreenButtons()
}

function canUsePlayerFullscreen(channel = getCurrentChannel()) {
  return !!ui.stageShell && state.playbackMode === 'video' && !!channel && channel.kind === 'hls'
}

function isPlayerFullscreen() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement
  if (fullscreenElement) {
    return fullscreenElement === ui.stageShell || ui.stageShell.contains(fullscreenElement)
  }
  return !!ui.playerVideo.webkitDisplayingFullscreen
}

function updateFullscreenButtons() {
  const enabled = canUsePlayerFullscreen()
  const label = isPlayerFullscreen() ? '退出全屏' : '页面全屏'
  ui.playerFullscreenBtn.disabled = !enabled
  ui.floatingFullscreenBtn.disabled = !enabled
  ui.playerFullscreenBtn.textContent = label
  ui.floatingFullscreenBtn.textContent = label
}

async function toggleCurrentPlayback() {
  const channel = getCurrentChannel()
  if (!channel || channel.kind === 'external') return
  const media = getPlaybackMedia()
  if (media.paused) {
    if (!hasMediaSource(media)) {
      playHlsChannel(channel)
      updateFloatingControls()
      return
    }
    try {
      await media.play()
    } catch (_) {
      setInfo(`${channel.title} 还没有开始${getPlaybackVerb()}`)
    }
  } else {
    media.pause()
  }
  updateFloatingControls()
}

function getFavoritesEmptyMessage() {
  return loadFavoriteIds().length
    ? '当前筛选条件下没有匹配的收藏频道。'
    : '你还没有收藏频道。'
}

function handleFavoriteToggleResult(result, title) {
  const label = String(title || '当前频道').trim()
  if (!result || result.status === 'noop') return
  if (result.status === 'added') {
    setInfo(`已收藏 ${label}`)
    return
  }
  if (result.status === 'removed') {
    setInfo(`已取消收藏 ${label}`)
    return
  }
  if (result.status === 'limit_reached') {
    setInfo(`收藏已达 ${result.limit} 个上限，请先取消一些收藏后再添加 ${label}`)
  }
}

function exportFavorites() {
  const favoriteChannels = getFavoriteChannels()
  if (!favoriteChannels.length) {
    setInfo('当前没有可导出的收藏频道')
    return
  }

  const payload = {
    app: 'global-tv',
    exportedAt: new Date().toISOString(),
    count: favoriteChannels.length,
    favorites: favoriteChannels.map((channel) => channel.id)
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `global-tv-favorites-${buildExportDate()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  setInfo(`已导出 ${favoriteChannels.length} 个收藏频道`)
}

async function importFavorites(file) {
  try {
    const raw = await file.text()
    const parsed = JSON.parse(raw)
    const importedIds = extractImportedFavoriteIds(parsed)
    if (!importedIds.length) {
      setInfo('导入文件里没有可用的收藏频道')
      return
    }

    const validIds = new Set(state.channels.map((item) => item.id))
    const currentIds = loadFavoriteIds()
    const currentSet = new Set(currentIds)
    const next = [...currentIds]

    let invalidCount = 0
    let duplicateCount = 0
    let addedCount = 0

    for (const id of importedIds) {
      if (!validIds.has(id)) {
        invalidCount += 1
        continue
      }
      if (currentSet.has(id)) {
        duplicateCount += 1
        continue
      }
      if (next.length >= FAVORITES_LIMIT) break
      next.push(id)
      currentSet.add(id)
      addedCount += 1
    }

    const overflowCount = Math.max(0, currentIds.length + importedIds.length - invalidCount - duplicateCount - next.length)
    if (!addedCount) {
      const overflowText = overflowCount ? `，另有 ${overflowCount} 个因超过 ${FAVORITES_LIMIT} 条上限未导入` : ''
      setInfo(`没有新增收藏频道，已跳过 ${duplicateCount} 个重复频道和 ${invalidCount} 个失效频道${overflowText}`)
      return
    }

    save(STORE.favorites, next)
    state.view = 'favorites'
    refreshTabs()
    refreshList()
    const favoriteChannels = getFavoriteChannels()
    const current = getCurrentChannel()
    if (!current || !currentSet.has(current.id)) {
      const firstFavorite = favoriteChannels[0]
      if (firstFavorite) selectChannel(firstFavorite, false)
    }

    const skipped = []
    if (duplicateCount) skipped.push(`${duplicateCount} 个重复`)
    if (invalidCount) skipped.push(`${invalidCount} 个失效`)
    if (overflowCount) skipped.push(`${overflowCount} 个超出上限`)
    const skippedText = skipped.length ? `，已跳过 ${skipped.join('、')}` : ''
    setInfo(`已导入 ${addedCount} 个收藏频道${skippedText}`)
  } catch (_) {
    setInfo('导入失败，请选择格式正确的 JSON 收藏文件')
  }
}

function extractImportedFavoriteIds(payload) {
  const source = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.favorites) ? payload.favorites : [])
  const seen = new Set()
  const out = []
  for (const item of source) {
    const value = String(item || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function buildExportDate() {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function getCurrentChannel() {
  return state.channels.find((item) => item.id === state.currentId) || null
}

function updateFloatingControls() {
  const channel = getCurrentChannel()
  const hasCurrent = !!channel
  const media = getPlaybackMedia()
  syncFloatingVideoDock()
  ui.floatingPlayer.hidden = !hasCurrent
  ui.floatingPlayer.classList.toggle('with-video', state.videoDocked)
  if (!hasCurrent) {
    ui.floatingTitle.textContent = `未开始${getPlaybackVerb()}`
    ui.floatingMeta.textContent = ''
    ui.floatingPlayPauseBtn.disabled = true
    ui.floatingPlayPauseBtn.textContent = getStartButtonLabel()
    updateFullscreenButtons()
    return
  }

  ui.floatingTitle.textContent = channel.title
  ui.floatingMeta.textContent = [channel.region, channel.country, channel.language, channel.category].filter(Boolean).join(' · ')

  if (channel.kind === 'external') {
    ui.floatingPlayPauseBtn.disabled = true
    ui.floatingPlayPauseBtn.textContent = '站内不可播'
    updateFullscreenButtons()
    return
  }

  ui.floatingPlayPauseBtn.disabled = false
  if (!hasMediaSource(media)) {
    ui.floatingPlayPauseBtn.textContent = getStartButtonLabel()
    updateSubtitleButtons()
    updateFullscreenButtons()
    return
  }
  ui.floatingPlayPauseBtn.textContent = media.paused ? getContinueButtonLabel() : '暂停'
  updateSubtitleButtons()
  updateFullscreenButtons()
}

function switchPlaybackMode(mode) {
  const current = getCurrentChannel()
  const activeMedia = getPlaybackMedia()
  const shouldResume = !!current && current.kind === 'hls' && hasMediaSource(activeMedia) && !activeMedia.paused
  applyPlaybackMode(mode, { rerender: false })
  if (mode === 'video') {
    setTimeout(() => {
      checkSubtitleAvailability()
      applySubtitleMode()
    }, 500)
  } else {
    state.subtitleAvailable = false
    updateSubtitleButtons()
  }
  if (current) {
    renderPlayer(current, shouldResume)
    refreshCurrentActions()
    updateFloatingControls()
    refreshList()
  } else {
    setDefaultStageMessage()
    updateFloatingControls()
    refreshList()
  }
}

function applyPlaybackMode(mode, options = {}) {
  const { persist = true, rerender = true } = options
  const nextMode = mode === 'video' ? 'video' : 'audio'
  state.playbackMode = nextMode
  document.body.classList.toggle('audio-only', nextMode === 'audio')
  document.body.classList.toggle('video-mode', nextMode === 'video')
  updateModeButtons()
  syncFloatingVideoDock()
  if (persist) save(STORE.playbackMode, nextMode)
  if (!rerender) return
  const current = getCurrentChannel()
  if (current) renderPlayer(current, false)
}

function updateModeButtons() {
  const isAudio = state.playbackMode === 'audio'
  ui.modeAudioBtn.classList.toggle('active', isAudio)
  ui.modeAudioBtn.setAttribute('aria-selected', isAudio ? 'true' : 'false')
  ui.modeVideoBtn.classList.toggle('active', !isAudio)
  ui.modeVideoBtn.setAttribute('aria-selected', !isAudio ? 'true' : 'false')
}

function getPlaybackMedia() {
  return state.playbackMode === 'video' ? ui.playerVideo : ui.playerAudio
}

function hasMediaSource(media) {
  return !!(media?.currentSrc || media?.src)
}

function resetAllMedia(exceptMedia = null) {
  for (const media of [ui.playerAudio, ui.playerVideo]) {
    if (media === exceptMedia) continue
    resetMedia(media)
  }
}

function resetMedia(media) {
  if (!media) return
  try {
    media.pause()
  } catch (_) {}
  try {
    media.removeAttribute('src')
    media.load()
  } catch (_) {}
}

function loadPlaybackMode() {
  const saved = load(STORE.playbackMode, 'audio')
  return saved === 'video' ? 'video' : 'audio'
}

function getPlaybackVerb() {
  return state.playbackMode === 'video' ? '观看' : '收听'
}

function getPlaybackModeLabel() {
  return state.playbackMode === 'video' ? '视频播放' : '音频播放'
}

function getPlayButtonLabel() {
  return state.playbackMode === 'video' ? '观看' : '收听'
}

function getStartButtonLabel() {
  return state.playbackMode === 'video' ? '开始观看' : '开始收听'
}

function getContinueButtonLabel() {
  return state.playbackMode === 'video' ? '继续观看' : '继续播放'
}

function getReadyStageTitle() {
  return state.playbackMode === 'video' ? '已准备好观看' : '已准备好收听'
}

function getWaitingStageTitle() {
  return state.playbackMode === 'video' ? '等待观看' : '等待收听'
}

function getReadyStageDescription() {
  return state.playbackMode === 'video'
    ? '当前页面默认仍是只听音频，但你已经切到了视频模式。'
    : '当前页面默认使用只听音频模式。'
}

function setDefaultStageMessage() {
  const title = state.playbackMode === 'video' ? '准备观看全球电视直播' : '准备收听全球电视直播'
  setStageMessage(title, '选择下方频道后，默认会先按只听音频来播放；如果你切到“看电视”模式，这里也可以直接显示直播画面。')
}

function getKindLabel(kind) {
  return kind === 'external' ? '官网打开' : '站内可播'
}

function inferCountry(item) {
  const explicit = String(item?.country || '').trim()
  if (explicit) return explicit

  const text = normalizeMatchText([
    item?.id,
    item?.title,
    item?.note,
    item?.watchUrl,
    item?.streamUrl
  ].filter(Boolean).join(' '))

  for (const [pattern, label] of COUNTRY_PATTERNS) {
    if (pattern.test(text)) return label
  }

  const host = getHostname(item?.watchUrl || item?.streamUrl || '')
  for (const [suffix, label] of COUNTRY_DOMAIN_SUFFIXES) {
    if (host.endsWith(suffix)) return label
  }

  return ''
}

function normalizeMatchText(value) {
  return String(value || '').trim().toLowerCase()
}

function getHostname(value) {
  try {
    return new URL(String(value || '').trim()).hostname.toLowerCase()
  } catch (_) {
    return ''
  }
}

function setupStageObserver() {
  if (!ui.stageWrap) return
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      state.stageInView = !!entry?.isIntersecting && entry.intersectionRatio > 0.35
      syncFloatingVideoDock()
    }, {
      threshold: [0, 0.35, 0.75, 1]
    })
    observer.observe(ui.stageWrap)
    state.stageObserver = observer
    return
  }

  const handle = () => {
    const rect = ui.stageWrap.getBoundingClientRect()
    const vh = window.innerHeight || document.documentElement.clientHeight || 0
    const visibleTop = Math.max(rect.top, 0)
    const visibleBottom = Math.min(rect.bottom, vh)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    const ratio = rect.height > 0 ? visibleHeight / rect.height : 0
    state.stageInView = ratio > 0.35
    syncFloatingVideoDock()
  }
  window.addEventListener('scroll', handle, { passive: true })
  window.addEventListener('resize', handle)
  handle()
}

function syncFloatingVideoDock() {
  const shouldDock = shouldDockVideo()
  const targetMount = shouldDock ? ui.floatingVideoMount : ui.videoMount
  if (targetMount && ui.playerVideo.parentElement !== targetMount) {
    targetMount.appendChild(ui.playerVideo)
  }
  state.videoDocked = shouldDock
  ui.floatingVideoWrap.hidden = !shouldDock
  ui.floatingPlayer.classList.toggle('with-video', shouldDock)
}

function shouldDockVideo() {
  const channel = getCurrentChannel()
  if (state.playbackMode !== 'video') return false
  if (!channel || channel.kind !== 'hls') return false
  return !state.stageInView
}

function shouldIgnoreKeyboardShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON'
}

function modulo(value, length) {
  if (!length) return 0
  return ((value % length) + length) % length
}

const COUNTRY_PATTERNS = [
  [/\bdw\b|deutsche welle|germany|german|berlin/, '德国'],
  [/france\s*24|franceinfo|tv5 monde|paris/, '法国'],
  [/\bnhk\b|world-japan|japan|tokyo/, '日本'],
  [/\btrt\b|turkiye|turkey|istanbul/, '土耳其'],
  [/\bcgtn\b|\bcctv\b|china|beijing/, '中国'],
  [/al jazeera|doha|qatar/, '卡塔尔'],
  [/al arabiya|saudi|riyadh/, '沙特阿拉伯'],
  [/africanews/, '非洲多国'],
  [/reuters/, '英国'],
  [/euronews/, '欧洲多国'],
  [/wion|india today|ndtv|news18|times now|mirror now|republic world|cnbc tv18|cnn-news18|\bindia\b|\bdelhi\b|\bmumbai\b/, '印度'],
  [/arirang|south korea|seoul|korea/, '韩国'],
  [/\bcna\b|channel newsasia|singapore/, '新加坡'],
  [/sky news weather/, '英国'],
  [/sky news extra|skynewsau|2gb|3aw|6pr|4bc|5aa|sydney|melbourne|perth|adelaide|brisbane|australia|australian/, '澳大利亚'],
  [/new zealand|\bnz\b|auckland|wellington|christchurch/, '新西兰'],
  [/cbc|cp24|ctv news|global news canada|toronto|vancouver|montreal|ottawa/, '加拿大'],
  [/abc news live|nbc news now|cbs news|fox weather|scripps news|newsmax|court tv|law \& crime|cheddar|weather nation|accuweather|pbs|30a|baltimore|portland|seattle|boston|chicago|miami|philadelphia|sacramento|bay area|san diego|las vegas|milwaukee|denver|albuquerque|austin|tucson|manchester nh|st\.?\s*paul|atlanta|los angeles|new york|washington|phoenix|orlando|dallas|houston|america|united states|\busa\b/, '美国'],
  [/hong kong|\bhk\b/, '中国香港'],
  [/philippines|philippine|manila|cebu/, '菲律宾'],
  [/malaysia|kuala lumpur/, '马来西亚'],
  [/uae|dubai|abu dhabi|emirates/, '阿联酋'],
  [/ireland|dublin/, '爱尔兰'],
  [/italy|rome|milan/, '意大利'],
  [/spain|madrid|barcelona/, '西班牙'],
  [/portugal|lisbon/, '葡萄牙'],
  [/netherlands|amsterdam|dutch/, '荷兰'],
  [/belgium|brussels/, '比利时'],
  [/switzerland|zurich|geneva/, '瑞士'],
  [/sweden|stockholm/, '瑞典'],
  [/norway|oslo/, '挪威'],
  [/denmark|copenhagen/, '丹麦'],
  [/finland|helsinki/, '芬兰'],
  [/austria|vienna/, '奥地利'],
  [/poland|warsaw/, '波兰'],
  [/czech|prague/, '捷克'],
  [/romania|bucharest/, '罗马尼亚'],
  [/greece|athens/, '希腊'],
  [/israel|jerusalem|tel aviv/, '以色列'],
  [/south africa|johannesburg|cape town/, '南非'],
  [/kenya|nairobi/, '肯尼亚'],
  [/nigeria|lagos|abuja/, '尼日利亚']
]

const COUNTRY_DOMAIN_SUFFIXES = [
  ['.jp', '日本'],
  ['.tr', '土耳其'],
  ['.cn', '中国'],
  ['.hk', '中国香港'],
  ['.kr', '韩国'],
  ['.sg', '新加坡'],
  ['.in', '印度'],
  ['.au', '澳大利亚'],
  ['.nz', '新西兰'],
  ['.ca', '加拿大'],
  ['.fr', '法国'],
  ['.de', '德国'],
  ['.uk', '英国'],
  ['.ie', '爱尔兰'],
  ['.it', '意大利'],
  ['.es', '西班牙'],
  ['.pt', '葡萄牙'],
  ['.nl', '荷兰'],
  ['.be', '比利时'],
  ['.ch', '瑞士'],
  ['.se', '瑞典'],
  ['.no', '挪威'],
  ['.dk', '丹麦'],
  ['.fi', '芬兰'],
  ['.pl', '波兰'],
  ['.cz', '捷克'],
  ['.ro', '罗马尼亚'],
  ['.gr', '希腊'],
  ['.il', '以色列'],
  ['.za', '南非'],
  ['.ke', '肯尼亚'],
  ['.ng', '尼日利亚'],
  ['.ae', '阿联酋'],
  ['.qa', '卡塔尔'],
  ['.sa', '沙特阿拉伯'],
  ['.ph', '菲律宾'],
  ['.my', '马来西亚']
]

function toggleFavorite(id) {
  const value = String(id || '').trim()
  if (!value) return { status: 'noop' }

  const list = loadFavoriteIds()
  if (list.includes(value)) {
    const next = list.filter((item) => item !== value)
    save(STORE.favorites, next)
    return { status: 'removed', count: next.length }
  }

  if (list.length >= FAVORITES_LIMIT) {
    return { status: 'limit_reached', limit: FAVORITES_LIMIT, count: list.length }
  }

  const next = [value, ...list]
  save(STORE.favorites, next)
  return { status: 'added', count: next.length }
}

function isFavorite(id) {
  return loadFavoriteIds().includes(id)
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

function loadFavoriteIds() {
  return loadList(STORE.favorites)
}

function syncStoredFavorites(channels) {
  const validIds = new Set((Array.isArray(channels) ? channels : []).map((item) => String(item?.id || '').trim()).filter(Boolean))
  const current = loadFavoriteIds()
  const next = current.filter((id) => validIds.has(id)).slice(0, FAVORITES_LIMIT)
  if (next.length !== current.length) save(STORE.favorites, next)
  return {
    ids: next,
    removedCount: current.length - next.length
  }
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

function loadSubtitleEnabled() {
  const saved = load(STORE.subtitleEnabled, false)
  return saved === true
}

function canUseSubtitle(channel = getCurrentChannel()) {
  return state.playbackMode === 'video' && !!channel && channel.kind === 'hls' && state.subtitleAvailable
}

function toggleSubtitle() {
  if (!canUseSubtitle()) {
    const channel = getCurrentChannel()
    if (state.playbackMode !== 'video') {
      setInfo('字幕切换仅在“看电视”模式下可用')
    } else if (!channel) {
      setInfo('请先选择一个频道')
    } else {
      setInfo('当前频道没有可用字幕')
    }
    return
  }
  state.subtitleEnabled = !state.subtitleEnabled
  save(STORE.subtitleEnabled, state.subtitleEnabled)
  applySubtitleMode()
  updateSubtitleButtons()
  setInfo(`字幕已${state.subtitleEnabled ? '开启' : '关闭'}`)
}

function applySubtitleMode() {
  const textTracks = ui.playerVideo.textTracks
  if (!textTracks || !textTracks.length) return
  const mode = state.subtitleEnabled ? 'showing' : 'hidden'
  for (let i = 0; i < textTracks.length; i++) {
    const track = textTracks[i]
    if (track.kind === 'subtitles' || track.kind === 'captions') {
      track.mode = mode
    }
  }
  if (state.hls && typeof state.hls.subtitleTrack === 'number') {
    if (state.subtitleEnabled) {
      const subtitleTracks = state.hls.subtitleTracks || []
      if (subtitleTracks.length && state.hls.subtitleTrack === -1) {
        state.hls.subtitleTrack = 0
      }
    } else {
      state.hls.subtitleTrack = -1
    }
  }
}

function checkSubtitleAvailability() {
  const channel = getCurrentChannel()
  if (!channel || state.playbackMode !== 'video' || channel.kind !== 'hls') {
    state.subtitleAvailable = false
    updateSubtitleButtons()
    return
  }
  let available = false
  const textTracks = ui.playerVideo.textTracks
  if (textTracks && textTracks.length) {
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i]
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        available = true
        break
      }
    }
  }
  if (!available && state.hls && state.hls.subtitleTracks && state.hls.subtitleTracks.length) {
    available = true
  }
  state.subtitleAvailable = available
  updateSubtitleButtons()
}

function updateSubtitleButtons() {
  const enabled = canUseSubtitle()
  const label = state.subtitleEnabled ? '字幕：开启' : '字幕：关闭'
  const floatingLabel = state.subtitleEnabled ? '字幕开' : '字幕关'
  ui.subtitleBtn.disabled = !enabled
  ui.subtitleBtn.textContent = state.subtitleAvailable ? label : '字幕：无'
  ui.floatingSubtitleBtn.disabled = !enabled
  ui.floatingSubtitleBtn.textContent = state.subtitleAvailable ? floatingLabel : '无字幕'
}

function loadRawUnified() {
  return load(UNIFIED_FAV_STORE_KEY, [])
}

function saveUnifiedTV(list) {
  const clean = Array.isArray(list) ? list.slice(0, UNIFIED_FAV_LIMIT) : []
  save(UNIFIED_FAV_STORE_KEY, clean)
}

function toggleUnifiedFavoriteForChannel(channel) {
  if (!channel || !channel.id) return null
  const refId = String(channel.id).trim()
  const id = `tv:${refId}`
  const current = loadRawUnified() || []
  const idx = current.findIndex(x => String(x.id) === String(id))
  const name = String(channel.title || '').trim() || '该频道'
  if (idx >= 0) {
    current.splice(idx, 1)
    saveUnifiedTV(current)
    setInfo(`已从统一收藏中移除「${name}」`)
    return { added: false, id }
  }
  if (current.length >= UNIFIED_FAV_LIMIT) {
    setInfo(`已达到统一收藏上限 ${UNIFIED_FAV_LIMIT} 条，请先移除部分再添加`)
    return null
  }
  const country = String(channel.country || '').trim()
  const lang = String(channel.language || '').trim()
  const cat = String(channel.category || '').trim()
  const metaSub = [country, lang, cat].filter(Boolean).join(' · ')
  current.push({
    id,
    type: 'tv',
    refId,
    order: current.length,
    addedAt: Date.now(),
    meta: {
      title: name,
      subtitle: metaSub,
      country,
      language: lang,
      category: cat
    }
  })
  saveUnifiedTV(current)
  setInfo(`已加入统一收藏：${name}`)
  return { added: true, id }
}

function getFavoritePosition(id) {
  if (!id) return null
  const key = String(id).trim()
  if (!key) return null
  const favs = loadFavoriteIds()
  const idx = favs.findIndex(x => String(x).trim() === key)
  if (idx < 0) return null
  return { index: idx, total: favs.length }
}

function writeFavoriteIdListTV(ids) {
  const cleaned = Array.isArray(ids) ? ids.slice(0, FAVORITES_LIMIT) : []
  save(STORE.favorites, cleaned)
}

function moveFavoriteToTop(id) {
  if (!id) return null
  const key = String(id).trim()
  const favs = loadFavoriteIds()
  const idx = favs.findIndex(x => String(x).trim() === key)
  if (idx <= 0) return null
  const [it] = favs.splice(idx, 1)
  favs.unshift(it)
  writeFavoriteIdListTV(favs)
  return { position: 1 }
}

function moveFavoriteUp(id) {
  if (!id) return null
  const key = String(id).trim()
  const favs = loadFavoriteIds()
  const idx = favs.findIndex(x => String(x).trim() === key)
  if (idx <= 0) return null
  ;[favs[idx - 1], favs[idx]] = [favs[idx], favs[idx - 1]]
  writeFavoriteIdListTV(favs)
  return { position: idx }
}

function moveFavoriteDown(id) {
  if (!id) return null
  const key = String(id).trim()
  const favs = loadFavoriteIds()
  const idx = favs.findIndex(x => String(x).trim() === key)
  if (idx < 0 || idx >= favs.length - 1) return null
  ;[favs[idx], favs[idx + 1]] = [favs[idx + 1], favs[idx]]
  writeFavoriteIdListTV(favs)
  return { position: idx + 2 }
}

function moveFavoriteToBottom(id) {
  if (!id) return null
  const key = String(id).trim()
  const favs = loadFavoriteIds()
  const idx = favs.findIndex(x => String(x).trim() === key)
  if (idx < 0 || idx >= favs.length - 1) return null
  const [it] = favs.splice(idx, 1)
  favs.push(it)
  writeFavoriteIdListTV(favs)
  return { position: favs.length }
}

function findChannelById(id) {
  if (!id) return null
  const key = String(id).trim()
  if (!key) return null
  const list = (state.channels && Array.isArray(state.channels)) ? state.channels : []
  return list.find(x => String(x.id || '').trim() === key) || null
}
