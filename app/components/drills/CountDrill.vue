<script setup lang="ts">
import type { Card } from '~/utils/engine/cards'
import { buildShoeCards, shuffle } from '~/utils/engine/cards'
import { hiLoValue } from '~/utils/engine/counting'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random })

const store = useBlackjackStore()

const LEVELS = [
  { id: 'singles', label: 'Singles', group: 1 },
  { id: 'pairs', label: 'Pairs', group: 2 },
  { id: 'rounds', label: 'Table rounds', group: 6 }
] as const
const SPEEDS = [
  { label: 'Slow', ms: 1100 },
  { label: 'Medium', ms: 700 },
  { label: 'Fast', ms: 450 }
]
const TOTAL_CARDS = 20

const level = ref<typeof LEVELS[number]>(LEVELS[0])
const speed = ref(SPEEDS[0]!)
const phase = ref<'idle' | 'flashing' | 'answer' | 'result'>('idle')
const queue = ref<Card[][]>([])
const current = ref<Card[]>([])
const actual = ref(0)
const entered = ref<number | null>(null)
const correct = ref(false)
const streak = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function start(): void {
  const cards = shuffle(buildShoeCards(1), props.rng).slice(0, TOTAL_CARDS)
  actual.value = cards.reduce((sum, c) => sum + hiLoValue(c), 0)
  const groups: Card[][] = []
  for (let i = 0; i < cards.length; i += level.value.group) {
    groups.push(cards.slice(i, i + level.value.group))
  }
  queue.value = groups
  phase.value = 'flashing'
  entered.value = null
  if (reducedMotion) {
    current.value = queue.value.shift() ?? []
    return // manual stepping
  }
  advance()
  timer = setInterval(advance, speed.value.ms)
}

function advance(): void {
  const next = queue.value.shift()
  if (!next) {
    stopTimer()
    current.value = []
    phase.value = 'answer'
    return
  }
  current.value = next
}

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function submit(): void {
  if (entered.value === null || Number.isNaN(entered.value)) return
  correct.value = entered.value === actual.value
  store.recordCountCheck(entered.value, actual.value)
  if (correct.value) {
    streak.value++
    store.recordDrillBest(`count-${level.value.id}`, streak.value)
  } else {
    streak.value = 0
  }
  phase.value = 'result'
}

function reset(): void {
  stopTimer()
  phase.value = 'idle'
}

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best ({{ level.label }}): <span class="font-mono">{{ store.training.drillBests[`count-${level.id}`] ?? 0 }}</span></span>
    </div>

    <div
      v-if="phase === 'idle'"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="lvl in LEVELS"
          :key="lvl.id"
          size="xs"
          :variant="level.id === lvl.id ? 'solid' : 'outline'"
          color="neutral"
          :data-testid="`count-level-${lvl.id}`"
          @click="level = lvl"
        >
          {{ lvl.label }}
        </UButton>
        <span class="mx-1 h-4 w-px bg-neutral-700" />
        <UButton
          v-for="s in SPEEDS"
          :key="s.label"
          size="xs"
          :variant="speed.label === s.label ? 'solid' : 'outline'"
          color="neutral"
          @click="speed = s"
        >
          {{ s.label }}
        </UButton>
      </div>
      <UButton
        color="primary"
        data-testid="count-start"
        @click="start"
      >
        Flash {{ TOTAL_CARDS }} cards
      </UButton>
    </div>

    <div
      v-else-if="phase === 'flashing'"
      class="flex min-h-32 flex-col items-center justify-center gap-3"
      data-testid="count-flashing"
    >
      <div class="flex gap-1.5">
        <PlayingCard
          v-for="(card, i) in current"
          :key="i"
          :card="card"
          :face-up="true"
          size="sm"
        />
      </div>
      <UButton
        v-if="reducedMotion"
        size="xs"
        color="neutral"
        variant="soft"
        data-testid="count-step"
        @click="advance"
      >
        Next
      </UButton>
    </div>

    <div
      v-else-if="phase === 'answer'"
      class="flex items-center justify-center gap-2"
    >
      <UInput
        v-model.number="entered"
        type="number"
        size="sm"
        placeholder="Running count?"
        data-testid="count-answer"
        @keydown.enter="submit"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="count-submit"
        @click="submit"
      >
        Check
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="count-result"
    >
      <p
        class="text-sm font-semibold"
        :class="correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ correct ? `✓ RC ${actual}` : `✗ you said ${entered} — RC was ${actual}` }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        @click="reset"
      >
        Again
      </UButton>
    </div>
  </div>
</template>
