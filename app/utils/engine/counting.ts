import type { Card, Bucket } from './cards'
import { bucketOf } from './cards'

/** Hi-Lo tags (spec §4.8). */
export function hiLoValue(card: Card): -1 | 0 | 1 {
  const b = bucketOf(card)
  if (b >= 2 && b <= 6) return 1
  if (b >= 7 && b <= 9) return 0
  return -1
}

/** Tracks the running count from VISIBLE cards only — burn cards never reach observe(). */
export class CountTracker {
  running = 0
  cardsSeen = 0

  observe(card: Card): void {
    this.running += hiLoValue(card)
    this.cardsSeen++
  }

  trueCount(decksRemaining: number): number {
    return this.running / Math.max(0.5, decksRemaining)
  }

  /** Educational estimate, not betting advice (spec §6 scope): ≈ (TC − 1) × 0.5%. */
  advantageEstimate(decksRemaining: number): number {
    return (this.trueCount(decksRemaining) - 1) * 0.005
  }

  reset(): void {
    this.running = 0
    this.cardsSeen = 0
  }
}

export interface Deviation {
  id: string
  description: string
  /** Applies when TC ≥ minTrueCount (or ≤ maxTrueCount for the reverse plays). */
  minTrueCount?: number
  maxTrueCount?: number
  total: number
  soft: boolean
  pair: Bucket | null
  up: Bucket
  play: 'stand' | 'hit' | 'double' | 'split' | 'take-insurance' | 'surrender'
}

/** Illustrious 18 (Don Schlesinger), Hi-Lo, multi-deck ordering. Advanced mode only (spec §6). */
export const ILLUSTRIOUS_18: Deviation[] = [
  { id: 'insurance', description: 'Take insurance', minTrueCount: 3, total: 0, soft: false, pair: null, up: 11, play: 'take-insurance' },
  { id: '16vT-stand', description: 'Stand 16 vs T', minTrueCount: 0, total: 16, soft: false, pair: null, up: 10, play: 'stand' },
  { id: '15vT-stand', description: 'Stand 15 vs T', minTrueCount: 4, total: 15, soft: false, pair: null, up: 10, play: 'stand' },
  { id: 'TTv5-split', description: 'Split T,T vs 5', minTrueCount: 5, total: 20, soft: false, pair: 10, up: 5, play: 'split' },
  { id: 'TTv6-split', description: 'Split T,T vs 6', minTrueCount: 4, total: 20, soft: false, pair: 10, up: 6, play: 'split' },
  { id: '10vT-double', description: 'Double 10 vs T', minTrueCount: 4, total: 10, soft: false, pair: null, up: 10, play: 'double' },
  { id: '12v3-stand', description: 'Stand 12 vs 3', minTrueCount: 2, total: 12, soft: false, pair: null, up: 3, play: 'stand' },
  { id: '12v2-stand', description: 'Stand 12 vs 2', minTrueCount: 3, total: 12, soft: false, pair: null, up: 2, play: 'stand' },
  { id: '11vA-double', description: 'Double 11 vs A', minTrueCount: 1, total: 11, soft: false, pair: null, up: 11, play: 'double' },
  { id: '9v2-double', description: 'Double 9 vs 2', minTrueCount: 1, total: 9, soft: false, pair: null, up: 2, play: 'double' },
  { id: '10vA-double', description: 'Double 10 vs A', minTrueCount: 4, total: 10, soft: false, pair: null, up: 11, play: 'double' },
  { id: '9v7-double', description: 'Double 9 vs 7', minTrueCount: 3, total: 9, soft: false, pair: null, up: 7, play: 'double' },
  { id: '16v9-stand', description: 'Stand 16 vs 9', minTrueCount: 5, total: 16, soft: false, pair: null, up: 9, play: 'stand' },
  { id: '13v2-hit', description: 'Hit 13 vs 2 in negative counts', maxTrueCount: -1, total: 13, soft: false, pair: null, up: 2, play: 'hit' },
  { id: '12v4-hit', description: 'Hit 12 vs 4 in negative counts', maxTrueCount: 0, total: 12, soft: false, pair: null, up: 4, play: 'hit' },
  { id: '12v5-hit', description: 'Hit 12 vs 5 in negative counts', maxTrueCount: -2, total: 12, soft: false, pair: null, up: 5, play: 'hit' },
  { id: '12v6-hit', description: 'Hit 12 vs 6 in negative counts', maxTrueCount: -1, total: 12, soft: false, pair: null, up: 6, play: 'hit' },
  { id: '13v3-hit', description: 'Hit 13 vs 3 in negative counts', maxTrueCount: -2, total: 13, soft: false, pair: null, up: 3, play: 'hit' }
]

/** Fab 4 surrender deviations (Schlesinger), Hi-Lo multi-deck S17 thresholds — same basis
 *  as the Illustrious 18 table above. Only meaningful when rules.surrender === 'late'. */
export const FAB_4: Deviation[] = [
  { id: 'fab-14vT', description: 'Surrender 14 vs T', minTrueCount: 3, total: 14, soft: false, pair: null, up: 10, play: 'surrender' },
  { id: 'fab-15v9', description: 'Surrender 15 vs 9', minTrueCount: 2, total: 15, soft: false, pair: null, up: 9, play: 'surrender' },
  { id: 'fab-15vA', description: 'Surrender 15 vs A', minTrueCount: 1, total: 15, soft: false, pair: null, up: 11, play: 'surrender' },
  { id: 'fab-15vT-keep', description: 'Hit 15 vs T in a negative shoe (book surrenders)', maxTrueCount: -1, total: 15, soft: false, pair: null, up: 10, play: 'hit' }
]

export function deviationFor(
  state: { total: number, soft: boolean, pair: Bucket | null },
  up: Bucket,
  trueCount: number,
  pool: Deviation[] = ILLUSTRIOUS_18
): Deviation | null {
  for (const dev of pool) {
    if (dev.id === 'insurance') continue // insurance is queried separately by the advisor
    if (dev.up !== up || dev.total !== state.total || dev.soft !== state.soft) continue
    if (dev.pair !== null && dev.pair !== state.pair) continue
    if (dev.minTrueCount !== undefined && trueCount >= dev.minTrueCount) return dev
    if (dev.maxTrueCount !== undefined && trueCount <= dev.maxTrueCount) return dev
  }
  return null
}
