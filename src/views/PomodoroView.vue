<script setup lang="ts">
/**
 * 番茄钟（Task 9）
 * - 状态机：work(25m) × N → short(5m) / 每 N=cyclesBeforeLong 后 long(15m)
 * - 反作弊：remainingMs = max(0, endAtMs - Date.now())，刷新/切 tab 后按真实时间差恢复
 * - 三模提醒 UI（通知 / 蜂鸣 880Hz×3 / 振动）勾选
 * - Alarm Panel：awaitingAck 时倒计时显示，30s 自动停蜂鸣（alarmStopAtMs），点 ACK 才进下一阶段
 * - 自定义时长输入（workMin/shortMin/longMin/cyclesBeforeLong，持久化到 V3_KEYS.POMODORO）
 */
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePomodoroStore, type PomPhase } from '@/stores/pomodoro'
import BaseBtn from '@/components/common/BaseBtn.vue'
import MetaPill from '@/components/common/MetaPill.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToasts } from '@/composables/useToasts'

const pom = usePomodoroStore()
const toast = useToasts()

const { phase, completedWork, cyclesBeforeLong, running, awaitingAck, notify, beep, vibrate, workMin, shortMin, longMin, remainingMs, totalMs, alarmStopAtMs } = storeToRefs(pom)

// 进度环：0..1 （剩余越小越接近 1）
const progress = computed(() => {
  const total = totalMs.value || 1
  const used = Math.max(0, total - remainingMs.value)
  return Math.min(1, Math.max(0, used / total))
})
const pct = computed(() => Math.round(progress.value * 100))

// MM:SS 格式化
const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
const remainingText = computed(() => fmtMs(remainingMs.value))

// 30s 自动停蜂鸣倒计时
const alarmRemainingSec = computed(() => Math.max(0, Math.ceil((alarmStopAtMs.value - Date.now()) / 1000)))

// 下一个阶段指示（给用户看的进度表格）
const nextPhase = computed<PomPhase>(() => {
  if (phase.value === 'idle') return 'work'
  if (phase.value === 'work') {
    return (completedWork.value + 1) % cyclesBeforeLong.value === 0 ? 'long' : 'short'
  }
  return 'work'
})

// SVG 环参数
const RING = { r: 80, c: 2 * Math.PI * 80, size: 200 }
const strokeDashoffset = computed(() => RING.c * (1 - progress.value))

// 100ms tick（刷新 UI + 触发 completed 判断）
const tick = ref(0)
let timer: number | null = null
function ensureNotifyPerm() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {})
  }
}
function startTick() {
  if (timer) window.clearInterval(timer)
  timer = window.setInterval(() => {
    tick.value++
    pom.markCompletedIfDue()
  }, 100)
}
onMounted(() => {
  startTick()
  ensureNotifyPerm()
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

// 按钮动作
function onStart() {
  ensureNotifyPerm()
  pom.startNext('work')
}
function onResume() { pom.resume() }
function onPause() { pom.pause() }
function onStop() {
  pom.stop()
  toast.info('已停止番茄钟')
}
function onSkip() {
  if (!confirm(`确定跳过当前${phaseName(phase.value)}阶段吗？`)) return
  pom.awaitingAck = false
  pom.skipAckAndNext()
}
function onAckNext() {
  pom.skipAckAndNext()
}
function phaseName(p: PomPhase) {
  return p === 'work' ? '专注' : p === 'short' ? '短休' : p === 'long' ? '长休' : '空闲'
}
function phaseColor(p: PomPhase) {
  return p === 'work' ? 'var(--accent)' : p === 'short' ? '#10b981' : p === 'long' ? '#8b5cf6' : 'var(--border)'
}

// 表单校验（自定义时长）
const draftWork = ref(String(workMin.value))
const draftShort = ref(String(shortMin.value))
const draftLong = ref(String(longMin.value))
const draftCycles = ref(String(cyclesBeforeLong.value))
watch([workMin, shortMin, longMin, cyclesBeforeLong], () => {
  draftWork.value = String(workMin.value)
  draftShort.value = String(shortMin.value)
  draftLong.value = String(longMin.value)
  draftCycles.value = String(cyclesBeforeLong.value)
})
function applyDrafts() {
  pom.setSetting('workMin', Number(draftWork.value))
  pom.setSetting('shortMin', Number(draftShort.value))
  pom.setSetting('longMin', Number(draftLong.value))
  pom.setSetting('cyclesBeforeLong', Number(draftCycles.value))
  toast.success('已保存自定义时长')
}
function resetDrafts() {
  draftWork.value = '25'; draftShort.value = '5'; draftLong.value = '15'; draftCycles.value = '4'
  applyDrafts()
}
</script>

<template>
  <section class="mt-4 md:mt-6 space-y-4">
    <header class="base-card !p-4 md:!p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-text flex items-center gap-2">
            <span class="i-carbon-timer text-accent" /> 番茄钟
          </h1>
          <p class="mt-1 text-sm text-muted">
            反作弊真实时间计算 · 三模提醒 · 30s 自动停蜂鸣
          </p>
        </div>
        <div class="inline-flex items-center gap-1.5 p-1 rounded-btn bg-[var(--surface)] border border-[var(--border)]">
          <MetaPill
            :text="`已完成 ${completedWork} 轮专注`"
            tone="accent"
          />
          <MetaPill
            v-if="cyclesBeforeLong > 0"
            :text="`每 ${cyclesBeforeLong} 轮长休`"
          />
        </div>
      </div>
    </header>

    <!-- Alarm Panel：awaitingAck 阶段 + 30s 倒计时 -->
    <Transition name="fade">
      <div
        v-if="awaitingAck"
        class="base-card !p-4 md:!p-5 border-2 !border-amber-400/60 relative overflow-hidden"
      >
        <div
          class="absolute inset-0 bg-amber-400/5 pointer-events-none"
          aria-hidden="true"
        />
        <div class="relative flex flex-col md:flex-row items-center md:items-start justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 text-amber-600 font-semibold">
              <span class="i-carbon-warning-alt-filled text-xl animate-pulse" />
              {{ phaseName(phase) }} 结束！
            </div>
            <h2 class="mt-2 text-xl md:text-2xl font-bold text-text">
              下一阶段：<span :style="{color: phaseColor(nextPhase)}">{{ phaseName(nextPhase) }}（{{ nextPhase === 'work' ? workMin : nextPhase === 'short' ? shortMin : longMin }}分钟）</span>
            </h2>
            <p class="mt-1 text-sm text-muted">
              蜂鸣将在 <span class="font-semibold tabular-nums">{{ alarmRemainingSec }}s</span> 后自动停止；确认后立即开始下一阶段。
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <BaseBtn
              variant="danger"
              @click="onStop"
            >
              <span class="i-carbon-stop-filled" /> 停止
            </BaseBtn>
            <BaseBtn
              variant="primary"
              @click="onAckNext"
            >
              <span class="i-carbon-skip-forward-filled" />
              确认 · 进入下一阶段
            </BaseBtn>
          </div>
        </div>
      </div>
    </Transition>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <!-- 左侧：进度环 + 状态 -->
      <div class="lg:col-span-7">
        <div class="base-card !p-6 md:!p-8 flex flex-col items-center space-y-5">
          <!-- SVG 圆环 -->
          <div
            class="relative"
            :style="{ width: RING.size + 'px', height: RING.size + 'px' }"
          >
            <svg
              :width="RING.size"
              :height="RING.size"
              class="-rotate-90"
            >
              <circle
                :cx="RING.size / 2"
                :cy="RING.size / 2"
                :r="RING.r"
                fill="none"
                stroke="var(--surface)"
                stroke-width="18"
              />
              <circle
                :cx="RING.size / 2"
                :cy="RING.size / 2"
                :r="RING.r"
                fill="none"
                :stroke="phaseColor(phase)"
                stroke-width="18"
                stroke-linecap="round"
                :stroke-dasharray="RING.c"
                :stroke-dashoffset="strokeDashoffset"
                class="transition-all duration-200"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div class="text-xs text-muted font-medium tracking-widest uppercase">
                {{ phase === 'idle' ? 'Idle' : phaseName(phase) }}
              </div>
              <div class="mt-1 text-5xl md:text-6xl font-bold tabular-nums text-text font-mono tracking-tight">
                {{ remainingText }}
              </div>
              <div class="mt-1 text-xs text-muted tabular-nums">
                {{ pct }}% 完成
              </div>
            </div>
          </div>

          <!-- 控制按钮 -->
          <div class="flex flex-wrap items-center justify-center gap-2">
            <BaseBtn
              v-if="phase === 'idle' || (awaitingAck === false && String(phase) !== 'idle' && !running && remainingMs <= 0)"
              variant="primary"
              @click="onStart"
            >
              <span class="i-carbon-play-filled" />
              {{ phase === 'idle' ? '开始专注' : '继续' }}
            </BaseBtn>
            <template v-else>
              <BaseBtn
                v-if="running"
                @click="onPause"
              >
                <span class="i-carbon-pause-filled" />
                暂停
              </BaseBtn>
              <BaseBtn
                v-else
                variant="primary"
                @click="onResume"
              >
                <span class="i-carbon-play-filled" />
                恢复
              </BaseBtn>
              <BaseBtn
                variant="danger"
                @click="onStop"
              >
                <span class="i-carbon-stop-filled" />
                停止
              </BaseBtn>
              <BaseBtn @click="onSkip">
                <span class="i-carbon-skip-forward-filled" />
                跳过
              </BaseBtn>
            </template>
          </div>

          <!-- 周期进度表 -->
          <div class="w-full max-w-md text-sm">
            <div class="flex items-center justify-between text-xs text-muted mb-2">
              <span>本轮进度（前 {{ cyclesBeforeLong }} 次专注 → 长休）</span>
              <span>已完成 {{ completedWork }} / 周期 × {{ Math.ceil((completedWork + 1) / cyclesBeforeLong) }}</span>
            </div>
            <ol class="flex items-stretch gap-1.5">
              <template
                v-for="i in (cyclesBeforeLong * 2 + 2)"
                :key="i"
              >
                <!-- 每 cyclesBeforeLong work 插入一个 long break -->
                <template v-if="i % (cyclesBeforeLong + 1) === 0">
                  <li
                    class="flex-1 h-6 rounded-md border flex items-center justify-center text-[10px] font-semibold"
                    :class="(completedWork >= i - 1) ? 'bg-violet-500/20 border-violet-400/60 text-violet-700 dark:text-violet-300' : 'bg-[var(--surface)] border-[var(--border)] text-muted'"
                  >
                    LB
                  </li>
                </template>
                <template v-else>
                  <li
                    class="flex-1 h-6 rounded-md border flex items-center justify-center text-[10px] font-semibold"
                    :class="[
                      completedWork >= i ? 'bg-[var(--accent)]/20 border-[var(--accent)]/60 text-[var(--accent)] font-bold' : phase === 'work' && completedWork === i - 1 ? 'bg-amber-400/20 border-amber-400/60 text-amber-700 dark:text-amber-300 animate-pulse' : 'bg-[var(--surface)] border-[var(--border)] text-muted'
                    ]"
                  >
                    W{{ i - Math.floor(i / (cyclesBeforeLong + 1)) }}
                  </li>
                </template>
              </template>
            </ol>
            <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
              <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-[var(--accent)]/40 border border-[var(--accent)]/60" />已完成专注</span>
              <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-amber-400/30 border border-amber-400/60" />当前阶段</span>
              <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-violet-500/20 border border-violet-400/60" />长休 (LB)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：设置 + 三模提醒 + 自定义时长 -->
      <div class="lg:col-span-5 space-y-4">
        <div class="base-card !p-4 space-y-4">
          <h2 class="font-semibold text-text flex items-center gap-2">
            <span class="i-carbon-settings text-accent" /> 结束提醒方式
          </h2>
          <div class="space-y-2">
            <label class="flex items-center justify-between gap-3 p-2.5 rounded-card border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--accent)]/40 transition">
              <div class="flex items-center gap-2 min-w-0">
                <span class="i-carbon-notification-new text-lg text-emerald-600 shrink-0" />
                <div>
                  <div class="font-medium text-text text-sm">浏览器通知</div>
                  <div class="text-xs text-muted">桌面推送消息（首次允许权限）</div>
                </div>
              </div>
              <input
                v-model="notify"
                type="checkbox"
                class="accent-[var(--accent)] w-4 h-4 shrink-0"
                @change="ensureNotifyPerm"
              >
            </label>
            <label class="flex items-center justify-between gap-3 p-2.5 rounded-card border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--accent)]/40 transition">
              <div class="flex items-center gap-2 min-w-0">
                <span class="i-carbon-volume-up text-lg text-sky-600 shrink-0" />
                <div>
                  <div class="font-medium text-text text-sm">蜂鸣声（880Hz×3）</div>
                  <div class="text-xs text-muted">AudioContext，结束后 30 秒自动停</div>
                </div>
              </div>
              <input
                v-model="beep"
                type="checkbox"
                class="accent-[var(--accent)] w-4 h-4 shrink-0"
              >
            </label>
            <label class="flex items-center justify-between gap-3 p-2.5 rounded-card border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--accent)]/40 transition">
              <div class="flex items-center gap-2 min-w-0">
                <span class="i-carbon-touch-interaction text-lg text-rose-500 shrink-0" />
                <div>
                  <div class="font-medium text-text text-sm">振动反馈</div>
                  <div class="text-xs text-muted">移动端支持（300-150-300-150-300 ms）</div>
                </div>
              </div>
              <input
                v-model="vibrate"
                type="checkbox"
                class="accent-[var(--accent)] w-4 h-4 shrink-0"
              >
            </label>
          </div>
        </div>

        <div class="base-card !p-4 space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold text-text flex items-center gap-2">
              <span class="i-carbon-adjust text-accent" /> 自定义时长
            </h2>
            <div class="flex items-center gap-1.5">
              <BaseBtn
                variant="tiny"
                @click="resetDrafts"
              >
                <span class="i-carbon-restore" /> 恢复默认
              </BaseBtn>
              <BaseBtn
                variant="tiny"
                class="base-btn-primary"
                @click="applyDrafts"
              >
                <span class="i-carbon-save" /> 保存
              </BaseBtn>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="space-y-1">
              <span class="text-xs text-muted">专注时长（分钟）</span>
              <input
                v-model="draftWork"
                type="number"
                min="1"
                max="180"
                class="base-input tabular-nums"
              >
            </label>
            <label class="space-y-1">
              <span class="text-xs text-muted">短休时长（分钟）</span>
              <input
                v-model="draftShort"
                type="number"
                min="1"
                max="60"
                class="base-input tabular-nums"
              >
            </label>
            <label class="space-y-1">
              <span class="text-xs text-muted">长休时长（分钟）</span>
              <input
                v-model="draftLong"
                type="number"
                min="1"
                max="120"
                class="base-input tabular-nums"
              >
            </label>
            <label class="space-y-1">
              <span class="text-xs text-muted">多少专注轮后长休</span>
              <input
                v-model="draftCycles"
                type="number"
                min="1"
                max="12"
                class="base-input tabular-nums"
              >
            </label>
          </div>
        </div>

        <div class="base-card !p-4 text-xs text-muted space-y-2 leading-relaxed">
          <div class="font-semibold text-text text-sm">
            反作弊说明
          </div>
          <p>• 开始时写入 <code>endAtMs = Date.now() + 时长</code>，剩余时间始终基于真实时间差计算。</p>
          <p>• 刷新页面 / 切后台 / 关浏览器再打开，仍会按墙上时间显示剩余。</p>
          <p>• 暂停时快照剩余 ms 写入 <code>pauseRemainingMs</code>，恢复时重算 endAtMs。</p>
        </div>
      </div>
    </div>
  </section>
</template>
