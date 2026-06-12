import { describe, expect, it } from 'vitest'
import {
  adherenceRows, bankrollSeries, botPnl, countAccuracy, evLostCents,
  heroPnlCents, humanizeMistake, sideBetLedger, topMistakes
} from '../../app/utils/analysis'
import type { RoundRecord, TrainingStats } from '../../app/stores/useBlackjackStore'

const ROUNDS: RoundRecord[] = [
  {
    round: 1, at: 1, visibleCards: [],
    dealer: { cards: [], total: 20, blackjack: false, busted: false },
    spots: [
      {
        occupant: 'hero',
        hands: [{ cards: [], bet: 2500, outcome: 'lose', net: -2500, doubled: false, fromSplit: false }],
        sideBets: [{ name: '21+3', stake: 500, net: -500, label: 'no hand' }],
        insuranceNet: 0
      },
      {
        occupant: 'bea',
        hands: [{ cards: [], bet: 1000, outcome: 'win', net: 1000, doubled: false, fromSplit: false }],
        sideBets: [], insuranceNet: 0
      }
    ],
    heroDecisions: [
      {
        handIndex: 0, cards: [], total: 16, soft: false, pair: false, pairBucket: null, upBucket: 10,
        dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null, deviationPlay: null,
        correct: false, costCents: 540, evs: {}, rc: 0, tc: 0, category: 'hard'
      }
    ],
    heroInsurance: null
  },
  {
    round: 2, at: 2, visibleCards: [],
    dealer: { cards: [], total: 22, blackjack: false, busted: true },
    spots: [{
      occupant: 'hero',
      hands: [{ cards: [], bet: 2500, outcome: 'win', net: 2500, doubled: false, fromSplit: false }],
      sideBets: [], insuranceNet: -100
    }],
    heroDecisions: [],
    heroInsurance: { took: 200, book: 'decline', correct: false, rc: 0, tc: 0 }
  }
]

const TRAINING: TrainingStats = {
  adherence: {
    hard: { decisions: 10, correct: 8 },
    soft: { decisions: 0, correct: 0 },
    pair: { decisions: 2, correct: 2 },
    surrender: { decisions: 1, correct: 0 },
    insurance: { decisions: 2, correct: 1 }
  },
  mistakeBag: { 'hard|16|10': 3, 'pair|8|10': 1, 'soft|18|9': 2 },
  countChecks: [
    { at: 1, entered: 5, actual: 5 },
    { at: 2, entered: 4, actual: 5 },
    { at: 3, entered: 1, actual: 5 }
  ],
  drillBests: {}
}

describe('analysis helpers', () => {
  it('adherenceRows computes percentages and reports empty categories', () => {
    const rows = adherenceRows(TRAINING)
    const hard = rows.find(r => r.category === 'hard')!
    expect(hard.pct).toBe(80)
    expect(rows.find(r => r.category === 'soft')!.decisions).toBe(0)
  })

  it('topMistakes sorts by count and humanizes machine keys', () => {
    const top = topMistakes(TRAINING.mistakeBag, 2)
    expect(top).toHaveLength(2)
    expect(top[0]).toEqual({ key: 'hard|16|10', label: 'Hard 16 vs T', count: 3 })
    expect(humanizeMistake('pair|8|10')).toBe('Pair of 8s vs T')
    expect(humanizeMistake('soft|18|9')).toBe('Soft 18 vs 9')
    expect(humanizeMistake('hard|12|11')).toBe('Hard 12 vs A')
  })

  it('evLostCents sums decision costs; heroPnlCents sums hero nets', () => {
    expect(evLostCents(ROUNDS)).toBe(540)
    expect(heroPnlCents(ROUNDS)).toBe(-2500 - 500 + 2500 - 100)
  })

  it('countAccuracy buckets exact and within-one', () => {
    expect(countAccuracy(TRAINING.countChecks)).toEqual({ total: 3, exact: 1, withinOne: 2 })
  })

  it('sideBetLedger aggregates by bet name', () => {
    expect(sideBetLedger(ROUNDS)).toEqual([{ name: '21+3', staked: 500, net: -500 }])
  })

  it('bankrollSeries reconstructs backwards from the current bankroll', () => {
    // current 49_400; round2 net +2400 → before round2 47_000; round1 net −3000 → start 50_000
    expect(bankrollSeries(ROUNDS, 49_400)).toEqual([50_000, 47_000, 49_400])
  })

  it('botPnl aggregates non-hero spots by persona', () => {
    expect(botPnl(ROUNDS)).toEqual([{ id: 'bea', net: 1000 }])
  })
})
