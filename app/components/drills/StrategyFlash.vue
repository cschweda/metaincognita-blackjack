<script setup lang="ts">
import type { Card, Suit } from '~/utils/engine/cards'
import { bucketOf } from '~/utils/engine/cards'
import type { Action } from '~/utils/engine/hand'
import { handTotal, isPair, legalActions, newHand } from '~/utils/engine/hand'
import { bestAction, bestActionFull } from '~/utils/engine/basicStrategy'
import { PRESETS } from '~/utils/engine/rules'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

const store = useBlackjackStore()
const rules = computed(() => store.settings?.rules ?? PRESETS.VEGAS_STRIP_6D!)

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const suit = (i: number): Suit => SUITS[i % 4]!

interface Situation {
  cards: Card[]
  up: Card
}

function rankFor(bucket: number): number {
  return bucket === 11 ? 14 : bucket
}

/** Rebuild a situation from a mistakeBag key — drills re-ask what the table missed. */
function fromMistakeKey(key: string): Situation | null {
  const [kind, totalRaw, upRaw] = key.split('|')
  const total = Number(totalRaw)
  const up = Number(upRaw)
  if (!kind || !Number.isFinite(total) || !Number.isFinite(up)) return null
  if (kind === 'pair') {
    const r = rankFor(total)
    return { cards: [{ rank: r, suit: suit(0) }, { rank: r, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
  }
  if (kind === 'soft') {
    return { cards: [{ rank: 14, suit: suit(0) }, { rank: total - 11, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
  }
  const a = Math.min(10, total - 2)
  return { cards: [{ rank: a, suit: suit(0) }, { rank: total - a, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
}

function randomSituation(): Situation {
  const bagKeys = Object.keys(store.training.mistakeBag)
  if (bagKeys.length > 0 && props.rng() < 0.5) {
    const key = bagKeys[Math.floor(props.rng() * bagKeys.length)]!
    const rebuilt = fromMistakeKey(key)
    if (rebuilt) return rebuilt
  }
  const upBucket = 2 + Math.floor(props.rng() * 10) // 2..11
  const up: Card = { rank: rankFor(upBucket), suit: suit(2) }
  const roll = props.rng()
  if (roll < 0.25) { // pair
    const p = 2 + Math.floor(props.rng() * 10)
    const r = rankFor(p)
    return { cards: [{ rank: r, suit: suit(0) }, { rank: r, suit: suit(1) }], up }
  }
  if (roll < 0.5) { // soft 13-20
    const total = 13 + Math.floor(props.rng() * 8)
    return { cards: [{ rank: 14, suit: suit(0) }, { rank: total - 11, suit: suit(1) }], up }
  }
  // hard 5-17
  const total = 5 + Math.floor(props.rng() * 13)
  const a = Math.min(10, Math.max(2, total - 2))
  return { cards: [{ rank: a, suit: suit(0) }, { rank: total - a, suit: suit(1) }], up }
}

const situation = ref<Situation>(randomSituation())
/** chosen === null → timed out */
const verdict = ref<{ chosen: Action | null, correct: boolean, book: Action } | null>(null)
const streak = ref(0)

// timed mode (spec §6: "timed, streak") — 10s per situation, toggleable
const TIME_LIMIT_MS = 10_000
const timed = ref(true)
const timeLeft = ref(TIME_LIMIT_MS)
let ticker: ReturnType<typeof setInterval> | null = null

function stopClock(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function startClock(): void {
  stopClock()
  if (!timed.value) return
  timeLeft.value = TIME_LIMIT_MS
  ticker = setInterval(() => {
    timeLeft.value -= 250
    if (timeLeft.value <= 0) {
      stopClock()
      verdict.value = { chosen: null, correct: false, book: bookAction.value }
      streak.value = 0
    }
  }, 250)
}

onMounted(startClock)
onBeforeUnmount(stopClock)
watch(timed, () => {
  if (!verdict.value) startClock()
})

const legal = computed(() =>
  legalActions(newHand([...situation.value.cards], 1000), 1, rules.value))

const bookAction = computed<Action>(() => {
  const cards = situation.value.cards
  const upB = bucketOf(situation.value.up)
  const { total, soft } = handTotal(cards)
  const rec = isPair(cards) && legal.value.includes('split')
    ? bestActionFull({ pair: bucketOf(cards[0]!), total, soft }, upB, rules.value)
    : bestAction({ total, soft, twoCards: true, fromSplit: false }, upB, rules.value)
  return legal.value.includes(rec.action as Action) ? rec.action as Action : (rec.evs.stand! >= rec.evs.hit! ? 'stand' : 'hit')
})

function answer(action: Action): void {
  stopClock()
  const correct = action === bookAction.value
  verdict.value = { chosen: action, correct, book: bookAction.value }
  if (correct) {
    streak.value++
    store.recordDrillBest('strategy-flash', streak.value)
  } else {
    streak.value = 0
  }
}

function next(): void {
  verdict.value = null
  situation.value = randomSituation()
  startClock()
}

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span
        v-if="timed && !verdict"
        class="font-mono"
        data-testid="flash-clock"
      >{{ Math.ceil(timeLeft / 1000) }}s</span>
      <span class="flex items-center gap-2">
        <USwitch
          v-model="timed"
          size="xs"
          label="Timed"
        />
        <span>Best: <span class="font-mono">{{ store.training.drillBests['strategy-flash'] ?? 0 }}</span></span>
      </span>
    </div>

    <div class="flex items-center justify-center gap-6">
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-400">
          Dealer shows
        </p>
        <PlayingCard
          :card="situation.up"
          :face-up="true"
          size="md"
        />
      </div>
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-400">
          Your hand
        </p>
        <div class="flex">
          <PlayingCard
            v-for="(card, i) in situation.cards"
            :key="i"
            :card="card"
            :face-up="true"
            size="md"
            :style="{ marginLeft: i === 0 ? '0' : '-2.5rem' }"
          />
        </div>
      </div>
    </div>

    <div
      v-if="!verdict"
      class="flex flex-wrap justify-center gap-2"
    >
      <UButton
        v-for="action in legal"
        :key="action"
        color="primary"
        :variant="action === 'hit' || action === 'stand' ? 'solid' : 'soft'"
        :data-testid="`flash-${action}`"
        @click="answer(action)"
      >
        {{ ACTION_LABEL[action] }}
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="flash-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdict.correct
          ? `✓ ${ACTION_LABEL[verdict.chosen!]} is the book play`
          : verdict.chosen === null
            ? `⏱ Too slow — book: ${ACTION_LABEL[verdict.book]}`
            : `✗ Book: ${ACTION_LABEL[verdict.book]}` }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="flash-next"
        @click="next"
      >
        Next hand
      </UButton>
    </div>
  </div>
</template>
