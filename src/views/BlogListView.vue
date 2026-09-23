<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePosts } from '@/composables/usePosts'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import BaseBtn from '@/components/common/BaseBtn.vue'

const router = useRouter()
const { posts } = usePosts()
const kw = ref('')
const tag = ref('')

const tags = computed(() => {
  const s = new Set<string>()
  for (const p of posts.value) for (const t of p.tags ?? []) s.add(t)
  return Array.from(s).sort()
})

const list = computed(() => {
  const q = kw.value.trim().toLowerCase()
  return posts.value.filter(p => {
    if (tag.value && !(p.tags ?? []).includes(tag.value)) return false
    if (!q) return true
    const blob = `${p.title} ${p.excerpt ?? ''} ${p.date ?? ''} ${(p.tags ?? []).join(' ')}`.toLowerCase()
    return blob.includes(q)
  })
})

function open(slug: string) { void router.push(`/blog/${slug}`) }
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text flex items-center gap-2">
          <span class="i-carbon-document text-accent" /> 博客
        </h1>
        <p class="mt-1 text-sm text-muted">
          共 {{ posts.length }} 篇
        </p>
      </div>
      <div class="flex items-center gap-2 w-full md:w-auto">
        <select
          v-if="tags.length"
          v-model="tag"
          class="base-input !h-11 md:w-40 shrink-0"
        >
          <option value="">
            全部标签
          </option>
          <option
            v-for="t in tags"
            :key="t"
            :value="t"
          >
            #{{ t }}
          </option>
        </select>
        <SearchBar
          v-model="kw"
          placeholder="搜索文章标题 / 摘要"
          class="w-full md:min-w-[280px]"
        />
      </div>
    </header>

    <EmptyState
      v-if="!list.length"
      title="无匹配文章"
      description="换个关键词试试？"
    />

    <ul
      v-else
      class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4"
    >
      <li
        v-for="p in list"
        :key="p.slug"
        class="base-card hover:bg-[var(--surface)] transition cursor-pointer"
        @click="open(p.slug)"
      >
        <div class="flex flex-wrap gap-1 mb-1.5">
          <MetaPill
            v-if="p.date"
            tone="accent"
            :text="p.date"
          />
          <MetaPill
            v-for="t in p.tags?.slice(0, 3)"
            :key="t"
            :text="`#${t}`"
          />
        </div>
        <h3 class="text-lg font-semibold text-text leading-snug line-clamp-2">
          {{ p.title }}
        </h3>
        <p
          v-if="p.excerpt"
          class="mt-1.5 text-sm text-muted line-clamp-3"
        >
          {{ p.excerpt }}
        </p>
        <div class="mt-3 flex justify-end">
          <BaseBtn
            variant="tiny"
            @click.stop="open(p.slug)"
          >
            <span class="i-carbon-arrow-right" /> 阅读
          </BaseBtn>
        </div>
      </li>
    </ul>
  </section>
</template>
