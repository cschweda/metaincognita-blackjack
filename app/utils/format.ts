/** The family money format, shared by every surface (advisor, table, history, analysis, lab).
 *  One convention: cents render only when they exist, the minus is typographic (U+2212). */

/** "$1,234" / "$12.50" — magnitude only. Pass dp to force fixed decimals for aligned columns. */
export function formatCents(cents: number, dp?: number): string {
  const digits = dp ?? (cents % 100 === 0 ? 0 : 2)
  return `$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`
}

/** "+$5" / "−$5.40" / "±$0" — zeroSign '' hides the sign on zero. */
export function signedCents(cents: number, opts: { zeroSign?: string, dp?: number } = {}): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : (opts.zeroSign ?? '±')
  return `${sign}${formatCents(cents, opts.dp)}`
}

/** The PLAYER's advantage — sign carries the meaning, so it is always shown: "+1.25%" ahead,
 *  "−0.40%" behind, "~even" inside `resolution` where the model cannot resolve the sign. */
export function formatAdvantage(value: number, resolution: number): string {
  if (Math.abs(value) < resolution) return '~even'
  return `${value > 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(2)}%`
}

/** The HOUSE's edge — positive is the normal case and needs no "+" (a leading plus would read
 *  as a player advantage, the opposite meaning). A negative survives only when it clears
 *  `resolution`, i.e. when the model genuinely resolves a player-favourable game. */
export function formatHouseEdge(value: number, resolution: number): string {
  if (Math.abs(value) < resolution) return '~even'
  return `${value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(2)}%`
}

/**
 * A number the user actually typed. Number inputs bound with v-model.number hand back `''` once
 * emptied (and for a lone "-"), which is neither null nor NaN — so the old `=== null || isNaN`
 * guards let a blank through and graded it: a wrong count check was written to the lifetime
 * record, drill streaks reset, and the true-count drill coerced '' to 0 and marked it CORRECT
 * whenever the answer was within half a point of zero.
 */
export function isEnteredNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
