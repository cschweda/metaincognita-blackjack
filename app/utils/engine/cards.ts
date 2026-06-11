import type { RNG } from './rng'

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export interface Card {
  rank: number // 2–14 (11=J, 12=Q, 13=K, 14=A) — holdem convention
  suit: Suit
}

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

export const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

export const RANK_DISPLAY: Readonly<Record<number, string>> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
}

/** Blackjack point value: 2–9 face, ten/J/Q/K = 10, ace = 11 (hand.ts demotes to 1). MA §2(b), WA §2. */
export function pointValue(rank: number): number {
  if (rank === 14) return 11
  return Math.min(rank, 10)
}

/** Bucket = point value 2..11 (11 = ace). All strategy math runs in bucket space. */
export type Bucket = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export function bucketOf(card: Card): Bucket {
  return pointValue(card.rank) as Bucket
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  }
  return deck
}

export function buildShoeCards(decks: number): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < decks; d++) cards.push(...buildDeck())
  return cards
}

/** Fisher-Yates over a copy. */
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function displayCard(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOLS[card.suit]}`
}
