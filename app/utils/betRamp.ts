/** Bet-ramp configuration for the Bet Lab and the opt-in table hints (spec:
 *  docs/superpowers/specs/2026-06-13-counting-trainer-expansion-design.md).
 *  Pure module — engine imports only; the math lands with the lab. */

export interface BetRamp {
  /** One betting unit, in cents. */
  unitCents: number
  bankrollCents: number
  roundsPerHour: number
  /** Sit out (back-count) below TC +1 instead of betting the ≤0 step. */
  wongOut: boolean
  /** Bet units per true-count bucket: [≤0, +1, +2, +3, +4, ≥+5]. */
  steps: number[]
}

export const DEFAULT_RAMP: BetRamp = {
  unitCents: 2500,
  bankrollCents: 1_000_000,
  roundsPerHour: 70,
  wongOut: false,
  steps: [1, 2, 4, 6, 8, 12]
}
