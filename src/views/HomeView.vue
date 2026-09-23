<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { appRoutes } from '@/router/routes'
import VersionChip from '@/components/common/VersionChip.vue'
import { usePosts } from '@/composables/usePosts'
import MetaPill from '@/components/common/MetaPill.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'

const router = useRouter()
const { latest } = usePosts()
const homeCards = computed(() =>
  appRoutes
    .filter(r => r.meta.inHomeGrid)
    .sort((a, b) => a.meta.order - b.meta.order)
)
function openCard(p: string) { void router.push(p) }
function openPost(slug: string) { void router.push(`/blog/${slug}`) }
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-6">
    <div class="base-card flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl md:text-2xl font-bold text-text flex items-center gap-2">
          <span class="i-carbon-music-dot text-accent text-2xl" />
          Solo Radio · 全球电视 / FM / 收藏
        </h1>
        <p class="mt-1 text-muted text-sm md:text-base">
          砍掉全球播客独立应用 + 象棋后的 v3 精简重构版（Vite + Vue3 + TS + Pinia + UnoCSS）
        </p>
      </div>
      <VersionChip />
    </div>

    <section>
      <h2 class="text-lg font-semibold text-text mb-3 flex items-center gap-2">
        <span class="i-carbon-apps" />
        应用中心
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <button
          v-for="r in homeCards"
          :key="r.name"
          class="base-card text-left hover:bg-[var(--surface-2)] transition active:translate-y-px"
          @click="openCard(r.path)"
        >
          <div class="flex items-start gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-btn bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent shrink-0">
              <span
                v-if="r.meta.icon"
                :class="r.meta.icon"
                class="text-xl"
              />
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-text">
                {{ r.meta.title }}
              </div>
              <div class="text-xs text-muted mt-0.5 line-clamp-2">
                {{ r.meta.description }}
              </div>
            </div>
          </div>
        </button>
      </div>
    </section>

    <section class="base-card text-sm text-muted">
      <div class="font-semibold text-text mb-1">
        架构要点
      </div>
      <ul class="list-disc pl-5 space-y-1">
        <li>导航 / 版本 / 数据模型 / 存储入口 — 4 大单一源</li>
        <li>全局持久 audio/video 单例，跨路由不中断</li>
        <li>localStorage ESLint 受限，强制走封装层</li>
        <li>路由级懒加载 + PDF / HLS.js 动态 import，首屏 &lt; 250KB gzipped</li>
        <li>v2 schema 一键迁移（幂等 + 回退）</li>
      </ul>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-text mb-3 flex items-center gap-2">
        <span class="i-carbon-time" />
        最新博客
      </h2>
      <div
        v-if="!latest.length"
        class="text-sm text-muted"
      >
        暂无文章。
      </div>
      <ul
        v-else
        class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4"
      >
        <li
          v-for="p in latest"
          :key="p.slug"
          class="base-card hover:bg-[var(--surface)] transition cursor-pointer"
          @click="openPost(p.slug)"
        >
          <div class="flex flex-wrap gap-1 mb-1.5">
            <MetaPill
              v-if="p.date"
              tone="accent"
              :text="p.date"
            />
            <MetaPill
              v-for="t in (p.tags ?? []).slice(0, 2)"
              :key="t"
              :text="`#${t}`"
            />
          </div>
          <h3 class="font-semibold text-text line-clamp-2">
            {{ p.title }}
          </h3>
          <p
            v-if="p.excerpt"
            class="mt-1 text-xs text-muted line-clamp-3"
          >
            {{ p.excerpt }}
          </p>
          <div class="mt-3 flex justify-end">
            <BaseBtn
              variant="tiny"
              @click.stop="openPost(p.slug)"
            >
              <span class="i-carbon-arrow-right" /> 阅读
            </BaseBtn>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
