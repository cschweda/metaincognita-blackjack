import { describe, expect, it } from 'vitest'
import { Shoe } from '../../../app/utils/engine/shoe'
import { mulberry32 } from '../../../app/utils/engine/rng'

const makeShoe = (decks = 6, penetration = 0.75, seed = 42) =>
  new Shoe(decks, penetration, mulberry32(seed))

describe('Shoe', () => {
  it('starts with decks×52 minus the burn card drawable (MA §6(c))', () => {
    const shoe = makeShoe(6)
    expect(shoe.cardsRemaining()).toBe(311) // 312 - 1 burned
    expect(shoe.burnedCount()).toBe(1)
  })

  it('is deterministic under a seed', () => {
    const a = makeShoe(6, 0.75, 7)
    const b = makeShoe(6, 0.75, 7)
    expect(Array.from({ length: 20 }, () => a.draw()))
      .toEqual(Array.from({ length: 20 }, () => b.draw()))
  })

  it('raises the cut card exactly at the penetration depth', () => {
    const shoe = makeShoe(6, 0.75) // cut at floor(312×0.75)=234 cards dealt; burn counts as dealt
    for (let i = 0; i < 233; i++) shoe.draw() // dealt = 1 burn + 233 = 234... boundary below
    // dealt after burn = 1; reaches 234 on the 233rd draw
    expect(shoe.needsShuffle()).toBe(true)
    const fresh = makeShoe(6, 0.75)
    for (let i = 0; i < 232; i++) fresh.draw() // dealt = 233 < 234
    expect(fresh.needsShuffle()).toBe(false)
  })

  it('reshuffles the discard rack when emptied mid-round (MA §15(g))', () => {
    const shoe = makeShoe(1, 0.9) // 52 cards, burn 1 → 51 drawable
    const drawn = []
    for (let i = 0; i < 40; i++) drawn.push(shoe.draw())
    shoe.discard(drawn.splice(0)) // 40 in the rack
    for (let i = 0; i < 11; i++) shoe.draw() // shoe empty now
    expect(shoe.cardsRemaining()).toBe(0)
    const next = shoe.draw() // must not throw: reshuffles rack (burning one)
    expect(next).toBeDefined()
    expect(shoe.cardsRemaining()).toBe(38) // 40 rack - 1 burn - 1 drawn
    expect(shoe.needsShuffle()).toBe(true) // fresh shoe after this round
  })

  it('freshShoe() reclaims discards and burns anew', () => {
    const shoe = makeShoe(2) // 104
    const drawn = Array.from({ length: 30 }, () => shoe.draw())
    shoe.discard(drawn)
    shoe.freshShoe()
    expect(shoe.cardsRemaining()).toBe(103)
    expect(shoe.needsShuffle()).toBe(false)
  })

  it('estimates decks remaining from the discard tray to the nearest half deck', () => {
    const shoe = makeShoe(6)
    const drawn = Array.from({ length: 77 }, () => shoe.draw())
    shoe.discard(drawn) // tray = 77 + 1 burn = 78 = 1.5 decks
    expect(shoe.estimatedDecksRemaining()).toBe(4.5)
  })

  it('exposes exact decksRemaining for engine math', () => {
    const shoe = makeShoe(6)
    expect(shoe.decksRemaining()).toBeCloseTo(311 / 52, 5)
  })

  it('throws when drawn past empty with an empty discard rack', () => {
    const shoe = makeShoe(1, 0.9)
    for (let i = 0; i < 51; i++) shoe.draw() // 52 - 1 burned
    expect(() => shoe.draw()).toThrow(/empty discard rack/)
  })
})
