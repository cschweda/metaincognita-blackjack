<script setup lang="ts">
import type { Deviation } from '~/utils/engine/counting'
import { FAB_4, ILLUSTRIOUS_18, deviationActive, deviationThreshold } from '~/utils/engine/counting'
import { bestAction, bestActionFull } from '~/utils/engine/basicStrategy'
import { PRESETS } from '~/utils/engine/rules'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

const store = useBlackjackStore()
const rules = computed(() => store.settings?.rules ?? PRESETS.VEGAS_STRIP_6D!)
const surrenderLegal = computed(() => rules.value.surrender === 'late')

/** The book side comes from the EV engine under the active rules — computed, not transcribed. */
function bookPlayFor(dev: Deviation): string {
  if (dev.id === 'insurance') return 'decline'
  if (dev.pair !== null) {
    return bestActionFull({ pair: dev.pair, total: dev.total, soft: dev.soft }, dev.up, rules.value).action
  }
  return bestAction({ total: dev.total, soft: dev.soft, twoCards: true, fromSplit: false }, dev.up, rules.value).action
}

/** Only quiz deviations that are real deviations under the active rules: the play must be
 *  available (Fab 4 needs late surrender), reachable (a finite threshold), and different
 *  from what the book already does (11vA-double is simply book under H17). */
const pool = computed<Deviation[]>(() => [...ILLUSTRIOUS_18, ...FAB_4].filter((dev) => {
  if (dev.id === 'insurance') return true
  if (dev.play === 'surrender' && !surrenderLegal.value) return false
  if (!Number.isFinite(deviationThreshold(dev, surrenderLegal.value).value)) return false
  return bookPlayFor(dev) !== dev.play
}))

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

function makeQuestion(): Question {
  const dev = pool.value[Math.floor(props.rng() * pool.value.length)]!
  const threshold = deviationThreshold(dev, surrenderLegal.value)
  const above = props.rng() < 0.5
  const offset = 1 + Math.floor(props.rng() * 2)
  const tc = threshold.kind === 'min'
    ? (above ? threshold.value + offset : threshold.value - offset)
    : (above ? threshold.value - offset : threshold.value + offset) // max: "above" = deeper negative → active
  return { dev, tc, active: deviationActive(dev, tc, surrenderLegal.value) }
}

const question = ref<Question>(makeQuestion())
const verdict = ref<{ correct: boolean, explanation: string } | null>(null)
const { streak, best, grade } = useDrillStreak('deviation-quiz')

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
  const t = deviationThreshold(q.dev, surrenderLegal.value)
  const threshold = t.kind === 'min' ? `TC ≥ ${t.value}` : `TC < ${t.value}`
  verdict.value = {
    correct,
    explanation: `${q.dev.description} applies at ${threshold}; the count is ${q.tc.toFixed(0)} → ${q.active ? 'deviate' : 'stay with the book'}.`
  }
  grade(correct)
}

function next(): void {
  verdict.value = null
  question.value = makeQuestion()
}
</script>

<template>
  <div class="space-y-3">
    <DrillScoreHeader
      :streak="streak"
      :best="best"
    />

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
