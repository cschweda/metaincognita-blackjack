import { describe, expect, it } from 'vitest'
import { PRESETS, validateRuleSet, cloneRules } from '../../../app/utils/engine/rules'

describe('PRESETS', () => {
  it('ships the six named presets from the spec', () => {
    expect(Object.keys(PRESETS)).toEqual([
      'MA_205CMR', 'AC_BALLYS', 'WA_CARDROOM', 'VEGAS_STRIP_6D', 'SINGLE_DECK_65', 'CUSTOM'
    ])
  })

  it('every preset passes validation', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(validateRuleSet(preset)).toEqual([])
    }
  })

  it('encodes jurisdiction facts from the rulebooks', () => {
    expect(PRESETS.MA_205CMR.maxSplitHands).toBe(4) // MA §11(e)
    expect(PRESETS.AC_BALLYS.maxSplitHands).toBe(3) // AC guide: "total of three hands"
    expect(PRESETS.WA_CARDROOM.spots).toBe(9) // WA §1
    expect(PRESETS.WA_CARDROOM.maxSplitHands).toBe(3) // WA splitting section
    expect(PRESETS.SINGLE_DECK_65.blackjackPayout).toBe('6:5')
    expect(PRESETS.SINGLE_DECK_65.evenMoneyOffered).toBe(false) // MA §7(d): even money void under 6:5
    expect(PRESETS.VEGAS_STRIP_6D.dealerHitsSoft17).toBe(false)
  })
})

describe('validateRuleSet', () => {
  it('rejects even money under 6:5 (MA §7(d))', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.blackjackPayout = '6:5'
    r.evenMoneyOffered = true
    expect(validateRuleSet(r)).toContain('evenMoneyOffered requires 3:2 blackjack payout (MA §7(d))')
  })

  it('rejects even money without insurance (even money IS an insurance bet)', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.insurance = false
    r.evenMoneyOffered = true
    expect(validateRuleSet(r).length).toBeGreaterThan(0)
  })

  it('rejects out-of-range penetration and inverted bet limits', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.penetration = 0.95
    r.minBet = 10000
    r.maxBet = 500
    const errors = validateRuleSet(r)
    expect(errors.some(e => e.includes('penetration'))).toBe(true)
    expect(errors.some(e => e.includes('minBet'))).toBe(true)
  })
})

describe('cloneRules', () => {
  it('deep-copies so presets stay frozen', () => {
    const r = cloneRules(PRESETS.MA_205CMR)
    r.sideBets.matchTheDealer = !r.sideBets.matchTheDealer
    expect(r.sideBets.matchTheDealer).not.toBe(PRESETS.MA_205CMR.sideBets.matchTheDealer)
  })
})
