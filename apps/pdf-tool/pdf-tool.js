const $ = (s) => document.querySelector(s)

const ui = {
  file: $('#pdfFile'),
  sampleBtn: $('#sampleBtn'),
  info: $('#info'),
  pageList: $('#pageList'),
  selectAllBtn: $('#selectAllBtn'),
  clearSelBtn: $('#clearSelBtn'),
  deleteBtn: $('#deleteBtn'),
  rotateBtn: $('#rotateBtn'),
  wmText: $('#wmText'),
  wmSize: $('#wmSize'),
  wmOpacity: $('#wmOpacity'),
  wmBtn: $('#wmBtn'),
  exportPdfBtn: $('#exportPdfBtn'),
  jpgScale: $('#jpgScale'),
  jpgQuality: $('#jpgQuality'),
  exportJpgSelectedBtn: $('#exportJpgSelectedBtn'),
  exportJpgAllBtn: $('#exportJpgAllBtn'),
  prevPageBtn: $('#prevPageBtn'),
  nextPageBtn: $('#nextPageBtn'),
  pageMeta: $('#pageMeta'),
  canvas: $('#previewCanvas')
}

const state = {
  bytes: null,
  name: 'document.pdf',
  pdfLibDoc: null,
  pdfJsDoc: null,
  pageCount: 0,
  currentPage: 1,
  working: false
}

init()

function init() {
  bind()
  syncButtons()
}

function bind() {
  ui.file.addEventListener('change', async () => {
    const f = ui.file.files?.[0]
    ui.file.value = ''
    if (!f) return
    const bytes = new Uint8Array(await f.arrayBuffer())
    await loadPdf(bytes, f.name || 'document.pdf')
  })

  ui.sampleBtn.addEventListener('click', async () => {
    const bytes = await makeSamplePdf()
    await loadPdf(bytes, 'sample.pdf')
  })

  ui.selectAllBtn.addEventListener('click', () => {
    for (const cb of ui.pageList.querySelectorAll('input[type="checkbox"][data-page]')) cb.checked = true
  })
  ui.clearSelBtn.addEventListener('click', () => {
    for (const cb of ui.pageList.querySelectorAll('input[type="checkbox"][data-page]')) cb.checked = false
  })

  ui.prevPageBtn.addEventListener('click', () => setCurrentPage(state.currentPage - 1))
  ui.nextPageBtn.addEventListener('click', () => setCurrentPage(state.currentPage + 1))

  ui.deleteBtn.addEventListener('click', async () => {
    if (!state.pdfLibDoc) return
    const pages = selectedPages()
    if (!pages.length) return setInfo('请先选中要删除的页')
    if (!confirm(`删除选中的 ${pages.length} 页？`)) return
    await withWorking(async () => {
      const sorted = pages.slice().sort((a, b) => b - a)
      for (const p of sorted) state.pdfLibDoc.removePage(p - 1)
      await reloadFromLib('已删除页面')
    })
  })

  ui.rotateBtn.addEventListener('click', async () => {
    if (!state.pdfLibDoc) return
    const pages = selectedPages()
    if (!pages.length) return setInfo('请先选中要旋转的页')
    await withWorking(async () => {
      for (const p of pages) {
        const page = state.pdfLibDoc.getPage(p - 1)
        const angle = Number(page.getRotation()?.angle || 0)
        page.setRotation(PDFLib.degrees((angle + 90) % 360))
      }
      await reloadFromLib('已旋转页面')
    })
  })

  ui.wmBtn.addEventListener('click', async () => {
    if (!state.pdfLibDoc) return
    const text = String(ui.wmText.value || '').trim()
    if (!text) return setInfo('请输入水印文字')
    const size = clampNumber(ui.wmSize.value, 8, 80, 18)
    const opacity = clampNumber(ui.wmOpacity.value, 0.05, 1, 0.25)
    const pages = selectedPages()
    await withWorking(async () => {
      const pngBytes = await makeTextPngBytes(text, size, opacity)
      const image = await state.pdfLibDoc.embedPng(pngBytes)
      const scaled = image.scale(1)
      const targets = pages.length ? pages : range(1, state.pdfLibDoc.getPageCount())
      for (const p of targets) {
        const page = state.pdfLibDoc.getPage(p - 1)
        const { width, height } = page.getSize()
        const w = Math.min(scaled.width, Math.max(80, width - 48))
        const ratio = scaled.width ? (w / scaled.width) : 1
        const h = Math.max(12, Math.round(scaled.height * ratio))
        page.drawImage(image, { x: 24, y: Math.max(18, height - h - 24), width: w, height: h })
        page.drawImage(image, { x: 24, y: 18, width: w, height: h })
        page.drawImage(image, { x: Math.max(24, Math.floor(width * 0.45)), y: Math.max(18, Math.floor(height * 0.5)), width: w, height: h })
      }
      await reloadFromLib(pages.length ? '已给选中页添加水印' : '已给全部页添加水印')
    })
  })

  ui.exportPdfBtn.addEventListener('click', async () => {
    if (!state.pdfLibDoc) return
    await withWorking(async () => {
      const bytes = await state.pdfLibDoc.save()
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), safeFileName(state.name.replace(/\.pdf$/i, '') + '-edited.pdf'))
      setInfo('已导出 PDF')
    })
  })

  ui.exportJpgSelectedBtn.addEventListener('click', async () => {
    if (!state.pdfJsDoc) return
    const pages = selectedPages()
    if (!pages.length) return setInfo('请先选中要导出的页')
    await exportPagesToZipJpg(pages, safeFileName(state.name.replace(/\.pdf$/i, '') + '-pages.zip'))
  })

  ui.exportJpgAllBtn.addEventListener('click', async () => {
    if (!state.pdfJsDoc) return
    await exportPagesToZipJpg(range(1, state.pageCount), safeFileName(state.name.replace(/\.pdf$/i, '') + '-all-pages.zip'))
  })
}

async function loadPdf(bytes, name) {
  await withWorking(async () => {
    state.bytes = bytes
    state.name = name || 'document.pdf'
    state.pdfLibDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false })
    state.pageCount = state.pdfLibDoc.getPageCount()
    state.currentPage = 1
    await loadPdfJs(bytes)
    renderPageList()
    await renderCurrentPage()
    setInfo(`已加载：${state.pageCount} 页`)
  })
}

async function loadPdfJs(bytes) {
  if (!window.pdfjsLib) throw new Error('pdfjs')
  const task = window.pdfjsLib.getDocument({ data: bytes })
  state.pdfJsDoc = await task.promise
}

function renderPageList() {
  ui.pageList.innerHTML = ''
  if (!state.pageCount) return
  const frag = document.createDocumentFragment()
  for (let i = 1; i <= state.pageCount; i++) {
    frag.appendChild(renderPageRow(i))
  }
  ui.pageList.appendChild(frag)
}

function renderPageRow(pageNum) {
  const row = document.createElement('div')
  row.className = 'page-row'

  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.dataset.page = String(pageNum)

  const num = document.createElement('div')
  num.className = 'num'
  num.textContent = `第 ${pageNum} 页`

  const open = document.createElement('button')
  open.className = 'btn'
  open.textContent = '预览'
  open.addEventListener('click', () => setCurrentPage(pageNum))

  const up = document.createElement('button')
  up.className = 'btn icon-btn'
  up.textContent = '↑'
  up.disabled = pageNum <= 1
  up.addEventListener('click', async () => {
    await movePage(pageNum, -1)
  })

  const down = document.createElement('button')
  down.className = 'btn icon-btn'
  down.textContent = '↓'
  down.disabled = pageNum >= state.pageCount
  down.addEventListener('click', async () => {
    await movePage(pageNum, 1)
  })

  const rot = document.createElement('button')
  rot.className = 'btn icon-btn'
  rot.textContent = '⟳'
  rot.addEventListener('click', async () => {
    await withWorking(async () => {
      const page = state.pdfLibDoc.getPage(pageNum - 1)
      const angle = Number(page.getRotation()?.angle || 0)
      page.setRotation(PDFLib.degrees((angle + 90) % 360))
      await reloadFromLib('已旋转页面')
      setCurrentPage(Math.min(pageNum, state.pageCount))
    })
  })

  const del = document.createElement('button')
  del.className = 'btn icon-btn'
  del.textContent = '✕'
  del.addEventListener('click', async () => {
    if (!confirm(`删除第 ${pageNum} 页？`)) return
    await withWorking(async () => {
      state.pdfLibDoc.removePage(pageNum - 1)
      await reloadFromLib('已删除页面')
      setCurrentPage(Math.min(pageNum, state.pageCount))
    })
  })

  row.append(cb, num, open, up, down, rot, del)
  return row
}

function selectedPages() {
  const out = []
  for (const cb of ui.pageList.querySelectorAll('input[type="checkbox"][data-page]')) {
    if (!cb.checked) continue
    const n = Number(cb.dataset.page)
    if (Number.isFinite(n) && n >= 1) out.push(n)
  }
  out.sort((a, b) => a - b)
  return out
}

function setCurrentPage(n) {
  if (!state.pageCount) return
  const next = clampInt(n, 1, state.pageCount)
  state.currentPage = next
  renderCurrentPage()
}

async function renderCurrentPage() {
  if (!state.pdfJsDoc) return
  const page = await state.pdfJsDoc.getPage(state.currentPage)
  const base = page.getViewport({ scale: 1 })
  const maxW = Math.max(320, Math.min(1100, ui.canvas.parentElement.clientWidth - 24))
  const scale = Math.max(0.8, Math.min(2.5, maxW / base.width))
  const viewport = page.getViewport({ scale })
  const ctx = ui.canvas.getContext('2d', { alpha: false })
  ui.canvas.width = Math.floor(viewport.width)
  ui.canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  ui.pageMeta.textContent = `第 ${state.currentPage} / ${state.pageCount} 页`
}

async function movePage(pageNum, dir) {
  if (!state.pdfLibDoc) return
  if (dir !== -1 && dir !== 1) return
  await withWorking(async () => {
    const from = pageNum - 1
    const total = state.pdfLibDoc.getPageCount()
    if (dir === -1 && from <= 0) return
    if (dir === 1 && from >= total - 1) return

    const [copied] = await state.pdfLibDoc.copyPages(state.pdfLibDoc, [from])
    if (dir === -1) {
      state.pdfLibDoc.insertPage(from - 1, copied)
      state.pdfLibDoc.removePage(from + 1)
    } else {
      state.pdfLibDoc.insertPage(from + 2, copied)
      state.pdfLibDoc.removePage(from)
    }
    await reloadFromLib('已移动页面')
    setCurrentPage(clampInt(pageNum + dir, 1, state.pageCount))
  })
}

async function reloadFromLib(info) {
  const bytes = await state.pdfLibDoc.save()
  state.bytes = bytes
  state.pageCount = state.pdfLibDoc.getPageCount()
  await loadPdfJs(bytes)
  renderPageList()
  await renderCurrentPage()
  if (info) setInfo(info)
}

async function exportPagesToZipJpg(pages, zipName) {
  if (!state.pdfJsDoc) return
  const scale = clampNumber(ui.jpgScale.value, 0.5, 5, 1.5)
  const quality = clampNumber(ui.jpgQuality.value, 0.5, 1, 0.8)
  const sorted = pages.slice().filter(x => x >= 1 && x <= state.pageCount).sort((a, b) => a - b)
  if (!sorted.length) return setInfo('没有可导出的页')
  await withWorking(async () => {
    const zip = new JSZip()
    for (const p of sorted) {
      setInfo(`导出中…（${p}/${sorted[sorted.length - 1]}）`)
      const blob = await renderPageToJpgBlob(p, scale, quality)
      const buf = await blob.arrayBuffer()
      zip.file(`page-${String(p).padStart(3, '0')}.jpg`, buf)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    downloadBlob(out, zipName || 'pages.zip')
    setInfo('已导出 JPG（ZIP）')
  })
}

async function renderPageToJpgBlob(pageNum, scale, quality) {
  const page = await state.pdfJsDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  canvas.width = 0
  canvas.height = 0
  return blob
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error('blob'))
      else resolve(b)
    }, type, quality)
  })
}

function setInfo(text) {
  ui.info.textContent = String(text || '')
}

async function withWorking(fn) {
  if (state.working) return
  state.working = true
  syncButtons()
  try {
    await fn()
  } catch (err) {
    const msg = String(err?.message || '').trim()
    setInfo(msg ? `操作失败：${msg}` : '操作失败：请换个 PDF 或稍后重试')
  } finally {
    state.working = false
    syncButtons()
  }
}

function syncButtons() {
  const has = !!state.pdfLibDoc && !!state.pdfJsDoc
  const disabled = state.working
  const ids = [
    'selectAllBtn', 'clearSelBtn', 'deleteBtn', 'rotateBtn', 'wmBtn', 'exportPdfBtn',
    'exportJpgSelectedBtn', 'exportJpgAllBtn', 'prevPageBtn', 'nextPageBtn', 'jpgScale', 'jpgQuality'
  ]
  for (const id of ids) {
    const el = ui[id]
    if (!el) continue
    el.disabled = !has || disabled
  }
  ui.sampleBtn.disabled = disabled
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 8000)
}

function safeFileName(name) {
  const v = String(name || 'download').trim() || 'download'
  return v.replace(/[\\/:*?"<>|]+/g, '-')
}

function clampInt(v, min, max) {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function range(from, toInclusive) {
  const out = []
  for (let i = from; i <= toInclusive; i++) out.push(i)
  return out
}

async function makeSamplePdf() {
  const doc = await PDFLib.PDFDocument.create()
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica)
  for (let i = 1; i <= 4; i++) {
    const page = doc.addPage([595.28, 841.89])
    page.drawText('Sample PDF', { x: 48, y: 780, size: 26, font, color: PDFLib.rgb(0.1, 0.1, 0.1) })
    page.drawText(`Page ${i}`, { x: 48, y: 740, size: 18, font, color: PDFLib.rgb(0.2, 0.2, 0.2) })
    page.drawRectangle({ x: 48, y: 120, width: 500, height: 560, borderWidth: 2, borderColor: PDFLib.rgb(0.7, 0.7, 0.75) })
    page.drawText('You can: delete / rotate / move pages, add watermark, export JPG.', { x: 60, y: 640, size: 14, font, color: PDFLib.rgb(0.2, 0.2, 0.2) })
  }
  return new Uint8Array(await doc.save())
}

async function makeTextPngBytes(text, size, opacity) {
  const s = String(text || '').trim()
  const px = clampInt(size, 8, 120)
  const a = clampNumber(opacity, 0.05, 1, 0.25)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `${px}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
  const metrics = ctx.measureText(s)
  const w = Math.max(80, Math.ceil(metrics.width) + 24)
  const h = Math.max(24, Math.ceil(px * 1.4) + 16)
  canvas.width = w
  canvas.height = h
  const ctx2 = canvas.getContext('2d')
  ctx2.clearRect(0, 0, w, h)
  ctx2.font = ctx.font
  ctx2.textBaseline = 'middle'
  ctx2.fillStyle = `rgba(0,0,0,${a})`
  ctx2.fillText(s, 12, Math.floor(h / 2))
  const dataUrl = canvas.toDataURL('image/png')
  canvas.width = 0
  canvas.height = 0
  return dataUrlToBytes(dataUrl)
}

async function dataUrlToBytes(dataUrl) {
  const res = await fetch(String(dataUrl))
  return new Uint8Array(await res.arrayBuffer())
}
