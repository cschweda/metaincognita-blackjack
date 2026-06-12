import type { Card } from './cards'

/** Versioned snapshot shapes for mid-round persistence (spec §9-10). */
export const SNAPSHOT_VERSION = 1

export interface ShoeSnapshot {
  v: typeof SNAPSHOT_VERSION
  decks: number
  penetration: number
  cards: Card[]
  rack: Card[]
  burned: Card[]
  reached: boolean
}
