<script setup lang="ts">
import type { Card } from '~/utils/engine/cards'
import { buildDeck, displayCard, shuffle } from '~/utils/engine/cards'
import { hiLoValue } from '~/utils/engine/counting'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

const store = useBlackjackStore()

const MODES = [
  { id: 'singles', label: 'One at a time', group: 1 },
  { id: 'pairs', label: 'Pairs (cancellation pays off)', group: 2 }
] as const

const mode = ref<typeof MODES[number]>(MODES[0])
const phase = ref<'idle' | 'counting' | 'enter' | 'verdict'>('idle')
const hidden = ref<Card | null>(null)
const queue = ref<Card[]>([])
const current = ref<Card[]>([])
const seen = ref(0)
const entered = ref<number | null>(null)
const correct = ref(false)
const elapsedMs = ref(0)
let startedAt = 0
let ticker: ReturnType<typeof setInterval> | null = null

// the full deck sums to 0, so the right answer is always −(hidden card's tag):
// the drill verifies itself — there is no way to game it
const expected = computed(() => (hidden.value ? -hiLoValue(hidden.value) : 0))

const bestMs = computed(() => store.training.drillTimes['deck-countdown'])

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

const tier = computed(() => {
  if (!correct.value) return ''
  if (elapsedMs.value <= 30_000) return 'Under the 30-second pro bar.'
  if (elapsedMs.value <= 60_000) return 'Casino ready — under a minute.'
  return 'Verified. Now chase the 60-second bar.'
})

const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictText = computed(() => {
  if (phase.value !== 'verdict') return ''
  return correct.value
    ? `✓ count ${expected.value > 0 ? '+' : ''}${expected.value} — deck verified in ${fmt(elapsedMs.value)}`
    : `✗ you said ${entered.value} — the count was ${expected.value > 0 ? '+' : ''}${expected.value}`
})

function start(): void {
  const cards = shuffle(buildDeck(), props.rng)
  hidden.value = cards[0]!
  queue.value = cards.slice(1)
  seen.value = 0
  entered.value = null
  elapsedMs.value = 0
  startedAt = Date.now()
  ticker = setInterval(() => {
    elapsedMs.value = Date.now() - startedAt
  }, 100)
  phase.value = 'counting'
  advance()
}

function advance(): void {
  if (queue.value.length === 0) {
    finishCounting()
    return
  }
  current.value = queue.value.splice(0, mode.value.group)
  seen.value += current.value.length
}

function finishCounting(): void {
  stopTicker()
  elapsedMs.value = Date.now() - startedAt
  current.value = []
  phase.value = 'enter'
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function submit(): void {
  if (entered.value === null || Number.isNaN(entered.value)) return
  correct.value = entered.value === expected.value
  if (correct.value) store.recordDrillTime('deck-countdown', elapsedMs.value)
  phase.value = 'verdict'
  announce(`${verdictText.value}. The hidden card: ${hidden.value ? displayCard(hidden.value) : ''}.`)
}

function reset(): void {
  stopTicker()
  clear()
  phase.value = 'idle'
}

function onKeydown(e: KeyboardEvent): void {
  if (phase.value !== 'counting' || e.code !== 'Space') return
  if (document.activeElement instanceof HTMLInputElement) return
  e.preventDefault()
  advance()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  stopTicker()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="space-y-3">
    <p
      class="sr-only"
      role="status"
      data-testid="countdown-sr"
    >
      {{ srText }}
    </p>
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>The classic benchmark: count down a full deck, fast.</span>
      <span>Best: <span class="font-mono">{{ bestMs !== undefined ? fmt(bestMs) : '—' }}</span></span>
    </div>

    <div
      v-if="phase === 'idle'"
      class="space-y-3"
    >
      <p class="text-xs text-neutral-400">
        One card is set aside face down. Flip through the other 51 keeping the running
        count — a full deck sums to zero, so your final count reveals the hidden card.
        Under 30 seconds is the professional bar.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="m in MODES"
          :key="m.id"
          size="xs"
          :variant="mode.id === m.id ? 'solid' : 'outline'"
          color="neutral"
          :data-testid="`countdown-mode-${m.id}`"
          @click="mode = m"
        >
          {{ m.label }}
        </UButton>
      </div>
      <UButton
        color="primary"
        data-testid="countdown-start"
        @click="start"
      >
        Start the clock
      </UButton>
    </div>

    <div
      v-else-if="phase === 'counting'"
      class="space-y-3"
    >
      <div class="flex items-center justify-between text-xs text-neutral-400">
        <span class="font-mono">{{ seen }} / 51</span>
        <span class="font-mono tabular-nums">{{ fmt(elapsedMs) }}</span>
        <PlayingCard
          v-if="hidden"
          :card="hidden"
          :face-up="false"
          size="sm"
        />
      </div>
      <button
        type="button"
        class="flex min-h-32 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 py-3"
        data-testid="countdown-advance"
        aria-label="Reveal the next card (or press Space)"
        @click="advance"
      >
        <PlayingCard
          v-for="(card, i) in current"
          :key="`${seen}-${i}`"
          :card="card"
          :face-up="true"
          size="md"
        />
      </button>
      <p class="text-center text-xs text-neutral-400">
        Click or press Space for the next {{ mode.group === 2 ? 'pair' : 'card' }}
      </p>
    </div>

    <div
      v-else-if="phase === 'enter'"
      class="flex items-center justify-center gap-2"
    >
      <UInput
        v-model.number="entered"
        type="number"
        size="sm"
        placeholder="Final running count?"
        data-testid="countdown-answer"
        @keydown.enter="submit"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="countdown-submit"
        @click="submit"
      >
        Verify
      </UButton>
    </div>

    <div
      v-else
      class="space-y-2 text-center"
      data-testid="countdown-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdictText }}
      </p>
      <div class="flex items-center justify-center gap-2 text-xs text-neutral-400">
        <span>The hidden card:</span>
        <PlayingCard
          v-if="hidden"
          :card="hidden"
          :face-up="true"
          size="sm"
        />
        <span class="font-mono">{{ hidden ? displayCard(hidden) : '' }}</span>
      </div>
      <p
        v-if="tier"
        class="text-xs text-[var(--accent-gold)]"
      >
        {{ tier }}
      </p>
      <UButton
        ref="focusEl"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="countdown-again"
        @click="reset"
      >
        Again
      </UButton>
    </div>
  </div>
</template>
