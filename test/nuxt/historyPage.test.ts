import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import HistoryPage from '../../app/pages/history.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import type { RoundRecord } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const ROUND: RoundRecord = {
  round: 1,
  at: 1760000000000,
  dealer: { cards: ['10♦', '7♠'], total: 17, blackjack: false, busted: false },
  visibleCards: ['10♠', '6♣', '10♦', '7♠'],
  spots: [{
    occupant: 'hero',
    hands: [{ cards: ['10♠', '6♣'], bet: 2500, outcome: 'lose', net: -2500, doubled: false, fromSplit: false }],
    sideBets: [],
    insuranceNet: 0
  }],
  heroDecisions: [{
    handIndex: 0, cards: ['10♠', '6♣'], total: 16, soft: false, pair: false, pairBucket: null,
    upBucket: 10, dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null, deviationPlay: null,
    correct: false, costCents: 540, evs: { hit: -0.41, stand: -0.54 }, rc: 1, tc: 0.2, category: 'hard'
  }],
  heroInsurance: null
}

describe('history page', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the empty state without rounds', async () => {
    const store = useBlackjackStore()
    store.clearAll()
    const w = await mountSuspended(HistoryPage)
    expect(w.find('[data-testid="history-empty"]').exists()).toBe(true)
  })

  it('renders a graded round with cost and counts', async () => {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
      flair: false, botIds: [], advisor: 'feedback', count: 'shown', advancedDeviations: false
    }, 50_000)
    store.recordRound(ROUND)
    const w = await mountSuspended(HistoryPage)
    const d = w.find('[data-testid="decision-1-0"]')
    expect(d.text()).toContain('✗')
    expect(d.text()).toContain('book: hit')
    expect(d.text()).toContain('$5.40')
    expect(d.text()).toContain('TC 0.2')
    expect(w.text()).toContain('−$25')
  })
})
