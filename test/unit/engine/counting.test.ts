import { describe, expect, it } from 'vitest'
import { hiLoValue, CountTracker, ILLUSTRIOUS_18, deviationFor } from '../../../app/utils/engine/counting'
import { buildDeck } from '../../../app/utils/engine/cards'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

describe('hiLoValue', () => {
  it('tags 2-6 as +1, 7-9 as 0, tens and aces as -1', () => {
    expect(hiLoValue(c(2))).toBe(1)
    expect(hiLoValue(c(6))).toBe(1)
    expect(hiLoValue(c(7))).toBe(0)
    expect(hiLoValue(c(9))).toBe(0)
    expect(hiLoValue(c(10))).toBe(-1)
    expect(hiLoValue(c(13))).toBe(-1)
    expect(hiLoValue(c(14))).toBe(-1)
  })

  it('is balanced: a full deck sums to zero', () => {
    expect(buildDeck().reduce((s, card) => s + hiLoValue(card), 0)).toBe(0)
  })
})

describe('CountTracker', () => {
  it('accumulates the running count from observed cards', () => {
    const t = new CountTracker()
    ;[c(5), c(3), c(13), c(8)].forEach(card => t.observe(card)) // +1 +1 -1 0
    expect(t.running).toBe(1)
    expect(t.cardsSeen).toBe(4)
  })

  it('converts to true count with a clamped divisor', () => {
    const t = new CountTracker()
    for (let i = 0; i < 6; i++) t.observe(c(4)) // RC +6
    expect(t.trueCount(3)).toBeCloseTo(2, 5)
    expect(t.trueCount(0.25)).toBeCloseTo(12, 5) // divisor clamps at 0.5
  })

  it('estimates advantage ≈ (TC − 1) × 0.5%', () => {
    const t = new CountTracker()
    for (let i = 0; i < 6; i++) t.observe(c(4))
    expect(t.advantageEstimate(2)).toBeCloseTo(0.01, 5) // TC 3 → +1.0%
  })

  it('resets at shuffle', () => {
    const t = new CountTracker()
    t.observe(c(5))
    t.reset()
    expect(t.running).toBe(0)
    expect(t.cardsSeen).toBe(0)
  })
})

describe('Illustrious 18 deviations', () => {
  it('includes insurance at TC ≥ +3 as the first entry', () => {
    expect(ILLUSTRIOUS_18[0]!.id).toBe('insurance')
    expect(ILLUSTRIOUS_18[0]!.minTrueCount).toBe(3)
  })

  it('16 vs T stands at TC ≥ 0, reverts to book below', () => {
    expect(deviationFor({ total: 16, soft: false, pair: null }, 10, 1)?.play).toBe('stand')
    expect(deviationFor({ total: 16, soft: false, pair: null }, 10, -1)).toBeNull()
  })

  it('12 vs 3 stands at TC ≥ 2; 13 vs 2 hits below TC −1', () => {
    expect(deviationFor({ total: 12, soft: false, pair: null }, 3, 2)?.play).toBe('stand')
    expect(deviationFor({ total: 12, soft: false, pair: null }, 3, 1)).toBeNull()
    expect(deviationFor({ total: 13, soft: false, pair: null }, 2, -2)?.play).toBe('hit')
  })

  it('splits tens vs 5 at TC ≥ 5 (the table-horror play)', () => {
    expect(deviationFor({ total: 20, soft: false, pair: 10 }, 5, 5)?.play).toBe('split')
    expect(deviationFor({ total: 20, soft: false, pair: 10 }, 5, 4)).toBeNull()
  })
})
