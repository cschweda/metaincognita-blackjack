import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdvisorPanel from '../../app/components/panels/AdvisorPanel.vue'
import CountPanel from '../../app/components/panels/CountPanel.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { __resetCountingForTests, countShuffle, countVisibleCard } from '../../app/composables/useCounting'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const REC = {
  action: 'stand' as const,
  book: 'stand' as const,
  evs: { stand: -0.18, hit: -0.45 },
  deviation: null,
  reasoning: 'Stand: EV -18.0% beats hit at -45.0%.'
}

describe('AdvisorPanel', () => {
  it('coach mode renders the action, reasoning, and EV table', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: { intensity: 'coach', recommendation: REC, lastDecision: null, showSideBetCaution: false }
    })
    expect(w.find('[data-testid="advisor-action"]').text()).toContain('Stand')
    expect(w.find('[data-testid="advisor-evs"]').text()).toContain('-45.0%')
  })

  it('feedback mode shows the last verdict with cost', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: {
        intensity: 'feedback',
        recommendation: null,
        lastDecision: {
          handIndex: 0, cards: ['10♠', '6♣'], total: 16, soft: false, pair: false, pairBucket: null,
          upBucket: 10, dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null,
          deviationPlay: null, correct: false, costCents: 540, evs: {}, rc: 0, tc: 0, category: 'hard'
        },
        showSideBetCaution: false
      }
    })
    expect(w.find('[data-testid="advisor-feedback"]').text()).toContain('Book: Hit')
    expect(w.find('[data-testid="advisor-feedback"]').text()).toContain('$5.40')
  })

  it('exam mode stays silent and the caution renders when asked', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: { intensity: 'exam', recommendation: REC, lastDecision: null, showSideBetCaution: true }
    })
    expect(w.find('[data-testid="advisor-exam"]').exists()).toBe(true)
    expect(w.find('[data-testid="advisor-action"]').exists()).toBe(false)
    expect(w.find('[data-testid="advisor-sidebet-caution"]').exists()).toBe(true)
  })
})

describe('CountPanel', () => {
  // NOTE: no setActivePinia(createPinia()) in beforeEach for the shown/self-check tests —
  // mountSuspended mounts inside the Nuxt app which has its own Pinia. The test body must
  // use the same Nuxt Pinia instance or the component sees an empty store (same pattern as
  // integration.test.ts).
  beforeEach(() => {
    localStorage.clear()
    __resetCountingForTests()
    // Reset training.countChecks so counts don't leak between tests in the shared Nuxt Pinia instance
    const store = useBlackjackStore()
    store.training.countChecks.splice(0)
  })

  function start(count: 'shown' | 'self-check' | 'off') {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
      flair: false, botIds: [], advisor: 'feedback', count, advancedDeviations: false
    }, 50_000)
    return store
  }

  it('shown mode renders live values', async () => {
    start('shown')
    countVisibleCard({ rank: 5, suit: 'spades' })
    const w = await mountSuspended(CountPanel)
    expect(w.find('[data-testid="count-values"]').text()).toContain('+1')
  })

  it('self-check mode hides values and grades a check', async () => {
    const store = start('self-check')
    countVisibleCard({ rank: 5, suit: 'spades' })
    const w = await mountSuspended(CountPanel)
    expect(w.find('[data-testid="count-values"]').exists()).toBe(false)
    await w.find('[data-testid="count-input"]').setValue('1')
    await w.find('[data-testid="count-check"]').trigger('click')
    expect(w.find('[data-testid="count-verdict"]').text()).toContain('✓')
    expect(store.training.countChecks).toHaveLength(1)
  })

  it('off mode renders nothing', async () => {
    start('off')
    const w = await mountSuspended(CountPanel)
    expect(w.html()).not.toContain('Hi-Lo')
  })

  it('renders the shuffle quiz after a shuffle in self-check mode and grades the answer', async () => {
    const store = start('self-check')
    countVisibleCard({ rank: 5, suit: 'spades' })
    countShuffle()
    const w = await mountSuspended(CountPanel)
    expect(w.find('[data-testid="shuffle-quiz"]').exists()).toBe(true)
    await w.find('[data-testid="shuffle-quiz-input"]').setValue('1')
    await w.find('[data-testid="shuffle-quiz-submit"]').trigger('click')
    expect(store.training.countChecks).toHaveLength(1)
    expect(w.find('[data-testid="shuffle-quiz"]').exists()).toBe(false) // quiz cleared after answering
  })
})
