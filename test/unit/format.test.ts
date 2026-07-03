import { describe, expect, it } from 'vitest'
import { formatCents, signedCents } from '../../app/utils/format'

describe('formatCents / signedCents — the family money format', () => {
  it('shows cents only when they exist', () => {
    expect(formatCents(2500)).toBe('$25')
    expect(formatCents(1250)).toBe('$12.50')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(100000)).toBe('$1,000')
    expect(formatCents(-2500)).toBe('$25') // magnitude only — signs are signedCents' job
  })

  it('accepts forced decimal places for aligned columns', () => {
    expect(formatCents(2500, 2)).toBe('$25.00')
    expect(formatCents(1234, 0)).toBe('$12')
  })

  it('signs with the typographic minus and a configurable zero', () => {
    expect(signedCents(3750)).toBe('+$37.50')
    expect(signedCents(-540)).toBe('−$5.40') // U+2212, not ASCII hyphen
    expect(signedCents(0)).toBe('±$0')
    expect(signedCents(0, { zeroSign: '' })).toBe('$0')
    expect(signedCents(2500, { dp: 2 })).toBe('+$25.00')
  })
})
