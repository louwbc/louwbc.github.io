// 通过 import.meta.glob 读取 src/content/posts/*.md（Vite eager 模式下打包到首屏 chunk，内容少可接受）
// 解析 front-matter 存到 index；body 用 markdown-it 渲染，代码高亮用浏览器内置 <pre class>（简单够，体积小）
import { computed } from 'vue'
import fm from 'front-matter'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

export interface BlogPostMeta {
  title: string
  date?: string
  tags?: string[]
  excerpt?: string
  author?: string
  slug: string
  layout?: string
}

export interface BlogPost extends BlogPostMeta {
  html: string
  raw: string
  isoDate: string
}

const mdModules = import.meta.glob('/src/content/posts/*.md', { as: 'raw', eager: true })

function slugFromPath(filePath: string): string {
  const base = filePath.split('/').pop() || ''
  const stem = base.replace(/\.md$/, '')
  // 支持 2026-04-27-hello → 提取 slug=hello，同时保留完整 stem 当文件名
  const m = stem.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)
  return m ? m[1] : stem
}

function parseAll(): BlogPost[] {
  const out: BlogPost[] = []
  for (const [file, raw] of Object.entries(mdModules)) {
    try {
      const parsed = fm<BlogPostMeta>(raw || '')
      const attrs = parsed.attributes ?? {} as BlogPostMeta
      const slug = attrs.slug ?? slugFromPath(file)
      const date = attrs.date ?? (file.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '1970-01-01')
      out.push({
        ...attrs,
        slug,
        date,
        isoDate: new Date(date).toISOString(),
        excerpt: attrs.excerpt || parsed.body.slice(0, 140),
        raw: parsed.body,
        html: md.render(parsed.body)
      })
    } catch {
      // skip broken md file
    }
  }
  out.sort((a, b) => a.isoDate < b.isoDate ? 1 : -1)
  return out
}

const ALL = parseAll()

export function usePosts() {
  const posts = computed(() => ALL)
  const latest = computed(() => ALL.slice(0, 8))
  function bySlug(slug: string): BlogPost | undefined {
    return ALL.find(p => p.slug === slug)
  }
  return { posts, latest, bySlug }
}
