import type { Card } from './cards'
import type { RuleSet } from './rules'
import type { Phase, SpotState } from './round'

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

export interface GameSnapshot {
  v: typeof SNAPSHOT_VERSION
  rules: RuleSet
  rngState: number
  shoe: ShoeSnapshot
  phase: Phase
  spots: SpotState[]
  dealerCards: Card[]
  holeRevealed: boolean
}
