import { describe, expect, it } from 'vitest'
import { handTotal, isBust, isBlackjack, isPair } from '../../../app/utils/engine/hand'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

describe('handTotal', () => {
  it('sums hard hands', () => {
    expect(handTotal([c(10), c(7)])).toEqual({ total: 17, soft: false })
    expect(handTotal([c(2), c(3), c(4)])).toEqual({ total: 9, soft: false })
  })

  it('counts ace as 11 when it fits (soft)', () => {
    expect(handTotal([c(14), c(6)])).toEqual({ total: 17, soft: true }) // A-6 soft 17 (WA §10)
    expect(handTotal([c(14), c(14)])).toEqual({ total: 12, soft: true }) // A-A = 12, one ace as 11
  })

  it('demotes aces to 1 to avoid busting', () => {
    expect(handTotal([c(14), c(7), c(9)])).toEqual({ total: 17, soft: false }) // A-7-9 hard 17 (WA §10 example)
    expect(handTotal([c(14), c(14), c(9)])).toEqual({ total: 21, soft: true })
    expect(handTotal([c(14), c(10), c(5), c(7)])).toEqual({ total: 23, soft: false }) // busted hard
  })

  it('soft→hard transition when a hit pushes past 21', () => {
    expect(handTotal([c(14), c(6), c(10)])).toEqual({ total: 17, soft: false })
  })
})

describe('isBust', () => {
  it('flags totals over 21', () => {
    expect(isBust([c(10), c(10), c(5)])).toBe(true)
    expect(isBust([c(14), c(10), c(10)])).toBe(false) // 21
  })
})

describe('isBlackjack', () => {
  it('is ace + ten-value as the initial two cards', () => {
    expect(isBlackjack([c(14), c(13)], false)).toBe(true) // A-K
    expect(isBlackjack([c(14), c(10)], false)).toBe(true) // A-10
  })

  it('is NOT blackjack after a split (MA §1, WA splitting note)', () => {
    expect(isBlackjack([c(14), c(13)], true)).toBe(false)
  })

  it('is NOT blackjack for 21 in three cards', () => {
    expect(isBlackjack([c(7), c(7), c(7)], false)).toBe(false)
  })
})

describe('isPair', () => {
  it('pairs by equal point value (MA §11(a)) — K+10 is splittable', () => {
    expect(isPair([c(13), c(10)])).toBe(true) // K + 10
    expect(isPair([c(8, 'hearts'), c(8, 'clubs')])).toBe(true)
    expect(isPair([c(14), c(14)])).toBe(true)
    expect(isPair([c(9), c(10)])).toBe(false)
    expect(isPair([c(8), c(8), c(8)])).toBe(false) // only initial two cards
  })
})
