import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useCounting, countVisibleCard, countShuffle, resetCounting, restoreCounting,
  __resetCountingForTests
} from '../../app/composables/useCounting'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import { advantageEstimate } from '../../app/utils/engine/counting'
import { houseEdge } from '../../app/utils/engine/basicStrategy'
import type { Card } from '../../app/utils/engine/cards'

const c = (rank: number): Card => ({ rank, suit: 'spades' })

function startedStore(count: 'shown' | 'self-check' | 'off' = 'self-check') {
  const store = useBlackjackStore()
  store.initSession({
    rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
    flair: false, botIds: [], advisor: 'feedback', count, advancedDeviations: false
  }, 50_000)
  return store
}

describe('useCounting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetCountingForTests()
  })

  it('accumulates Hi-Lo from presented cards and computes a half-deck TC', () => {
    startedStore('shown')
    const counting = useCounting()
    countVisibleCard(c(5)) // +1
    countVisibleCard(c(6)) // +1
    countVisibleCard(c(14)) // −1
    expect(counting.rc.value).toBe(1)
    expect(counting.cardsSeen.value).toBe(3)
    expect(counting.decksRemaining.value).toBe(6) // 309/52 = 5.94 → 6.0 (nearest half deck)
    expect(counting.tc.value).toBeCloseTo(1 / 6)
  })

  it('advantage anchors to the active rules\' computed edge — a 6:5 table reads worse than the folk 0.5% base', () => {
    const store = useBlackjackStore()
    const rules = cloneRules(PRESETS.SINGLE_DECK_65!)
    store.initSession({
      rules, mode: 'quick', speed: 'normal',
      flair: false, botIds: [], advisor: 'feedback', count: 'shown', advancedDeviations: false
    }, 50_000)
    const counting = useCounting()
    countVisibleCard(c(5)) // RC +1
    expect(counting.advantage.value).toBeCloseTo(advantageEstimate(counting.tc.value, houseEdge(rules)), 10)
    expect(counting.advantage.value).toBeLessThan((counting.tc.value - 1) * 0.005)
  })

  it('checkCount grades exactly and logs to the store', () => {
    const store = startedStore()
    const counting = useCounting()
    countVisibleCard(c(2))
    expect(counting.checkCount(1)).toBe(true)
    expect(counting.checkCount(0)).toBe(false)
    expect(store.training.countChecks).toHaveLength(2)
    expect(counting.lastCheck.value).toMatchObject({ entered: 0, actual: 1, correct: false })
  })

  it('shuffle in self-check mode arms the quiz with the pre-shuffle RC, then resets', () => {
    const store = startedStore('self-check')
    const counting = useCounting()
    countVisibleCard(c(4))
    countVisibleCard(c(3))
    countShuffle()
    expect(counting.rc.value).toBe(0)
    expect(counting.shuffleQuiz.value).toEqual({ actual: 2 })
    expect(counting.answerShuffleQuiz(2)).toBe(true)
    expect(counting.shuffleQuiz.value).toBeNull()
    expect(store.training.countChecks).toHaveLength(1)
  })

  it('shuffle in shown mode resets silently (no quiz)', () => {
    startedStore('shown')
    const counting = useCounting()
    countVisibleCard(c(4))
    countShuffle()
    expect(counting.shuffleQuiz.value).toBeNull()
    expect(counting.rc.value).toBe(0)
  })

  it('persists count state through the store and restores it', () => {
    const store = startedStore('shown')
    countVisibleCard(c(5))
    countVisibleCard(c(5))
    expect(store.countState).toEqual({ running: 2, cardsSeen: 2 })

    __resetCountingForTests() // simulated refresh: module state gone, store survives
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(2)
    expect(counting.cardsSeen.value).toBe(2)
  })

  it('resetCounting zeroes everything including stored state', () => {
    const store = startedStore('shown')
    countVisibleCard(c(5))
    resetCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(0)
    expect(store.countState).toBeNull()
  })

  it('grades a wrong shuffle-quiz answer and still clears the quiz', () => {
    const store = startedStore('self-check')
    const counting = useCounting()
    countVisibleCard(c(4))
    countShuffle()
    expect(counting.checkCount(0)).toBe(false) // pending quiz blocks regular checks
    expect(counting.answerShuffleQuiz(5)).toBe(false)
    expect(counting.lastCheck.value).toMatchObject({ entered: 5, actual: 1, correct: false })
    expect(counting.shuffleQuiz.value).toBeNull()
    expect(store.training.countChecks).toHaveLength(1) // blocked check did not log
  })

  it('answerShuffleQuiz without a pending quiz is a no-op returning false', () => {
    startedStore('self-check')
    const counting = useCounting()
    expect(counting.answerShuffleQuiz(3)).toBe(false)
    expect(counting.lastCheck.value).toBeNull()
  })
})

describe('restore and reset', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetCountingForTests()
  })

  it('restoreCounting backfills zeros when nothing was persisted', () => {
    const store = useBlackjackStore()
    store.setCountState(null)
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(0)
    expect(counting.cardsSeen.value).toBe(0)
  })

  it('restoreCounting picks up persisted state; resetCounting clears it in the store', () => {
    const store = useBlackjackStore()
    store.setCountState({ running: 5, cardsSeen: 30 })
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(5)
    expect(counting.cardsSeen.value).toBe(30)
    resetCounting()
    expect(counting.rc.value).toBe(0)
    expect(store.countState).toBeNull()
  })
})
