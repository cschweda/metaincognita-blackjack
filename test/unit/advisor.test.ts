import { describe, expect, it } from 'vitest'
import {
  adviseHand, adviseInsurance, decisionCost, pctEV, SIDE_BET_CAUTION, summarizeRound
} from '../../app/utils/advisor'
import type { RoundRecord } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { Card } from '../../app/utils/engine/cards'

const c = (rank: number, suit: Card['suit'] = 'spades'): Card => ({ rank, suit })
const VEGAS = PRESETS.VEGAS_STRIP_6D! // S17, no surrender
const MA = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!) // S17, late surrender
  return r
})()

describe('adviseHand', () => {
  it('recommends book hit on 16 vs 10 when surrender is unavailable', () => {
    const rec = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false },
      c(10, 'clubs'), VEGAS, 0, false, ['hit', 'stand']
    )
    expect(rec.book).toBe('hit')
    expect(rec.action).toBe('hit')
    expect(rec.deviation).toBeNull()
    expect(rec.evs.hit).toBeDefined()
    expect(rec.reasoning).toContain('Hit')
  })

  it('recommends surrender 16 vs 10 under late-surrender rules', () => {
    const rec = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false },
      c(10, 'clubs'), MA, 0, false, ['hit', 'stand', 'double', 'surrender']
    )
    expect(rec.book).toBe('surrender')
  })

  it('recommends the split on 8,8 vs 10 when split is legal', () => {
    const rec = adviseHand(
      { cards: [c(8), c(8, 'hearts')], fromSplit: false },
      c(10, 'clubs'), VEGAS, 0, false, ['hit', 'stand', 'split']
    )
    expect(rec.book).toBe('split')
    expect(rec.evs.split).toBeDefined()
  })

  it('clamps to the best legal action when the book play is unavailable', () => {
    // book for hard 11 vs 6 is double; with double illegal (3+ cards), falls back by EV (hit)
    const rec = adviseHand(
      { cards: [c(2), c(4, 'hearts'), c(5, 'diamonds')], fromSplit: false },
      c(6, 'clubs'), VEGAS, 0, false, ['hit', 'stand']
    )
    expect(rec.book).toBe('hit')
  })

  it('applies an Illustrious 18 deviation when advanced and the count is there', () => {
    // 16 vs 10: stand at TC ≥ 0 (I18) — book without surrender is hit
    const recLow = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false },
      c(10, 'clubs'), VEGAS, -1, true, ['hit', 'stand']
    )
    expect(recLow.action).toBe('hit')
    const recHigh = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false },
      c(10, 'clubs'), VEGAS, 1, true, ['hit', 'stand']
    )
    expect(recHigh.action).toBe('stand')
    expect(recHigh.book).toBe('hit')
    expect(recHigh.deviation?.id).toBe('16vT-stand')
    expect(recHigh.reasoning).toContain('Count call')
  })

  it('includes Fab 4 only under late surrender', () => {
    // 15 vs 9 at TC +2 → surrender (Fab 4) when legal
    const rec = adviseHand(
      { cards: [c(10), c(5, 'hearts')], fromSplit: false },
      c(9, 'clubs'), MA, 2, true, ['hit', 'stand', 'surrender']
    )
    expect(rec.deviation?.id).toBe('fab-15v9')
    expect(rec.action).toBe('surrender')
  })

  it('skips a deviation whose play is not legal (T,T vs 6 at TC 4 with split unavailable)', () => {
    const rec = adviseHand(
      { cards: [c(10), c(10, 'hearts')], fromSplit: false },
      c(6, 'clubs'), VEGAS, 4, true, ['hit', 'stand']
    )
    expect(rec.deviation).toBeNull()
    expect(rec.action).toBe(rec.book)
    expect(rec.action).toBe('stand')
  })
})

describe('adviseInsurance / cost / formatting', () => {
  it('declines insurance by the book, takes it at TC ≥ +3 in advanced mode', () => {
    expect(adviseInsurance(0, false).take).toBe(false)
    expect(adviseInsurance(5, false).take).toBe(false) // advanced off → never
    expect(adviseInsurance(3, true).take).toBe(true)
    expect(adviseInsurance(2.9, true).take).toBe(false)
  })

  it('decisionCost prices a mistake against the book EV in cents', () => {
    const evs = { hit: -0.4, stand: -0.55 }
    expect(decisionCost(evs, 'stand', 'hit', 1000)).toBe(150) // 0.15 × $10
    expect(decisionCost(evs, 'hit', 'hit', 1000)).toBe(0)
    expect(decisionCost(evs, 'split', 'hit', 1000)).toBe(0) // unpriceable → 0
  })

  it('pctEV formats fractions as signed-free percentages', () => {
    expect(pctEV(-0.123)).toBe('-12.3%')
    expect(pctEV(undefined)).toBe('—')
    expect(SIDE_BET_CAUTION.length).toBeGreaterThan(0)
  })
})

describe('summarizeRound', () => {
  type Hand = { cards: string[], bet: number, outcome: string, net: number, doubled: boolean, fromSplit: boolean, total?: number, soft?: boolean }
  function round(overrides: {
    dealer?: Partial<RoundRecord['dealer']>
    hands?: Partial<Hand>[]
    sideBets?: Array<{ name: string, stake: number, net: number, label: string }>
    insuranceNet?: number
    heroDecisions?: RoundRecord['heroDecisions']
    heroInsurance?: RoundRecord['heroInsurance']
  } = {}): RoundRecord {
    const baseHand: Hand = {
      cards: ['10♠', '8♣'], bet: 2500, outcome: 'win', net: 2500,
      doubled: false, fromSplit: false, total: 18, soft: false
    }
    return {
      round: 1, at: 1, visibleCards: [],
      dealer: { cards: ['10♦', '7♠'], total: 17, blackjack: false, busted: false, ...overrides.dealer },
      spots: [{
        occupant: 'hero',
        hands: (overrides.hands ?? [{}]).map(h => ({ ...baseHand, ...h })),
        sideBets: overrides.sideBets ?? [],
        insuranceNet: overrides.insuranceNet ?? 0
      }],
      heroDecisions: overrides.heroDecisions ?? [],
      heroInsurance: overrides.heroInsurance ?? null
    }
  }

  it('summarizes a dealer-bust win with the why', () => {
    const s = summarizeRound(round({ dealer: { total: 23, busted: true } }))!
    expect(s.outcome).toBe('win')
    expect(s.netCents).toBe(2500)
    expect(s.headline).toBe('Won $25')
    expect(s.why).toContain('Dealer busted with 23')
    expect(s.why).toContain('18')
  })

  it('summarizes a loss against a higher dealer hand', () => {
    const s = summarizeRound(round({
      dealer: { total: 20 },
      hands: [{ outcome: 'lose', net: -2500 }]
    }))!
    expect(s.headline).toBe('Lost $25')
    expect(s.why).toContain('Dealer\'s 20')
    expect(s.why).toContain('your 18')
  })

  it('summarizes a push, a hero bust, and a surrender', () => {
    const push = summarizeRound(round({ hands: [{ outcome: 'push', net: 0, total: 17 }] }))!
    expect(push.headline).toBe('Push — bet returned')
    const bust = summarizeRound(round({ hands: [{ outcome: 'lose', net: -2500, total: 23 }] }))!
    expect(bust.why).toContain('your 23 busted')
    const surr = summarizeRound(round({ hands: [{ outcome: 'surrender', net: -1250 }] }))!
    expect(surr.why.toLowerCase()).toContain('surrender')
    expect(surr.headline).toBe('Lost $12.50')
  })

  it('summarizes blackjack and dealer blackjack', () => {
    const bj = summarizeRound(round({ hands: [{ outcome: 'blackjack', net: 3750, total: 21 }] }))!
    expect(bj.outcome).toBe('blackjack')
    expect(bj.headline).toBe('Blackjack! +$37.50')
    const dbj = summarizeRound(round({
      dealer: { total: 21, blackjack: true },
      hands: [{ outcome: 'lose', net: -2500 }]
    }))!
    expect(dbj.why).toContain('Dealer had blackjack')
  })

  it('summarizes split rounds by net with per-hand results', () => {
    const s = summarizeRound(round({
      dealer: { total: 19 },
      hands: [
        { outcome: 'win', net: 2500, total: 20, fromSplit: true },
        { outcome: 'lose', net: -2500, total: 18, fromSplit: true },
        { outcome: 'win', net: 2500, total: 21, fromSplit: true }
      ]
    }))!
    expect(s.outcome).toBe('mixed')
    expect(s.headline).toBe('Split hands: +$25')
    expect(s.why).toContain('hand 1')
    expect(s.why).toContain('hand 3')
  })

  it('orders moments mistakes-first with the trainer voice and caps at 4', () => {
    const d = (over: Record<string, unknown>) => ({
      handIndex: 0, cards: ['10♠', '2♣'], total: 12, soft: false, pair: false, pairBucket: null,
      upBucket: 10, dealerUp: '10♦', action: 'stand' as const, book: 'hit' as const,
      deviationId: null, deviationPlay: null, correct: false, costCents: 540,
      evs: {}, rc: 0, tc: 0, category: 'hard' as const, ...over
    })
    const s = summarizeRound(round({
      heroDecisions: [
        d({ correct: true, action: 'stand', book: 'stand', total: 16, dealerUp: '6♣', upBucket: 6, costCents: 0 }),
        d({}), // the mistake
        d({ correct: true, action: 'hit', book: 'hit', total: 9, dealerUp: 'A♠', upBucket: 11, costCents: 0 }),
        d({ correct: true, action: 'double', book: 'double', total: 11, dealerUp: '6♣', upBucket: 6, costCents: 0 }),
        d({ correct: true, action: 'hit', book: 'hit', total: 12, dealerUp: '2♦', upBucket: 2, costCents: 0 })
      ]
    }))!
    expect(s.moments).toHaveLength(4)
    expect(s.moments[0]).toBe('Book: draw on hard 12 vs 10 — you stood (cost $5.40)')
    expect(s.moments[1]).toBe('Optimal: stand on hard 16 vs 6 ✓')
  })

  it('notes incorrect insurance and degrades gracefully without hand totals', () => {
    const s = summarizeRound(round({
      heroInsurance: { took: 1250, book: 'decline', correct: false, rc: 0, tc: 0 },
      insuranceNet: -1250
    }))!
    expect(s.moments.some(m => m.toLowerCase().includes('insurance'))).toBe(true)
    const old = summarizeRound(round({ hands: [{ total: undefined, soft: undefined }] }))!
    expect(old.why.length).toBeGreaterThan(0) // no crash, still explains
  })

  it('returns null without a hero spot', () => {
    const r = round()
    r.spots = []
    expect(summarizeRound(r)).toBeNull()
  })
})
