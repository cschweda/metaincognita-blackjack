import { describe, expect, it } from 'vitest'
import { PRESETS, cloneRules, validateRuleSet } from '../../../app/utils/engine/rules'
import { houseEdge } from '../../../app/utils/engine/basicStrategy'

// Under no-peek the dealer's natural is charged to every action through the unconditioned
// distribution — except surrender, which settles at a flat half whatever the hole turns out to be.
// Surrender therefore escapes a loss its rivals pay, which drives the computed edge NEGATIVE at
// every deck count and makes the rules lab print a player-favourable game two toggles from the
// default, with the count panel reading a positive Edge est. before a card is dealt.
//
// The combination is also not a real casino rule: a no-hole-card game has no hole to check, which
// is exactly why hand.ts's MA §8 escrow note assumes late surrender is offered POST-peek. Both
// toggles live in the rules editor, so an error here is something the player can act on.

const noPeekLate = (decks: 1 | 2 | 4 | 6 | 8) => {
  const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  r.decks = decks
  r.dealerPeek = false
  r.surrender = 'late'
  return r
}

describe('no-peek with late surrender is rejected', () => {
  it('is refused at every deck count', () => {
    for (const decks of [1, 2, 4, 6, 8] as const) {
      const errors = validateRuleSet(noPeekLate(decks))
      expect(errors.some(e => e.includes('surrender')), `${decks} decks`).toBe(true)
    }
  })

  it('is exactly the combination the edge model cannot price', () => {
    // the guard exists because of this, so pin it: without a peek the computed edge goes negative
    for (const decks of [1, 2, 4, 6, 8] as const) {
      expect(houseEdge(noPeekLate(decks)), `${decks} decks`).toBeLessThan(0)
    }
  })

  it('leaves each half alone on its own', () => {
    const noPeekOnly = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    noPeekOnly.dealerPeek = false
    noPeekOnly.surrender = 'none'
    expect(validateRuleSet(noPeekOnly)).toEqual([])
    expect(houseEdge(noPeekOnly)).toBeGreaterThan(0)

    const lateOnly = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    lateOnly.surrender = 'late'
    expect(validateRuleSet(lateOnly)).toEqual([])
  })

  it('every shipped preset still validates', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(validateRuleSet(cloneRules(preset)), key).toEqual([])
    }
  })
})
