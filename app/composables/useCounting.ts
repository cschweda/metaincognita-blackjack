import { computed, ref } from 'vue'
import type { Card } from '../utils/engine/cards'
import { advantageEstimate, hiLoValue } from '../utils/engine/counting'
import { houseEdge } from '../utils/engine/basicStrategy'
import { useBlackjackStore } from '../stores/useBlackjackStore'

// ── module state (client singleton, mirrors useGameLoop's pattern) ───────────
const running = ref(0)
const cardsSeen = ref(0)
const shuffleQuiz = ref<{ actual: number } | null>(null)
const lastCheck = ref<{ entered: number, actual: number, correct: boolean } | null>(null)

export function __resetCountingForTests(): void {
  running.value = 0
  cardsSeen.value = 0
  shuffleQuiz.value = null
  lastCheck.value = null
}

/** Called by useGameLoop when a face-up card is PRESENTED — pacing-safe (Architecture Notes). */
export function countVisibleCard(card: Card): void {
  running.value += hiLoValue(card)
  cardsSeen.value++
  useBlackjackStore().setCountState({ running: running.value, cardsSeen: cardsSeen.value })
}

/** Called by useGameLoop when a shuffle is presented. Self-check mode quizzes the final RC. */
export function countShuffle(): void {
  const store = useBlackjackStore()
  if (cardsSeen.value > 0 && store.settings?.count === 'self-check') {
    shuffleQuiz.value = { actual: running.value }
  }
  running.value = 0
  cardsSeen.value = 0
  store.setCountState({ running: 0, cardsSeen: 0 })
}

/** After a mid-round restore: pick the count back up from the persisted session. */
export function restoreCounting(): void {
  const s = useBlackjackStore().countState
  running.value = s?.running ?? 0
  cardsSeen.value = s?.cardsSeen ?? 0
  shuffleQuiz.value = null
  lastCheck.value = null
}

export function resetCounting(): void {
  running.value = 0
  cardsSeen.value = 0
  shuffleQuiz.value = null
  lastCheck.value = null
  useBlackjackStore().setCountState(null)
}

export function useCounting() {
  const store = useBlackjackStore()
  const rc = computed(() => running.value)
  /** Human tray-estimation model: decks remaining to the nearest half deck (spec §4.8). */
  const decksRemaining = computed(() => {
    const decks = store.settings?.rules.decks ?? 6
    const remaining = (decks * 52 - cardsSeen.value) / 52
    return Math.max(0.5, Math.round(remaining * 2) / 2)
  })
  const tc = computed(() => running.value / decksRemaining.value)
  /** Anchored to the active rules' computed edge — the same model the Bet Lab prices ramps
   *  with, so both surfaces read one number. Educational estimate, not betting advice (§4.8). */
  const baseEdge = computed(() => {
    const rules = store.settings?.rules
    return rules ? houseEdge(rules) : undefined
  })
  const advantage = computed(() => advantageEstimate(tc.value, baseEdge.value))

  function checkCount(entered: number): boolean {
    if (shuffleQuiz.value) return false // a pending shuffle quiz owns the next answer
    const actual = running.value
    const correct = entered === actual
    lastCheck.value = { entered, actual, correct }
    store.recordCountCheck(entered, actual)
    return correct
  }

  function answerShuffleQuiz(entered: number): boolean {
    if (!shuffleQuiz.value) return false
    const actual = shuffleQuiz.value.actual
    const correct = entered === actual
    lastCheck.value = { entered, actual, correct }
    store.recordCountCheck(entered, actual)
    shuffleQuiz.value = null
    return correct
  }

  return {
    rc, tc, decksRemaining, advantage,
    cardsSeen: computed(() => cardsSeen.value),
    shuffleQuiz: computed(() => shuffleQuiz.value),
    lastCheck: computed(() => lastCheck.value),
    checkCount, answerShuffleQuiz
  }
}
