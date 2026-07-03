import { describe, expect, it } from 'vitest'
import { hiLoValue, CountTracker, ILLUSTRIOUS_18, FAB_4, deviationFor, deviationActive } from '../../../app/utils/engine/counting'
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

describe('deviations — Fab 4 (spec §4.8)', () => {
  const pool = [...ILLUSTRIOUS_18, ...FAB_4]

  it('surrenders 14 vs T at TC ≥ +3, not below', () => {
    const state = { total: 14, soft: false, pair: null }
    expect(deviationFor(state, 10, 3, pool)?.play).toBe('surrender')
    expect(deviationFor(state, 10, 2.9, pool)).toBeNull()
  })

  it('surrenders 15 vs 9 at TC ≥ +2 and 15 vs A at TC ≥ +1', () => {
    const state = { total: 15, soft: false, pair: null }
    expect(deviationFor(state, 9, 2, pool)?.id).toBe('fab-15v9')
    expect(deviationFor(state, 11, 1, pool)?.id).toBe('fab-15vA')
  })

  it('reverses 15 vs T to a hit when the count is negative (book surrenders)', () => {
    const state = { total: 15, soft: false, pair: null }
    const dev = deviationFor(state, 10, -2, pool)
    expect(dev?.id).toBe('fab-15vT-keep')
    expect(dev?.play).toBe('hit')
  })

  it('default pool stays Illustrious-18-only — Fab 4 must be opted into', () => {
    expect(deviationFor({ total: 14, soft: false, pair: null }, 10, 5)).toBeNull()
  })

  it('I18 15vT-stand takes priority over fab-15vT-keep at high counts in the combined pool', () => {
    const state = { total: 15, soft: false, pair: null }
    const dev = deviationFor(state, 10, 4, pool)
    expect(dev?.id).toBe('15vT-stand')
    expect(dev?.play).toBe('stand')
  })
})

describe('deviation boundaries and scope', () => {
  const pool = [...ILLUSTRIOUS_18, ...FAB_4]

  it('negative-index deviations fire strictly below the index — book play AT the index', () => {
    // published convention (Schlesinger): stand 13v2 at TC ≥ −1, hit strictly below
    expect(deviationFor({ total: 13, soft: false, pair: null }, 2, -1)).toBeNull()
    expect(deviationFor({ total: 13, soft: false, pair: null }, 2, -1.5)?.id).toBe('13v2-hit')
    // 12v4 index 0: stand at TC 0 exactly, hit below
    expect(deviationFor({ total: 12, soft: false, pair: null }, 4, 0)).toBeNull()
    expect(deviationFor({ total: 12, soft: false, pair: null }, 4, -0.5)?.id).toBe('12v4-hit')
  })

  it('Fab 4 15vT reversal uses the published index 0 — hit only when the count is negative', () => {
    const state = { total: 15, soft: false, pair: null }
    expect(deviationFor(state, 10, -0.5, pool)?.id).toBe('fab-15vT-keep')
    expect(deviationFor(state, 10, 0, pool)).toBeNull()
  })

  it('total-based deviations never fire on a splittable pair (8,8 vs T is a split, not a 16vT stand)', () => {
    expect(deviationFor({ total: 16, soft: false, pair: 8 }, 10, 2)).toBeNull()
    // a pair the player cannot split is just a hard total — callers pass pair: null
    expect(deviationFor({ total: 16, soft: false, pair: null }, 10, 2)?.id).toBe('16vT-stand')
  })

  it('with surrender legal, stand deviations need the composite index — surrender stays best below it', () => {
    const s16 = { total: 16, soft: false, pair: null }
    expect(deviationFor(s16, 10, 1, pool, true)).toBeNull() // surrender (−0.50) still beats standing
    expect(deviationFor(s16, 10, 4, pool, true)?.id).toBe('16vT-stand')
    expect(deviationFor(s16, 9, 4.5, pool, true)).toBeNull()
    expect(deviationFor(s16, 9, 5, pool, true)?.id).toBe('16v9-stand')
    // 15vT: standing never overtakes surrender at practical counts — book (Fab 4) surrenders at TC ≥ 0
    const s15 = { total: 15, soft: false, pair: null }
    expect(deviationFor(s15, 10, 5, pool, true)).toBeNull()
  })

  it('deviationActive mirrors deviationFor semantics for a single deviation', () => {
    const d13v2 = ILLUSTRIOUS_18.find(d => d.id === '13v2-hit')!
    expect(deviationActive(d13v2, -1)).toBe(false)
    expect(deviationActive(d13v2, -1.5)).toBe(true)
    const d16vT = ILLUSTRIOUS_18.find(d => d.id === '16vT-stand')!
    expect(deviationActive(d16vT, 1)).toBe(true)
    expect(deviationActive(d16vT, 1, true)).toBe(false)
    expect(deviationActive(d16vT, 4, true)).toBe(true)
  })
})
