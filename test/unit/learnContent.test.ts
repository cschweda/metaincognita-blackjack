import { describe, expect, it } from 'vitest'
import type { EngineFacts } from '../../app/utils/learnContent'
import { myths, glossary } from '../../app/utils/learnContent'

/** Distinctive values so an assertion hit proves interpolation, not coincidence. */
const FACTS: EngineFacts = {
  payoutDeltaPct: '1.4',
  h17DeltaPct: '0.22',
  dasDeltaPct: '0.14',
  dealerBustPct: 28,
  sixteenVsTen: { standLoss: 54, hitLoss: 51 }
}

describe('myths', () => {
  it('ships the five myth cards, every field written', () => {
    const cards = myths(FACTS)
    expect(cards).toHaveLength(5)
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.claim.length).toBeGreaterThan(0)
      expect(card.truth.length).toBeGreaterThan(0)
    }
  })

  it('quantifies the never-bust myth from the engine, never transcribed numbers', () => {
    const neverBust = myths(FACTS).find(m => m.title.includes('Never bust'))!
    expect(neverBust.truth).toContain('54')
    expect(neverBust.truth).toContain('51')
  })
})

describe('glossary', () => {
  it('every entry is a [term, definition] pair with content', () => {
    const entries = glossary(FACTS)
    expect(entries.length).toBeGreaterThanOrEqual(10)
    for (const [term, definition] of entries) {
      expect(term!.length).toBeGreaterThan(0)
      expect(definition!.length).toBeGreaterThan(0)
    }
  })

  it('interpolates the engine-computed rule deltas (guidelines §2.2: figures computed, never transcribed)', () => {
    const entries = glossary(FACTS)
    expect(entries.find(([term]) => term === 'DAS')![1]).toContain('0.14')
    expect(entries.find(([term]) => term!.startsWith('H17'))![1]).toContain('0.22')
  })
})
