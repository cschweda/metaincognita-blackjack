<script setup lang="ts">
import type { Deviation } from '~/utils/engine/counting'
import { FAB_4, ILLUSTRIOUS_18 } from '~/utils/engine/counting'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

const store = useBlackjackStore()
const POOL: Deviation[] = [...ILLUSTRIOUS_18, ...FAB_4]

interface Question {
  dev: Deviation
  tc: number
  /** true → the count clears the threshold, deviation is correct */
  active: boolean
}

function describeSituation(dev: Deviation): string {
  const up = dev.up === 11 ? 'A' : dev.up === 10 ? 'T' : String(dev.up)
  if (dev.id === 'insurance') return `Dealer shows an ace — insurance is open`
  if (dev.pair !== null) {
    const p = dev.pair === 11 ? 'A,A' : dev.pair === 10 ? 'T,T' : `${dev.pair},${dev.pair}`
    return `You hold ${p} vs dealer ${up}`
  }
  return `You hold ${dev.soft ? 'soft' : 'hard'} ${dev.total} vs dealer ${up}`
}

function bookPlayFor(dev: Deviation): string {
  // the deviation's reverse side: what basic strategy does without the count
  switch (dev.id) {
    case 'insurance': return 'decline'
    case 'fab-15vT-keep': return 'surrender'
    default:
      return dev.play === 'stand' ? 'hit' : dev.play === 'surrender' ? 'hit' : dev.play === 'split' ? 'stand' : 'hit'
  }
}

function makeQuestion(): Question {
  const dev = POOL[Math.floor(props.rng() * POOL.length)]!
  const threshold = dev.minTrueCount ?? dev.maxTrueCount!
  const above = props.rng() < 0.5
  const offset = 1 + Math.floor(props.rng() * 2)
  const tc = dev.minTrueCount !== undefined
    ? (above ? threshold + offset : threshold - offset)
    : (above ? threshold - offset : threshold + offset) // maxTrueCount: "above" = deeper negative → active
  const active = dev.minTrueCount !== undefined ? tc >= dev.minTrueCount : tc <= dev.maxTrueCount!
  return { dev, tc, active }
}

const question = ref<Question>(makeQuestion())
const verdict = ref<{ correct: boolean, explanation: string } | null>(null)
const streak = ref(0)

const options = computed(() => {
  const devLabel = question.value.dev.play.replace('-', ' ')
  return [
    { id: 'deviate', label: devLabel },
    { id: 'book', label: bookPlayFor(question.value.dev) }
  ]
})

function answer(id: 'deviate' | 'book'): void {
  const q = question.value
  const correct = q.active ? id === 'deviate' : id === 'book'
  const threshold = q.dev.minTrueCount !== undefined ? `TC ≥ ${q.dev.minTrueCount}` : `TC ≤ ${q.dev.maxTrueCount}`
  verdict.value = {
    correct,
    explanation: `${q.dev.description} applies at ${threshold}; the count is ${q.tc.toFixed(0)} → ${q.active ? 'deviate' : 'stay with the book'}.`
  }
  if (correct) {
    streak.value++
    store.recordDrillBest('deviation-quiz', streak.value)
  } else {
    streak.value = 0
  }
}

function next(): void {
  verdict.value = null
  question.value = makeQuestion()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best: <span class="font-mono">{{ store.training.drillBests['deviation-quiz'] ?? 0 }}</span></span>
    </div>

    <div
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-center"
      data-testid="quiz-situation"
    >
      <p class="text-sm text-neutral-200">
        {{ describeSituation(question.dev) }}
      </p>
      <p class="mt-1 font-mono text-lg font-bold text-[var(--accent-cream)]">
        TC {{ question.tc > 0 ? '+' : '' }}{{ question.tc.toFixed(0) }}
      </p>
    </div>

    <div
      v-if="!verdict"
      class="flex justify-center gap-2"
    >
      <UButton
        v-for="opt in options"
        :key="opt.id"
        color="primary"
        variant="soft"
        class="capitalize"
        :data-testid="`quiz-${opt.id}`"
        @click="answer(opt.id as 'deviate' | 'book')"
      >
        {{ opt.label }}
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="quiz-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdict.correct ? '✓ Correct' : '✗ Not this time' }}
      </p>
      <p class="mt-1 text-xs text-neutral-400">
        {{ verdict.explanation }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="quiz-next"
        @click="next"
      >
        Next
      </UButton>
    </div>
  </div>
</template>
