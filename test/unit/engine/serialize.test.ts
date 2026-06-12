import { describe, expect, it } from 'vitest'
import { statefulMulberry32 } from '../../../app/utils/engine/rng'

describe('statefulMulberry32', () => {
  it('matches mulberry32 output for the same seed', async () => {
    const { mulberry32 } = await import('../../../app/utils/engine/rng')
    const plain = mulberry32(42)
    const stateful = statefulMulberry32(42)
    for (let i = 0; i < 100; i++) expect(stateful.next()).toBe(plain())
  })

  it('resumes exactly from a captured state', () => {
    const a = statefulMulberry32(7)
    for (let i = 0; i < 10; i++) a.next()
    const resumed = statefulMulberry32(a.state())
    const tailA = Array.from({ length: 20 }, () => a.next())
    const tailB = Array.from({ length: 20 }, () => resumed.next())
    expect(tailB).toEqual(tailA)
  })
})
