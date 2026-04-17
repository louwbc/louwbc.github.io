const $ = (sel) => document.querySelector(sel)

const POSTS_INDEX = '/blog/posts/index.json'
const PAGE_SIZE = 10

init()

async function init() {
  const path = location.pathname.replace(/\/+$/, '')
  if (path === '/blog/write.html' || path === '/blog/write') {
    renderWriter()
    return
  }
  if (path === '/blog/post.html' || path === '/blog/post') {
    await renderPost()
    return
  }
  if (path === '/blog' || path.startsWith('/blog/')) {
    await renderList()
  }
}

async function renderList() {
  const qEl = $('#q')
  const tagEl = $('#tag')
  const listEl = $('#list')
  const emptyEl = $('#empty')
  const pagerEl = $('#pager')
  const countPill = $('#countPill')
  if (!qEl || !tagEl || !listEl || !emptyEl || !pagerEl || !countPill) return

  const all = await loadPostsIndex()
  const tags = collectTags(all)
  for (const t of tags) {
    const opt = document.createElement('option')
    opt.value = t
    opt.textContent = t
    tagEl.appendChild(opt)
  }

  const params = new URLSearchParams(location.search)
  qEl.value = params.get('q') || ''
  tagEl.value = params.get('tag') || ''
  let page = parseInt(params.get('page') || '1', 10)
  if (!Number.isFinite(page) || page < 1) page = 1

  const rerender = () => {
    const q = qEl.value.trim()
    const tag = tagEl.value
    const filtered = filterPosts(all, q, tag)
    countPill.textContent = String(filtered.length)
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    if (page > totalPages) page = totalPages

    const start = (page - 1) * PAGE_SIZE
    const items = filtered.slice(start, start + PAGE_SIZE)

    listEl.innerHTML = ''
    if (!items.length) {
      emptyEl.hidden = false
      pagerEl.hidden = true
      return
    }
    emptyEl.hidden = true
    for (const p of items) {
      listEl.appendChild(renderPostCard(p))
    }
    renderPager(pagerEl, { page, totalPages, q, tag })
  }

  const syncURL = () => {
    const q = qEl.value.trim()
    const tag = tagEl.value
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (tag) next.set('tag', tag)
    next.set('page', String(page))
    const url = `${location.pathname}?${next.toString()}`
    history.replaceState({}, '', url)
  }

  qEl.addEventListener('input', () => {
    page = 1
    syncURL()
    rerender()
  })
  tagEl.addEventListener('change', () => {
    page = 1
    syncURL()
    rerender()
  })
  pagerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]')
    if (!btn) return
    page = parseInt(btn.dataset.page, 10)
    syncURL()
    rerender()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  rerender()
}

async function renderPost() {
  const params = new URLSearchParams(location.search)
  const slug = params.get('slug')
  const metaEl = $('#meta')
  const titleEl = $('#title')
  const bodyEl = $('#body')
  if (!metaEl || !titleEl || !bodyEl) return
  if (!slug) {
    titleEl.textContent = '缺少文章参数'
    bodyEl.innerHTML = '<p>请从博客列表打开文章。</p>'
    return
  }
  const all = await loadPostsIndex()
  const post = all.find(p => p.slug === slug)
  if (!post) {
    titleEl.textContent = '文章不存在'
    bodyEl.innerHTML = '<p>该文章可能已删除或链接错误。</p>'
    return
  }
  document.title = `${post.title} - 博客`
  titleEl.textContent = post.title
  metaEl.textContent = [post.date, (post.tags || []).join(' · ')].filter(Boolean).join(' · ')
  const html = await fetchText(`/blog/posts/${encodeURIComponent(post.slug)}.html`)
  bodyEl.innerHTML = html
}

function renderPostCard(p) {
  const a = document.createElement('a')
  a.className = 'card card-pad post-item'
  a.href = `/blog/post.html?slug=${encodeURIComponent(p.slug)}`
  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = p.title
  const meta = document.createElement('div')
  meta.className = 'muted'
  meta.style.marginTop = '6px'
  meta.textContent = [p.date, (p.tags || []).join(' · ')].filter(Boolean).join(' · ')
  const excerpt = document.createElement('p')
  excerpt.className = 'excerpt muted'
  excerpt.textContent = p.excerpt || ''
  a.append(title, meta, excerpt)
  return a
}

function renderPager(el, { page, totalPages, q, tag }) {
  el.innerHTML = ''
  if (totalPages <= 1) {
    el.hidden = true
    return
  }
  el.hidden = false
  const row = document.createElement('div')
  row.className = 'row'
  row.style.justifyContent = 'space-between'
  const prev = document.createElement('button')
  prev.className = 'btn primary'
  prev.textContent = '上一页'
  prev.disabled = page <= 1
  prev.dataset.page = String(page - 1)
  const next = document.createElement('button')
  next.className = 'btn primary'
  next.textContent = '下一页'
  next.disabled = page >= totalPages
  next.dataset.page = String(page + 1)
  const mid = document.createElement('div')
  mid.className = 'muted'
  mid.style.alignSelf = 'center'
  mid.textContent = `${page}/${totalPages}`
  row.append(prev, mid, next)
  el.appendChild(row)
}

function filterPosts(all, q, tag) {
  let items = all.slice()
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  if (q) {
    const needle = q.toLowerCase()
    items = items.filter(p => {
      const hay = [
        p.title || '',
        p.excerpt || '',
        ...(p.tags || [])
      ].join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }
  if (tag) {
    items = items.filter(p => (p.tags || []).includes(tag))
  }
  return items
}

function collectTags(all) {
  const set = new Set()
  for (const p of all) {
    for (const t of (p.tags || [])) set.add(t)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

async function loadPostsIndex() {
  const res = await fetch(POSTS_INDEX, { cache: 'no-store' })
  if (!res.ok) throw new Error('posts index failed')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return '<p>正文加载失败。</p>'
  return res.text()
}

function renderWriter() {
  const titleEl = $('#w-title')
  const slugEl = $('#w-slug')
  const dateEl = $('#w-date')
  const tagsEl = $('#w-tags')
  const excerptEl = $('#w-excerpt')
  const bodyEl = $('#w-body')
  const outEl = $('#w-out')
  const previewEl = $('#w-preview')
  const metaEl = $('#w-meta')
  const copyJsonBtn = $('#w-copy-json')
  const copyHtmlBtn = $('#w-copy-html')
  const downloadBtn = $('#w-download')
  if (!titleEl || !slugEl || !dateEl || !tagsEl || !excerptEl || !bodyEl || !outEl || !previewEl || !metaEl || !copyJsonBtn || !copyHtmlBtn || !downloadBtn) return

  const today = new Date().toISOString().slice(0, 10)
  dateEl.value = today

  const draft = loadDraft()
  if (draft) {
    titleEl.value = draft.title || ''
    slugEl.value = draft.slug || ''
    dateEl.value = draft.date || today
    tagsEl.value = draft.tags || ''
    excerptEl.value = draft.excerpt || ''
    bodyEl.value = draft.body || ''
  }

  const update = () => {
    const model = formModel()
    if (!slugEl.dataset.touched && model.title) {
      model.slug = toSlug(model.title)
      slugEl.value = model.slug
    }
    const html = markdownToHtml(model.body)
    const tags = splitTags(model.tags)
    const item = {
      slug: model.slug || toSlug(model.title || 'new-post'),
      title: model.title || '未命名文章',
      date: model.date || today,
      tags,
      excerpt: model.excerpt || ''
    }
    outEl.textContent = `1) 保存正文文件\n路径: /blog/posts/${item.slug}.html\n\n2) 在 /blog/posts/index.json 追加条目\n${JSON.stringify(item, null, 2)}`
    metaEl.textContent = [item.date, tags.join(' · ')].filter(Boolean).join(' · ')
    previewEl.innerHTML = html || '<p class="muted">这里会显示文章预览</p>'
    saveDraft(model)
  }

  const formModel = () => ({
    title: titleEl.value.trim(),
    slug: slugEl.value.trim(),
    date: dateEl.value,
    tags: tagsEl.value.trim(),
    excerpt: excerptEl.value.trim(),
    body: bodyEl.value
  })

  for (const el of [titleEl, slugEl, dateEl, tagsEl, excerptEl, bodyEl]) {
    el.addEventListener('input', update)
  }
  slugEl.addEventListener('input', () => { slugEl.dataset.touched = '1' })

  copyJsonBtn.addEventListener('click', async () => {
    const m = formModel()
    const item = {
      slug: m.slug || toSlug(m.title || 'new-post'),
      title: m.title || '未命名文章',
      date: m.date || today,
      tags: splitTags(m.tags),
      excerpt: m.excerpt || ''
    }
    await copyText(JSON.stringify(item, null, 2))
    copyJsonBtn.textContent = '已复制'
    setTimeout(() => { copyJsonBtn.textContent = '复制索引条目' }, 1200)
  })

  copyHtmlBtn.addEventListener('click', async () => {
    const m = formModel()
    const html = markdownToHtml(m.body)
    await copyText(html)
    copyHtmlBtn.textContent = '已复制'
    setTimeout(() => { copyHtmlBtn.textContent = '复制正文HTML' }, 1200)
  })

  downloadBtn.addEventListener('click', () => {
    const m = formModel()
    const slug = m.slug || toSlug(m.title || 'new-post')
    const html = markdownToHtml(m.body)
    download(`${slug}.html`, html)
  })

  update()
}

function splitTags(s) {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

function toSlug(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'new-post'
}

function markdownToHtml(md) {
  const text = String(md || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const out = []
  let inList = false
  for (let line of lines) {
    if (/^\s*###\s+/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h3>${inlineMd(line.replace(/^\s*###\s+/, ''))}</h3>`)
      continue
    }
    if (/^\s*##\s+/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2>${inlineMd(line.replace(/^\s*##\s+/, ''))}</h2>`)
      continue
    }
    if (/^\s*#\s+/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h1>${inlineMd(line.replace(/^\s*#\s+/, ''))}</h1>`)
      continue
    }
    if (/^\s*-\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inlineMd(line.replace(/^\s*-\s+/, ''))}</li>`)
      continue
    }
    if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false }
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p>${inlineMd(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

function inlineMd(s) {
  let t = escapeHtml(String(s || ''))
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return t
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function saveDraft(model) {
  localStorage.setItem('blog-draft', JSON.stringify(model))
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem('blog-draft'))
  } catch (_) {
    return null
  }
}
