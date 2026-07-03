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
