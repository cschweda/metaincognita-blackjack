import { describe, expect, it } from 'vitest'
import { dealerShouldDraw, dealerPlay } from '../../../app/utils/engine/dealer'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { handTotal } from '../../../app/utils/engine/hand'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const S17 = PRESETS.VEGAS_STRIP_6D!
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

describe('dealerShouldDraw (MA §12(b), WA §9)', () => {
  it('draws below 17', () => {
    expect(dealerShouldDraw([c(10), c(6)], S17)).toBe(true)
  })

  it('stands on hard 17 under both rules', () => {
    expect(dealerShouldDraw([c(10), c(7)], S17)).toBe(false)
    expect(dealerShouldDraw([c(10), c(7)], H17)).toBe(false)
  })

  it('soft 17: stands under S17, hits under H17 (MA §12(b)(2))', () => {
    const soft17 = [c(14), c(6)]
    expect(dealerShouldDraw(soft17, S17)).toBe(false)
    expect(dealerShouldDraw(soft17, H17)).toBe(true)
  })

  it('stands on soft 18+ under both rules', () => {
    expect(dealerShouldDraw([c(14), c(7)], H17)).toBe(false)
  })
})

describe('dealerPlay', () => {
  it('draws from the provided source until standing', () => {
    const stream = [c(2), c(4)] // 10+6 → +2 = 18? no: 16+2=18 stand after one
    const final = dealerPlay([c(10), c(6)], () => stream.shift()!, S17)
    expect(handTotal(final).total).toBe(18)
    expect(final).toHaveLength(3)
  })

  it('H17 dealer hits soft 17 and can bust', () => {
    const stream = [c(5), c(10)] // A-6 soft 17 → draws 5 → hard 12 → draws 10 → 22 bust
    const final = dealerPlay([c(14), c(6)], () => stream.shift()!, H17)
    expect(handTotal(final).total).toBe(22)
  })

  it('S17 dealer leaves soft 17 untouched', () => {
    const final = dealerPlay([c(14), c(6)], () => {
      throw new Error('must not draw')
    }, S17)
    expect(final).toHaveLength(2)
  })
})
