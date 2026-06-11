import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../app/utils/engine/rng'
import {
  buildDeck, buildShoeCards, shuffle, pointValue, bucketOf, displayCard
} from '../../../app/utils/engine/cards'
import type { Card } from '../../../app/utils/engine/cards'

describe('buildDeck', () => {
  it('builds 52 unique cards across 4 suits and ranks 2-14', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(52)
    const keys = new Set(deck.map(c => `${c.rank}-${c.suit}`))
    expect(keys.size).toBe(52)
    expect(new Set(deck.map(c => c.suit))).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']))
    expect(Math.min(...deck.map(c => c.rank))).toBe(2)
    expect(Math.max(...deck.map(c => c.rank))).toBe(14)
  })
})

describe('buildShoeCards', () => {
  it('builds decks × 52 cards (six-deck shoe = 312)', () => {
    expect(buildShoeCards(6)).toHaveLength(312)
  })
})

describe('pointValue / bucketOf', () => {
  it('values 2-9 at face, ten/face at 10, ace at 11', () => {
    expect(pointValue(2)).toBe(2)
    expect(pointValue(9)).toBe(9)
    expect(pointValue(10)).toBe(10)
    expect(pointValue(11)).toBe(10) // J
    expect(pointValue(13)).toBe(10) // K
    expect(pointValue(14)).toBe(11) // A
  })

  it('buckets cards into 2..11 point space', () => {
    const king: Card = { rank: 13, suit: 'spades' }
    const ace: Card = { rank: 14, suit: 'hearts' }
    const five: Card = { rank: 5, suit: 'clubs' }
    expect(bucketOf(king)).toBe(10)
    expect(bucketOf(ace)).toBe(11)
    expect(bucketOf(five)).toBe(5)
  })
})

describe('shuffle', () => {
  it('is a deterministic permutation under a seeded RNG', () => {
    const a = shuffle(buildDeck(), mulberry32(99))
    const b = shuffle(buildDeck(), mulberry32(99))
    expect(a).toEqual(b)
    expect(a).not.toEqual(buildDeck()) // astronomically unlikely to be identity
    expect(a).toHaveLength(52)
    expect(new Set(a.map(c => `${c.rank}-${c.suit}`)).size).toBe(52)
  })

  it('does not mutate its input', () => {
    const deck = buildDeck()
    const copy = [...deck]
    shuffle(deck, mulberry32(1))
    expect(deck).toEqual(copy)
  })
})

describe('displayCard', () => {
  it('renders rank + suit symbol', () => {
    expect(displayCard({ rank: 14, suit: 'spades' })).toBe('A♠')
    expect(displayCard({ rank: 10, suit: 'hearts' })).toBe('10♥')
    expect(displayCard({ rank: 11, suit: 'diamonds' })).toBe('J♦')
    expect(displayCard({ rank: 12, suit: 'clubs' })).toBe('Q♣')
    expect(displayCard({ rank: 13, suit: 'hearts' })).toBe('K♥')
  })
})
