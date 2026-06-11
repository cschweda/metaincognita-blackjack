import type { Card } from './cards'
import type { RNG } from './rng'
import { buildShoeCards, shuffle } from './cards'

/**
 * Dealing shoe with burn card, cut-card penetration, and discard rack.
 * Burned cards go to the rack face down (MA §6(c)) — they are NEVER visible to the count.
 * Penetration is measured in cards leaving the shoe (burn included).
 */
export class Shoe {
  private cards: Card[] = []
  private rack: Card[] = []
  private burned: Card[] = []
  private cutIndex = 0
  private reached = false

  constructor(
    private readonly decks: number,
    private readonly penetration: number,
    private readonly rng: RNG
  ) {
    this.freshShoe()
  }

  private get totalCards(): number {
    return this.decks * 52
  }

  private dealtCount(): number {
    return this.totalCards - this.cards.length
  }

  /** Full shuffle: reclaim rack + burned, shuffle, set cut card, burn one (MA §5, §6(c)). */
  freshShoe(): void {
    this.cards = shuffle(buildShoeCards(this.decks), this.rng)
    this.rack = []
    this.burned = []
    this.cutIndex = Math.floor(this.totalCards * this.penetration)
    this.reached = false
    this.burnOne()
  }

  private burnOne(): void {
    const card = this.cards.shift()
    if (card) this.burned.push(card)
    if (this.dealtCount() >= this.cutIndex) this.reached = true
  }

  draw(): Card {
    if (this.cards.length === 0) this.reshuffleMidRound()
    const card = this.cards.shift()!
    if (this.dealtCount() >= this.cutIndex) this.reached = true
    return card
  }

  /** MA §15(g): insufficient cards mid-round → shuffle the discard rack, burn, complete the round. */
  private reshuffleMidRound(): void {
    if (this.rack.length === 0) throw new Error('Shoe exhausted with an empty discard rack — engine must discard before drawing this deep')
    this.cards = shuffle(this.rack.splice(0), this.rng)
    this.burnOne()
    this.reached = true // fresh shoe after this round regardless of cut position
  }

  discard(cards: Card[]): void {
    this.rack.push(...cards)
  }

  needsShuffle(): boolean {
    return this.reached
  }

  cardsRemaining(): number {
    return this.cards.length
  }

  burnedCount(): number {
    return this.burned.length
  }

  /** Exact — for engine math and tests. */
  decksRemaining(): number {
    return this.cards.length / 52
  }

  /** Human-style true-count divisor: estimate from discard tray volume, nearest half deck (spec §4.8). */
  estimatedDecksRemaining(): number {
    const inTray = this.rack.length + this.burned.length
    const estimate = this.decks - inTray / 52
    return Math.max(0.5, Math.round(estimate * 2) / 2)
  }
}
