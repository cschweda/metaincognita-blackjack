import { describe, expect, it } from 'vitest'
import {
  adviseHand, adviseInsurance, decisionCost, pctEV, SIDE_BET_CAUTION
} from '../../app/utils/advisor'
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
