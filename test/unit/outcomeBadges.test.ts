import { describe, expect, it } from 'vitest'
import { OUTCOME_BADGE } from '../../app/utils/outcomeBadges'

describe('OUTCOME_BADGE', () => {
  it('covers every settled outcome the engine can produce, each with a distinct label', () => {
    expect(Object.keys(OUTCOME_BADGE).sort()).toEqual(['blackjack', 'lose', 'push', 'surrender', 'win'])
    const texts = Object.values(OUTCOME_BADGE).map(b => b.text)
    expect(new Set(texts).size).toBe(texts.length)
    for (const badge of Object.values(OUTCOME_BADGE)) {
      expect(badge.cls).toMatch(/bg-/)
      expect(badge.text).toBe(badge.text.toUpperCase())
    }
  })
})
