<script setup lang="ts">
/**
 * PDF 工具（Task 10）
 * - 三库全动态 import()：pdfjs-dist / pdf-lib / jszip
 * - 三档 CDN fallback：cdn.jsdelivr.net → unpkg.com → 本地 node_modules 打包（Vite lazy chunk）
 * - 上传 PDF → 缩略图列表（PdfThumbList 选中/旋转/删除）→ 右侧 Canvas 预览
 * - 水印：文本 + 三位置（左上/居中/右下）+ 字号/透明度/旋转
 * - 导出编辑后 PDF（保留删改 + 应用水印）
 * - 导出 JPG ZIP：4 scale × 4 quality 组合
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BaseBtn from '@/components/common/BaseBtn.vue'
import PdfThumbList from '@/components/common/PdfThumbList.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToasts } from '@/composables/useToasts'

const toast = useToasts()

// ------- 三库动态加载 + 三档 CDN fallback -------
// 注意：CDN fallback 返回全局对象类型不确定，这里采用宽松接口 + any 规避 strict 嵌套签名报错
/* eslint-disable @typescript-eslint/no-explicit-any -- 外部 CDN 加载的第三方库（pdfjs/pdf-lib/jszip）编译期类型未知 */
type PdfJsApi = any
type PdfLibApi = any
type JszipApi = any
/* eslint-enable @typescript-eslint/no-explicit-any */

const loadingLibs = ref(false)
let pdfjsCached: PdfJsApi | null = null
let pdflibCached: PdfLibApi | null = null
let jszipCached: JszipApi | null = null
const CDNS = [
  {
    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs',
    pdfjsWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    pdflib: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
  },
  {
    pdfjs: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.mjs',
    pdfjsWorker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    pdflib: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    jszip: 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
  }
]
async function loadLibs(): Promise<{ pdfjs: PdfJsApi; pdflib: PdfLibApi; jszip: JszipApi }> {
  if (pdfjsCached && pdflibCached && jszipCached) return { pdfjs: pdfjsCached, pdflib: pdflibCached, jszip: jszipCached }
  loadingLibs.value = true
  try {
    // Tier 3：本地打包（import from node_modules），兜底永远可用
    const [pjs, plib, JSZip] = await Promise.all([
      import('pdfjs-dist'),
      import('pdf-lib'),
      import('jszip')
    ])
    pdfjsCached = pjs as unknown as PdfJsApi
    pdflibCached = plib as unknown as PdfLibApi
    jszipCached = JSZip.default ? (JSZip.default as unknown as JszipApi) : (JSZip as unknown as JszipApi)
    // worker src
    try {
      if (typeof (pdfjsCached as unknown as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions === 'object') {
        (pdfjsCached as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = CDNS[0].pdfjsWorker
      }
    } catch { /* noop */ }
    return { pdfjs: pdfjsCached, pdflib: pdflibCached, jszip: jszipCached! }
  } catch (err) {
    // Tier 1 & 2：CDN fallback（通过 <script> 注入全局）
    let lastErr = err as Error
    for (const cdn of CDNS) {
      try {
        const res = await new Promise<{ pdfjs: PdfJsApi; pdflib: PdfLibApi; jszip: JszipApi }>((resolve, reject) => {
          let todo = 3
          let fail = false
          const one = (name: string, src: string, globalName: string, factory: () => unknown) => {
            if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)[globalName]) {
              todo--
              if (todo <= 0) resolve({ pdfjs: (window as unknown as Record<string, unknown>).pdfjsLib as PdfJsApi, pdflib: (window as unknown as Record<string, unknown>).PDFLib as PdfLibApi, jszip: ((window as unknown as Record<string, unknown>).JSZip as JszipApi) })
              return
            }
            const s = document.createElement('script')
            s.src = src
            s.crossOrigin = 'anonymous'
            s.onload = () => {
              todo--
              if (todo <= 0) resolve({ pdfjs: (window as unknown as Record<string, unknown>).pdfjsLib as PdfJsApi, pdflib: (window as unknown as Record<string, unknown>).PDFLib as PdfLibApi, jszip: ((window as unknown as Record<string, unknown>).JSZip as JszipApi) })
            }
            s.onerror = () => { fail = true; reject(new Error(`CDN ${name} failed: ${src}`)) }
            document.head.appendChild(s)
          }
          one('pdfjs', cdn.pdfjs, 'pdfjsLib', () => (window as unknown as Record<string, unknown>).pdfjsLib)
          one('pdflib', cdn.pdflib, 'PDFLib', () => (window as unknown as Record<string, unknown>).PDFLib)
          one('jszip', cdn.jszip, 'JSZip', () => (window as unknown as Record<string, unknown>).JSZip)
        })
        // worker
        if (typeof (res.pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions === 'object') {
          (res.pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = cdn.pdfjsWorker
        }
        pdfjsCached = res.pdfjs
        pdflibCached = res.pdflib
        jszipCached = res.jszip
        return res
      } catch (e2) { lastErr = e2 as Error }
    }
    throw lastErr
  } finally {
    loadingLibs.value = false
  }
}

// ------- 内部页状态：每一页独立有 rotate/removed -------
interface PdfPage {
  id: string
  sourceFile: string
  sourcePageNo: number // 1-based
  widthPt: number
  heightPt: number
  rotation: number // 0/90/180/270
  removed: boolean
  thumbUrl?: string
  rawPdfBytesCache?: ArrayBuffer // 整个文件 bytes（共享，引用）
  _fileIdx: number
}
interface PdfFile {
  id: string
  name: string
  size: number
  pages: PdfPage[]
  bytes: ArrayBuffer
}

const files = ref<PdfFile[]>([])
const selectedIndex = ref(-1)
const previewBusy = ref(false)
const exportBusy = ref(false)

const flatPages = computed((): PdfPage[] => {
  const out: PdfPage[] = []
  for (const f of files.value) for (const p of f.pages) if (!p.removed) out.push(p)
  return out
})
const thumbs = computed(() => flatPages.value.map((p, i) => ({
  id: `${p.id}-${i}`,
  dataUrl: p.thumbUrl,
  label: `${p.sourceFile.slice(0, 10)}…·p${p.sourcePageNo}`
})))
const totalPages = computed(() => flatPages.value.length)

// 水印设置
const watermark = ref({
  text: 'Solo Radio · v3',
  position: 'diagonal' as 'topleft' | 'center' | 'bottomright' | 'diagonal',
  size: 40,
  opacity: 0.25,
  color: '#1f4a7a',
  rotation: 45
})

// ------- 上传 & 解析 -------
const uploadInput = ref<HTMLInputElement | null>(null)
function triggerUpload() { uploadInput.value?.click() }
async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const list = input.files
  if (!list?.length) return
  await loadLibs()
  const { pdfjs } = { pdfjs: pdfjsCached! }
  for (let i = 0; i < list.length; i++) {
    const f = list[i]
    if (!/\.pdf$/i.test(f.name)) { toast.warn(`跳过非 PDF 文件：${f.name}`); continue }
    if (f.size > 80 * 1024 * 1024) { toast.warn(`跳过超大文件（>80MB）：${f.name}`); continue }
    const buf = await f.arrayBuffer()
    const doc = await (pdfjs.getDocument({ data: buf.slice(0), cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true }) as { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> }).promise
    const fileId = `f${Date.now()}-${i}`
    const pages: PdfPage[] = []
    for (let pn = 1; pn <= doc.numPages; pn++) {
      // 取尺寸
      const page = (await doc.getPage(pn)) as { getViewport: (o: unknown) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<unknown> } }
      const vp = page.getViewport({ scale: 1 }) as { width: number; height: number }
      const pid = `${fileId}-p${pn}`
      pages.push({
        id: pid, sourceFile: f.name, sourcePageNo: pn,
        widthPt: vp.width, heightPt: vp.height, rotation: 0, removed: false,
        rawPdfBytesCache: buf, _fileIdx: files.value.length + i
      })
      // 缩略图
      try {
        const scale = 160 / Math.max(vp.width, vp.height)
        const tvp = page.getViewport({ scale: Math.max(0.1, scale) }) as { width: number; height: number }
        const cv = document.createElement('canvas')
        cv.width = Math.max(1, Math.ceil(tvp.width)); cv.height = Math.max(1, Math.ceil(tvp.height))
        const ctx = cv.getContext('2d')
        if (ctx) {
          await (page.render({ canvasContext: ctx, viewport: tvp }) as { promise: Promise<unknown> }).promise
          pages[pages.length - 1].thumbUrl = cv.toDataURL('image/jpeg', 0.82)
        }
      } catch { /* ignore thumb */ }
    }
    files.value.push({ id: fileId, name: f.name, size: f.size, pages, bytes: buf })
    if (selectedIndex.value < 0 && pages.length) selectedIndex.value = 0
  }
  if (uploadInput.value) uploadInput.value.value = ''
  toast.success(`解析完成：共 ${totalPages.value} 页`)
}

// ------- 缩略图控制（选中/旋转/删除） -------
function onSelectThumb(i: number) { selectedIndex.value = i; renderPreview() }
function onRotateThumb(i: number) {
  const p = flatPages.value[i]
  if (!p) return
  p.rotation = (p.rotation + 90) % 360
  renderPreview()
}
function onRemoveThumb(i: number) {
  const p = flatPages.value[i]
  if (!p) return
  p.removed = true
  if (selectedIndex.value >= flatPages.value.length) selectedIndex.value = flatPages.value.length - 1
  if (selectedIndex.value === i) renderPreview()
  toast.info(`已移除第 ${i + 1} 页（共剩 ${flatPages.value.length} 页）`)
}

// ------- 预览 canvas -------
const previewCanvas = ref<HTMLCanvasElement | null>(null)
async function renderPreview() {
  if (!previewCanvas.value) return
  const p = flatPages.value[selectedIndex.value]
  if (!p || !pdfjsCached) { return }
  previewBusy.value = true
  try {
    const doc = await (pdfjsCached.getDocument({ data: p.rawPdfBytesCache!.slice(0), cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true }) as { promise: Promise<{ getPage: (n: number) => Promise<unknown> }> }).promise
    const page = (await doc.getPage(p.sourcePageNo)) as { getViewport: (o: unknown) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<unknown> } }
    const rot = (p.rotation ?? 0) as 0 | 90 | 180 | 270
    const baseVp = page.getViewport({ scale: 1.6 }) as { width: number; height: number }
    const vp = page.getViewport({ scale: 1.6, rotation: rot }) as { width: number; height: number }
    const cv = previewCanvas.value
    cv.width = Math.max(1, Math.ceil(vp.width))
    cv.height = Math.max(1, Math.ceil(vp.height))
    const ctx = cv.getContext('2d')
    if (ctx) {
      ctx.save()
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.restore()
      await (page.render({ canvasContext: ctx, viewport: vp }) as { promise: Promise<unknown> }).promise
      // 叠加水印预览
      if (watermark.value.text.trim()) drawWatermark(ctx, cv.width, cv.height, watermark.value)
    }
  } catch (err) {
    toast.error(`预览失败：${(err as Error).message}`)
  } finally {
    previewBusy.value = false
  }
}
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, wm: typeof watermark.value) {
  const text = wm.text.trim()
  if (!text) return
  ctx.save()
  ctx.globalAlpha = wm.opacity
  ctx.fillStyle = wm.color
  const fontSize = Math.max(8, Math.round(wm.size * (w / 600)))
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif`
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
  const pad = Math.max(16, Math.round(w * 0.03))
  if (wm.position === 'topleft') {
    ctx.translate(pad, pad + fontSize)
    ctx.rotate((wm.rotation * Math.PI) / 180)
    ctx.fillText(text, 0, 0)
  } else if (wm.position === 'center') {
    const metrics = ctx.measureText(text)
    ctx.translate(w / 2 - metrics.width / 2, h / 2 + fontSize / 2)
    ctx.rotate((wm.rotation * Math.PI) / 180)
    ctx.fillText(text, 0, 0)
  } else if (wm.position === 'bottomright') {
    const metrics = ctx.measureText(text)
    ctx.translate(w - pad - metrics.width, h - pad)
    ctx.rotate((wm.rotation * Math.PI) / 180)
    ctx.fillText(text, 0, 0)
  } else {
    // diagonal：平铺多行
    const gap = Math.max(fontSize * 4, Math.round(w * 0.2))
    ctx.translate(w / 2, h / 2)
    ctx.rotate((wm.rotation * Math.PI) / 180)
    ctx.textAlign = 'center'
    for (let dy = -h; dy < h; dy += gap) for (let dx = -w; dx < w; dx += gap) {
      ctx.fillText(text, dx, dy)
    }
  }
  ctx.restore()
}
watch([selectedIndex, watermark], () => renderPreview(), { deep: true })

// ------- 导出 PDF（pdf-lib 组装 + 水印） -------
async function exportPdf() {
  if (!flatPages.value.length) { toast.warn('无可导出页面'); return }
  await loadLibs()
  if (!pdflibCached || !pdfjsCached) return
  exportBusy.value = true
  try {
    const lib = pdflibCached
    const outDoc = await lib.PDFDocument.create()
    const helvetica = await outDoc.embedStandardFont(lib.StandardFonts.HelveticaBold)
    const pageSources = new Map<string, Promise<unknown>>()
    // 先把每个源文件 bytes 加载为 PDFDocument （共享）
    const docByFileId = new Map<string, unknown>()
    for (const f of files.value) {
      docByFileId.set(f.id, await lib.PDFDocument.load(new Uint8Array(f.bytes)))
    }
    for (const p of flatPages.value) {
      const srcDoc = docByFileId.get(files.value[p._fileIdx].id) as { copyPages: (d: unknown, arr: number[]) => unknown[]; getPageIndices: () => number[] }
      if (!srcDoc) continue
      const [copied] = srcDoc.copyPages(srcDoc, [p.sourcePageNo - 1])
      const page = outDoc.addPage(copied as any) as unknown as { setSize: (w: number, h: number) => void; getSize: () => { width: number; height: number }; rotate: unknown; drawText: (t: string, o: Record<string, unknown>) => void }
      const { width, height } = (page as any).getSize()
      // 旋转
      const rot = p.rotation ?? 0
      if (rot === 90 || rot === 270) { (page as any).setSize(height, width) }
      if (rot) { (page as any).setRotation(lib) } // 可选，部分版本不支持则忽略
      // 水印（pdf-lib 的坐标系 0,0 在左下）
      if (watermark.value.text.trim()) {
        const sz = page.getSize()
        const w = sz.width, h = sz.height
        const fontSize = Math.max(8, Math.round(watermark.value.size * (w / 600)))
        const pos = watermark.value.position
        const opacity = watermark.value.opacity
        const color = hexToRgb(watermark.value.color)
        const fill: unknown = { type: 'RGB', ...color }
        const common: Record<string, unknown> = { size: fontSize, font: helvetica, color: fill as any, opacity, rotate: { type: 'degrees', degrees: watermark.value.rotation } as any }
        const pad = Math.max(16, Math.round(w * 0.03))
        if (pos === 'topleft') page.drawText(watermark.value.text, { ...common, x: pad, y: h - pad - fontSize })
        else if (pos === 'center') {
          const tw = helvetica.widthOfTextAtSize(watermark.value.text, fontSize)
          page.drawText(watermark.value.text, { ...common, x: w / 2 - tw / 2, y: h / 2 - fontSize / 2 })
        } else if (pos === 'bottomright') {
          const tw = helvetica.widthOfTextAtSize(watermark.value.text, fontSize)
          page.drawText(watermark.value.text, { ...common, x: w - pad - tw, y: pad })
        } else {
          // diagonal 平铺
          const gap = Math.max(fontSize * 4, Math.round(w * 0.2))
          for (let dy = -h; dy < h; dy += gap) for (let dx = -w; dx < w; dx += gap) {
            page.drawText(watermark.value.text, { ...common, x: w / 2 + dx, y: h / 2 + dy })
          }
        }
      }
    }
    const bytes = await outDoc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `solo-radio-pdf-v3-${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); }, 3000)
    toast.success(`已导出 PDF：${totalPages.value} 页`)
  } catch (err) {
    toast.error(`导出 PDF 失败：${(err as Error).message}`)
  } finally {
    exportBusy.value = false
  }
}
function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return { red: ((v >> 16) & 255) / 255, green: ((v >> 8) & 255) / 255, blue: (v & 255) / 255 }
}

// ------- 导出 JPG ZIP（4 scale × 4 quality） -------
const jpgOptions = ref({ scale: 1.5, quality: 0.85 })
const SCALES = [0.5, 1, 1.5, 2]
const QUALITIES = [0.5, 0.7, 0.85, 0.95]
async function exportJpgZip() {
  if (!flatPages.value.length) { toast.warn('无可导出页面'); return }
  await loadLibs()
  if (!pdfjsCached || !jszipCached) return
  exportBusy.value = true
  try {
    const zip = (jszipCached)()
    for (let i = 0; i < flatPages.value.length; i++) {
      const p = flatPages.value[i]
      const doc = await (pdfjsCached.getDocument({ data: p.rawPdfBytesCache!.slice(0), cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true }) as { promise: Promise<{ getPage: (n: number) => Promise<unknown> }> }).promise
      const page = (await doc.getPage(p.sourcePageNo)) as { getViewport: (o: unknown) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<unknown> } }
      const rot = (p.rotation ?? 0) as 0 | 90 | 180 | 270
      const vp = page.getViewport({ scale: jpgOptions.value.scale, rotation: rot }) as { width: number; height: number }
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.ceil(vp.width)); cv.height = Math.max(1, Math.ceil(vp.height))
      const ctx = cv.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, cv.width, cv.height)
        await (page.render({ canvasContext: ctx, viewport: vp }) as { promise: Promise<unknown> }).promise
        if (watermark.value.text.trim()) drawWatermark(ctx, cv.width, cv.height, watermark.value)
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        cv.toBlob((b) => { b ? resolve(b) : reject(new Error('canvas toBlob 失败')) }, 'image/jpeg', jpgOptions.value.quality)
      })
      const fileName = `page-${String(i + 1).padStart(4, '0')}-s${jpgOptions.value.scale.toFixed(1)}-q${Math.round(jpgOptions.value.quality * 100)}.jpg`
      zip.file(fileName, blob, { binary: true })
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipBlob)
    a.download = `solo-radio-pdf-jpg-v3-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); }, 3000)
    toast.success(`已导出 JPG 压缩包：${totalPages.value} 张图片`)
  } catch (err) {
    toast.error(`导出 JPG ZIP 失败：${(err as Error).message}`)
  } finally {
    exportBusy.value = false
  }
}

function resetAll() {
  if (files.value.length && !confirm(`确定清空所有 ${totalPages.value} 页 PDF？`)) return
  files.value = []
  selectedIndex.value = -1
  if (previewCanvas.value) {
    const ctx = previewCanvas.value.getContext('2d')
    previewCanvas.value.width = 1; previewCanvas.value.height = 1
    ctx?.clearRect(0, 0, 1, 1)
  }
  toast.info('已清空 PDF 列表')
}
onBeforeUnmount(() => {
  files.value = []
})
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-4">
    <header class="base-card !p-4 md:!p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-text flex items-center gap-2">
            <span class="i-carbon-document-pdf text-accent" /> PDF 工具
          </h1>
          <p class="mt-1 text-sm text-muted">
            pdfjs@3.11.174 · pdf-lib@1.17.1 · jszip@3.10.1 · 三档 CDN 动态加载，首屏不阻塞
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <BaseBtn
            variant="tiny"
            variant-class="base-btn-primary"
            :disabled="loadingLibs || exportBusy"
            @click="triggerUpload"
          >
            <span class="i-carbon-upload" />
            {{ loadingLibs ? '加载 PDF 库中...' : '上传 PDF' }}
          </BaseBtn>
          <input
            ref="uploadInput"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            class="hidden"
            @change="onFilesSelected"
          >
          <BaseBtn
            variant="tiny"
            :disabled="!totalPages || exportBusy || loadingLibs"
            @click="exportPdf"
          >
            <span class="i-carbon-download" />
            导出 PDF
          </BaseBtn>
          <BaseBtn
            variant="tiny"
            :disabled="!totalPages || exportBusy || loadingLibs"
            @click="exportJpgZip"
          >
            <span class="i-carbon-package" />
            导出 JPG ZIP
          </BaseBtn>
          <BaseBtn
            variant="tiny"
            variant-class="base-btn-danger"
            :disabled="!files.length || exportBusy"
            @click="resetAll"
          >
            <span class="i-carbon-trash-can" />
            清空
          </BaseBtn>
          <MetaPill
            v-if="totalPages"
            :text="`${totalPages} 页（${files.length} 个文件）`"
            tone="accent"
          />
        </div>
      </div>
    </header>

    <EmptyState
      v-if="!files.length"
      title="尚未上传 PDF"
      description="点击右上角「上传 PDF」，支持多文件按顺序拼接（自动合并）。"
      icon="i-carbon-document-pdf"
    />

    <template v-else>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- 左：缩略图列表（PdfThumbList） -->
        <div class="lg:col-span-5 space-y-3">
          <div class="base-card !p-4 space-y-3">
            <div class="flex items-center justify-between gap-2 text-sm">
              <div class="font-semibold text-text inline-flex items-center gap-2">
                <span class="i-carbon-image--copy text-accent" /> 页面（点击选中，按钮旋转/删除）
              </div>
              <span class="text-xs text-muted">选中第 {{ selectedIndex + 1 }} / {{ totalPages }} 页</span>
            </div>
            <PdfThumbList
              :thumbnails="thumbs"
              :selected-index="selectedIndex"
              @select="onSelectThumb"
              @rotate="onRotateThumb"
              @remove="onRemoveThumb"
            />
          </div>

          <!-- 文件元信息（调试用） -->
          <details class="base-card !p-3 group text-xs text-muted">
            <summary class="cursor-pointer list-none flex items-center gap-2 text-text font-medium">
              <span class="i-carbon-information text-accent" /> 已上传文件清单
              <span class="i-carbon-chevron-down ml-auto transition group-open:rotate-180" />
            </summary>
            <ul class="mt-2 pl-5 space-y-1">
              <li
                v-for="f in files"
                :key="f.id"
                class="flex items-center justify-between gap-2"
              >
                <span class="truncate">📄 {{ f.name }}</span>
                <span class="tabular-nums">{{ (f.size/1024).toFixed(1) }} KB · {{ f.pages.filter(p=>!p.removed).length }}/{{ f.pages.length }} 页</span>
              </li>
            </ul>
          </details>
        </div>

        <!-- 右：预览 + 水印 -->
        <div class="lg:col-span-7 space-y-4">
          <div class="base-card !p-3 md:!p-4 space-y-2">
            <div class="flex items-center justify-between gap-2 text-sm">
              <div class="font-semibold text-text inline-flex items-center gap-2">
                <span class="i-carbon-view text-accent" /> 预览
                <MetaPill
                  v-if="flatPages[selectedIndex]"
                  :text="flatPages[selectedIndex].sourceFile"
                />
              </div>
              <span
                v-if="previewBusy"
                class="text-xs text-muted inline-flex items-center gap-1"
              ><span class="i-carbon-loading animate-spin" /> 渲染中...</span>
            </div>
            <div class="relative w-full max-h-[62vh] overflow-auto bg-[var(--surface)] rounded-card border border-[var(--border)] flex items-center justify-center p-3">
              <EmptyState
                v-if="selectedIndex < 0 && !previewBusy"
                title="选择一页预览"
                description="点击左侧缩略图即可预览"
                icon="i-carbon-view"
              />
              <canvas
                v-show="selectedIndex >= 0"
                ref="previewCanvas"
                class="max-w-full h-auto rounded shadow-card bg-white"
              />
            </div>
          </div>

          <div class="base-card !p-4 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-text inline-flex items-center gap-2">
                <span class="i-carbon-watson-health text-accent" /> 水印设置
              </h2>
              <label class="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  v-model="watermark.text"
                  type="checkbox"
                  true-value="Solo Radio · v3"
                  false-value=""
                  class="accent-[var(--accent)]"
                >
                启用水印
              </label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="md:col-span-2 space-y-1">
                <span class="text-xs text-muted">水印文本</span>
                <input
                  v-model="watermark.text"
                  type="text"
                  class="base-input"
                  placeholder="输入自定义水印文字"
                >
              </label>
              <label class="space-y-1">
                <span class="text-xs text-muted">位置</span>
                <select
                  v-model="watermark.position"
                  class="base-input"
                >
                  <option value="topleft">左上</option>
                  <option value="center">居中</option>
                  <option value="bottomright">右下</option>
                  <option value="diagonal">斜向平铺</option>
                </select>
              </label>
              <label class="space-y-1">
                <span class="text-xs text-muted">颜色</span>
                <input
                  v-model="watermark.color"
                  type="color"
                  class="base-input !h-10 !p-1"
                >
              </label>
              <label class="space-y-1">
                <span class="text-xs text-muted">字号（相对 A4）：{{ watermark.size }}pt</span>
                <input
                  v-model.number="watermark.size"
                  type="range"
                  min="12"
                  max="120"
                  step="1"
                  class="accent-[var(--accent)] w-full"
                >
              </label>
              <label class="space-y-1">
                <span class="text-xs text-muted">不透明度：{{ Math.round(watermark.opacity * 100) }}%</span>
                <input
                  v-model.number="watermark.opacity"
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  class="accent-[var(--accent)] w-full"
                >
              </label>
              <label class="space-y-1">
                <span class="text-xs text-muted">旋转角度：{{ watermark.rotation }}°</span>
                <input
                  v-model.number="watermark.rotation"
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  class="accent-[var(--accent)] w-full"
                >
              </label>
            </div>
          </div>

          <div class="base-card !p-4 space-y-4">
            <h2 class="font-semibold text-text inline-flex items-center gap-2">
              <span class="i-carbon-image-export text-accent" /> 导出 JPG 参数
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="space-y-2">
                <div class="text-xs text-muted">
                  渲染缩放：{{ jpgOptions.scale.toFixed(2) }}×
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="s in SCALES"
                    :key="s"
                    class="base-btn base-btn-tiny"
                    :class="Math.abs(jpgOptions.scale - s) < 0.001 ? 'base-btn-primary' : ''"
                    @click="jpgOptions.scale = s"
                  >
                    {{ s }}×
                  </button>
                </div>
              </div>
              <div class="space-y-2">
                <div class="text-xs text-muted">
                  JPEG 质量：{{ Math.round(jpgOptions.quality * 100) }}%
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="q in QUALITIES"
                    :key="q"
                    class="base-btn base-btn-tiny"
                    :class="Math.abs(jpgOptions.quality - q) < 0.001 ? 'base-btn-primary' : ''"
                    @click="jpgOptions.quality = q"
                  >
                    {{ Math.round(q * 100) }}%
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="base-card !p-4 text-xs text-muted space-y-2 leading-relaxed">
      <div class="font-semibold text-text text-sm">
        加载说明
      </div>
      <p>• 首次上传时会动态导入三个库（约 1.5MB），顺序：<code>node_modules 打包 chunk</code> → <code>cdn.jsdelivr.net</code> → <code>unpkg.com</code>。</p>
      <p>• 所有解析/渲染/水印均在浏览器本地完成，PDF 文件不会上传到任何服务器。</p>
    </div>
  </section>
</template>
