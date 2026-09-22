const $ = (s) => document.querySelector(s)

const STORE_KEY = 'solo-radio:unified-favorites'
const LIMIT = 600

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
  empty: $('#empty')
}

const state = {
  items: [],
  filter: { type: 'all', keyword: '' }
}

init()

function init() {
  loadItems()
  setupControls()
  refreshTabs()
  refreshList()
  setInfo(`已载入 ${state.items.length} 条统一收藏`)
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
  row.setAttribute('aria-label', `${typeLabel} · ${item.meta.title}，点击打开`)

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
  const openBtn = document.createElement('a')
  openBtn.className = 'btn primary'
  openBtn.type = 'button'
  openBtn.textContent = '打开'
  openBtn.href = buildOpenUrl(item)
  openBtn.target = '_blank'
  openBtn.rel = 'noopener,noreferrer'
  const removeBtn = document.createElement('button')
  removeBtn.className = 'btn'
  removeBtn.type = 'button'
  removeBtn.textContent = '移除'
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeFromUnified(item.id)
  })
  topRow.append(openBtn, removeBtn)

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
  row.addEventListener('click', () => window.open(buildOpenUrl(item), '_blank', 'noopener,noreferrer'))
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    window.open(buildOpenUrl(item), '_blank', 'noopener,noreferrer')
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

function setInfo(text) {
  ui.info.textContent = text
}
