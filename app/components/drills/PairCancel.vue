<script setup lang="ts">
import type { Card } from '~/utils/engine/cards'
import { RANK_DISPLAY, buildDeck, shuffle } from '~/utils/engine/cards'
import { hiLoValue } from '~/utils/engine/counting'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

const store = useBlackjackStore()

const ANSWERS = [-2, -1, 0, 1, 2]

// pairs come sequentially from one shuffled deck (reshuffled when it runs out),
// so the mix of cancelling / one-sided / neutral pairs is the deck's own
const deck = ref<Card[]>([])
const pair = ref<Card[]>([])
const phase = ref<'play' | 'verdict'>('play')
const picked = ref(0)
const correct = ref(false)
const streak = ref(0)

function tagText(card: Card): string {
  const t = hiLoValue(card)
  return `${RANK_DISPLAY[card.rank]} (${t > 0 ? '+1' : t < 0 ? '−1' : '0'})`
}

const net = computed(() => pair.value.reduce((s, c) => s + hiLoValue(c), 0))

/** The lesson, per pair shape: cancelling pairs are SKIPPED, not summed. */
const explanation = computed(() => {
  const [a, b] = pair.value
  if (!a || !b) return ''
  const ta = hiLoValue(a)
  const tb = hiLoValue(b)
  if (ta + tb === 0 && ta !== 0) {
    return `${tagText(a)} and ${tagText(b)} cancel — skip the pair entirely, don't sum it.`
  }
  if (ta === 0 && tb === 0) {
    return `${tagText(a)} and ${tagText(b)} are both neutral — nothing to count.`
  }
  if (ta === 0 || tb === 0) {
    const counted = ta === 0 ? b : a
    return `Only ${tagText(counted)} counts — the neutral card is ignored.`
  }
  return `${tagText(a)} and ${tagText(b)} point the same way: ${net.value > 0 ? '+' : '−'}2.`
})

function nextPair(): void {
  if (deck.value.length < 2) deck.value = shuffle(buildDeck(), props.rng)
  pair.value = deck.value.splice(0, 2)
  phase.value = 'play'
}

function answer(value: number): void {
  picked.value = value
  correct.value = value === net.value
  if (correct.value) {
    streak.value++
    store.recordDrillBest('pair-cancel', streak.value)
  } else {
    streak.value = 0
  }
  phase.value = 'verdict'
}

nextPair()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best: <span class="font-mono">{{ store.training.drillBests['pair-cancel'] ?? 0 }}</span></span>
    </div>

    <p class="text-xs text-neutral-400">
      Real counters read pairs, not cards: a high–low pair cancels and gets skipped.
      What is each pair's net Hi-Lo tag?
    </p>

    <div class="flex min-h-28 items-center justify-center gap-2">
      <PlayingCard
        v-for="(card, i) in pair"
        :key="i"
        :card="card"
        :face-up="true"
        size="md"
      />
    </div>

    <div
      v-if="phase === 'play'"
      class="flex items-center justify-center gap-2"
    >
      <UButton
        v-for="v in ANSWERS"
        :key="v"
        color="neutral"
        variant="outline"
        size="sm"
        class="min-w-12 justify-center font-mono"
        :data-testid="`pair-btn-${v}`"
        @click="answer(v)"
      >
        {{ v > 0 ? `+${v}` : v }}
      </UButton>
    </div>

    <div
      v-else
      class="space-y-2 text-center"
      data-testid="pair-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ correct ? `✓ net ${net > 0 ? '+' : ''}${net}` : `✗ you said ${picked > 0 ? '+' : ''}${picked} — net is ${net > 0 ? '+' : ''}${net}` }}
      </p>
      <p class="text-xs text-neutral-400">
        {{ explanation }}
      </p>
      <UButton
        color="primary"
        size="sm"
        data-testid="pair-next"
        @click="nextPair"
      >
        Next pair
      </UButton>
    </div>
  </div>
</template>
