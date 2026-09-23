<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePosts } from '@/composables/usePosts'
import MetaPill from '@/components/common/MetaPill.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'

const route = useRoute()
const router = useRouter()
const { bySlug, posts } = usePosts()
const slug = computed(() => String(route.params.slug ?? ''))
const post = computed(() => bySlug(slug.value))
onMounted(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) })
</script>

<template>
  <article class="mt-4 md:mt-6 space-y-6">
    <div
      v-if="!post"
      class="base-card"
    >
      <h1 class="text-xl font-bold text-text mb-2">
        文章不存在
      </h1>
      <p class="text-muted">
        slug = {{ slug }}。<button
          class="base-btn base-btn-tiny mt-2"
          @click="router.push('/blog')"
        >
          返回博客
        </button>
      </p>
    </div>

    <template v-else>
      <header class="space-y-3">
        <div class="flex flex-wrap gap-1.5">
          <MetaPill
            v-if="post.date"
            tone="accent"
            :text="post.date"
          />
          <MetaPill
            v-if="post.author"
            :text="`作者: ${post.author}`"
          />
          <MetaPill
            v-for="t in post.tags"
            :key="t"
            :text="`#${t}`"
          />
        </div>
        <h1 class="text-2xl md:text-3xl font-bold text-text leading-tight">
          {{ post.title }}
        </h1>
        <p
          v-if="post.excerpt"
          class="text-muted italic border-l-2 border-[var(--accent-border)] pl-3"
        >
          {{ post.excerpt }}
        </p>
        <div>
          <BaseBtn
            variant="tiny"
            @click="router.push('/blog')"
          >
            <span class="i-carbon-arrow-left" /> 返回博客列表
          </BaseBtn>
        </div>
      </header>

      <section
        class="base-card prose"
        v-html="post.html"
      />
    </template>
  </article>
</template>

<style>
/* 博客正文基础样式（UnoCSS prose 不内置，手动补一个轻量版） */
.prose h1 { font-size: 1.75rem; font-weight: 700; margin: 1.2em 0 .6em; color: var(--text); }
.prose h2 { font-size: 1.35rem; font-weight: 700; margin: 1.1em 0 .5em; color: var(--text); }
.prose h3 { font-size: 1.1rem; font-weight: 600; margin: 1em 0 .4em; color: var(--text); }
.prose p { line-height: 1.75; margin: .8em 0; color: var(--text); font-size: 15px; }
.prose a { color: var(--accent); text-decoration: underline; }
.prose ul, .prose ol { padding-left: 1.4em; margin: .8em 0; }
.prose li { margin: .3em 0; line-height: 1.7; }
.prose code { background: var(--surface); padding: .08em .3em; border-radius: 6px; font-size: .92em; }
.prose pre { background: #0b1020; color: #e5e7eb; padding: 14px 16px; border-radius: 12px; overflow-x: auto; line-height: 1.55; margin: 1em 0; }
.prose pre code { background: transparent; padding: 0; color: inherit; }
.prose blockquote { border-left: 3px solid var(--accent-border); background: var(--surface); padding: 8px 14px; border-radius: 0 10px 10px 0; color: var(--text); margin: 1em 0; }
.prose img { max-width: 100%; border-radius: var(--radius-card); }
.prose hr { border: 0; border-top: 1px solid var(--border); margin: 1.5em 0; }
.prose table { border-collapse: collapse; width: 100%; margin: 1em 0; }
.prose th, .prose td { border: 1px solid var(--border); padding: 6px 10px; }
</style>
