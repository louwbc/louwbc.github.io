/**
 * 全站唯一导航数据源（AC-1 / G-1）
 * 新增 / 删除应用入口只改本文件，AppTopBar、HomeView、侧边抽屉（若有）会自动同步
 */
import type { Component } from 'vue'

export interface AppRouteMeta {
  title: string
  /** 排序权重：越小越靠前 */
  order: number
  /** 导航栏中是否显示 */
  inNav: boolean
  /** 首页「应用卡片」中是否显示 */
  inHomeGrid: boolean
  /** Carbon Icon 名（@iconify-json/carbon） */
  icon?: string
  /** 描述（首页卡片上展示） */
  description?: string
}

export interface AppRouteRecord {
  path: string
  name: string
  component: Component | (() => Promise<{ default: Component }>)
  meta: AppRouteMeta
  children?: AppRouteRecord[]
}

// 所有视图都 defineAsyncComponent 懒加载（满足 NFR-3 首屏 < 250KB）
import { defineAsyncComponent } from 'vue'

const HomeView = defineAsyncComponent(() => import('@/views/HomeView.vue'))
const BlogListView = defineAsyncComponent(() => import('@/views/BlogListView.vue'))
const BlogPostView = defineAsyncComponent(() => import('@/views/BlogPostView.vue'))
const TvView = defineAsyncComponent(() => import('@/views/TvView.vue'))
const FmView = defineAsyncComponent(() => import('@/views/FmView.vue'))
const FavoritesView = defineAsyncComponent(() => import('@/views/FavoritesView.vue'))
const PomodoroView = defineAsyncComponent(() => import('@/views/PomodoroView.vue'))
const PdfToolView = defineAsyncComponent(() => import('@/views/PdfToolView.vue'))

export const appRoutes: AppRouteRecord[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      title: '首页',
      order: 0,
      inNav: true,
      inHomeGrid: false,
      icon: 'i-carbon-home',
      description: '应用入口 + 最新博客'
    }
  },
  {
    path: '/blog',
    name: 'blog-list',
    component: BlogListView,
    meta: {
      title: '博客',
      order: 1,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-document',
      description: '文章与想法'
    }
  },
  {
    path: '/tv',
    name: 'tv',
    component: TvView,
    meta: {
      title: '全球电视',
      order: 4,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-screen',
      description: '英语频道 800 台 · 音频优先'
    }
  },
  {
    path: '/fm',
    name: 'fm',
    component: FmView,
    meta: {
      title: '全球FM',
      order: 3,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-network-4',
      description: '全球电台搜索 + 播客折叠视图'
    }
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: FavoritesView,
    meta: {
      title: '我的收藏',
      order: 2,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-favorite',
      description: '电视 + 电台混排（上限 600 条）'
    }
  },
  {
    path: '/pomodoro',
    name: 'pomodoro',
    component: PomodoroView,
    meta: {
      title: '番茄钟',
      order: 5,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-timer',
      description: '专注 25min · 休息 5min · 三模提醒'
    }
  },
  {
    path: '/pdf',
    name: 'pdf-tool',
    component: PdfToolView,
    meta: {
      title: 'PDF工具',
      order: 6,
      inNav: true,
      inHomeGrid: true,
      icon: 'i-carbon-document-pdf',
      description: '删页 / 旋转 / 水印 / PDF→JPG'
    }
  },
  // 博客详情（不在导航中展示）
  {
    path: '/blog/:slug',
    name: 'blog-post',
    component: BlogPostView,
    meta: {
      title: '博客文章',
      order: 99,
      inNav: false,
      inHomeGrid: false
    }
  }
]
