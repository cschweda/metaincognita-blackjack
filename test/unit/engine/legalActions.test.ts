import { describe, expect, it } from 'vitest'
import { newHand, legalActions } from '../../../app/utils/engine/hand'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const VEGAS = PRESETS.VEGAS_STRIP_6D! // S17, DAS, no surrender, any2
const MA = PRESETS.MA_205CMR! // late surrender, 4 split hands

describe('legalActions — opening hand', () => {
  it('offers hit/stand/double on any first two cards under any2', () => {
    const h = newHand([c(5), c(9)], 1000)
    expect(legalActions(h, 1, VEGAS).sort()).toEqual(['double', 'hit', 'stand'])
  })

  it('adds split on pairs (point-value pairs included)', () => {
    const h = newHand([c(13), c(10)], 1000) // K + 10
    expect(legalActions(h, 1, VEGAS)).toContain('split')
  })

  it('adds surrender only under late-surrender rules, only as first decision', () => {
    const h = newHand([c(10), c(6)], 1000)
    expect(legalActions(h, 1, MA)).toContain('surrender')
    expect(legalActions(h, 1, VEGAS)).not.toContain('surrender')
    const threeCards = newHand([c(2), c(3), c(5)], 1000)
    expect(legalActions(threeCards, 1, MA)).not.toContain('surrender')
  })

  it('forces stand as the only action on 21', () => {
    const h = newHand([c(7), c(7), c(7)], 1000)
    expect(legalActions(h, 1, VEGAS)).toEqual(['stand'])
  })

  it('returns no actions on a busted or resolved hand', () => {
    expect(legalActions(newHand([c(10), c(9), c(5)], 1000), 1, VEGAS)).toEqual([])
    const h = newHand([c(10), c(9)], 1000)
    h.resolved = true
    expect(legalActions(h, 1, VEGAS)).toEqual([])
  })
})

describe('legalActions — double restrictions', () => {
  it('10-11 rule blocks 9 and all soft totals (WA operator restriction)', () => {
    const r = cloneRules(VEGAS)
    r.doubleOn = '10-11'
    expect(legalActions(newHand([c(4), c(5)], 1000), 1, r)).not.toContain('double') // hard 9
    expect(legalActions(newHand([c(14), c(5)], 1000), 1, r)).not.toContain('double') // soft 16
    expect(legalActions(newHand([c(6), c(5)], 1000), 1, r)).toContain('double') // hard 11
  })

  it('9-11 rule allows hard 9 but not hard 8', () => {
    const r = cloneRules(VEGAS)
    r.doubleOn = '9-11'
    expect(legalActions(newHand([c(4), c(5)], 1000), 1, r)).toContain('double')
    expect(legalActions(newHand([c(3), c(5)], 1000), 1, r)).not.toContain('double')
  })

  it('blocks double after split when DAS is off (MA §10(a) contra)', () => {
    const r = cloneRules(VEGAS)
    r.doubleAfterSplit = false
    const h = newHand([c(5), c(6)], 1000, { fromSplit: true })
    expect(legalActions(h, 2, r)).not.toContain('double')
    expect(legalActions(h, 2, VEGAS)).toContain('double') // DAS on
  })

  it('never offers surrender or double on a split hand', () => {
    const h = newHand([c(10), c(6)], 1000, { fromSplit: true })
    expect(legalActions(h, 2, MA)).not.toContain('surrender')
  })
})

describe('legalActions — splitting limits', () => {
  it('caps splits at maxSplitHands (MA §11(e): 4; WA: 3)', () => {
    const pair = newHand([c(8, 'hearts'), c(8, 'clubs')], 1000, { fromSplit: true })
    expect(legalActions(pair, 3, MA)).toContain('split') // 3 hands → can make 4th
    expect(legalActions(pair, 4, MA)).not.toContain('split')
    expect(legalActions(pair, 3, PRESETS.WA_CARDROOM!)).not.toContain('split')
  })

  it('split aces receive one card and auto-resolve (MA §11(c)(2))', () => {
    const h = newHand([c(14), c(9)], 1000, { fromSplit: true, splitAces: true })
    expect(legalActions(h, 2, MA)).toEqual([])
  })

  it('resplit aces only when resplitAces is on', () => {
    const aces = newHand([c(14, 'hearts'), c(14, 'clubs')], 1000, { fromSplit: true, splitAces: true })
    expect(legalActions(aces, 2, MA)).toEqual([]) // MA preset prohibits
    const r = cloneRules(MA)
    r.resplitAces = true
    expect(legalActions(aces, 2, r)).toEqual(['split'])
  })
})
