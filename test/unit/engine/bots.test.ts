import { describe, expect, it } from 'vitest'
import { PERSONAS, decideFor } from '../../../app/utils/engine/bots'
import { PRESETS } from '../../../app/utils/engine/rules'
import { newHand } from '../../../app/utils/engine/hand'
import { mulberry32 } from '../../../app/utils/engine/rng'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const RULES = PRESETS.VEGAS_STRIP_6D!
const up9 = c(9, 'hearts')
const up6 = c(6, 'hearts')

describe('PERSONAS', () => {
  it('ships the five v1 personas', () => {
    expect(PERSONAS.map(p => p.id)).toEqual(['bea', 'nancy', 'mike', 'ivan', 'lou'])
  })

  it('every persona has flavor and at least 3 quips per category', () => {
    for (const p of PERSONAS) {
      expect(p.flavor.length).toBeGreaterThan(10)
      for (const lines of Object.values(p.quips)) {
        expect(lines.length).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('decideFor', () => {
  it('Bea plays perfect book (16 v 9 hits, 11 v 6 doubles, 8,8 splits)', () => {
    expect(decideFor('bea', newHand([c(10), c(6)], 1000), 1, up9, RULES)).toBe('hit')
    expect(decideFor('bea', newHand([c(6), c(5)], 1000), 1, up6, RULES)).toBe('double')
    expect(decideFor('bea', newHand([c(8, 'hearts'), c(8, 'clubs')], 1000), 1, up9, RULES)).toBe('split')
  })

  it('Nancy never risks a bust: stands all 12+, hits below', () => {
    expect(decideFor('nancy', newHand([c(8), c(4)], 1000), 1, up9, RULES)).toBe('stand') // 12 v 9!
    expect(decideFor('nancy', newHand([c(6), c(5)], 1000), 1, up6, RULES)).toBe('hit') // 11 can't bust
  })

  it('Mike mimics the dealer: hits to 17 per the table rule, never doubles or splits', () => {
    expect(decideFor('mike', newHand([c(10), c(6)], 1000), 1, up6, RULES)).toBe('hit') // 16 v 6 (book stands!)
    expect(decideFor('mike', newHand([c(14), c(6)], 1000), 1, up6, RULES)).toBe('stand') // soft 17 under S17 — he copies the table rule
    expect(decideFor('mike', newHand([c(8, 'hearts'), c(8, 'clubs')], 1000), 1, up6, RULES)).toBe('hit') // 16, no split
  })

  it('Lou refuses to hit 16 ("never bust a 16, kid")', () => {
    expect(decideFor('lou', newHand([c(10), c(6)], 1000), 1, up9, RULES)).toBe('stand')
  })

  it('Ivan plays book but always wants insurance', () => {
    const ivan = PERSONAS.find(p => p.id === 'ivan')!
    expect(ivan.takesInsurance).toBe(true)
    const bea = PERSONAS.find(p => p.id === 'bea')!
    expect(bea.takesInsurance).toBe(false)
  })
})

describe('bet progression', () => {
  it('Lou presses after wins and retreats after losses, deterministically', () => {
    const lou = PERSONAS.find(p => p.id === 'lou')!
    const rng = mulberry32(5)
    const afterWin = lou.nextBet(1000, 'win', RULES, rng)
    const afterLoss = lou.nextBet(1000, 'lose', RULES, rng)
    expect(afterWin).toBeGreaterThan(1000)
    expect(afterLoss).toBeLessThanOrEqual(1000)
    expect(afterWin % 100).toBe(0) // whole-dollar bets
  })

  it('flat bettors return the base bet', () => {
    const bea = PERSONAS.find(p => p.id === 'bea')!
    expect(bea.nextBet(1000, 'win', RULES, mulberry32(1))).toBe(1000)
  })
})
