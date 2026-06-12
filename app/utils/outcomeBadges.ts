export const OUTCOME_BADGE: Record<string, { text: string, cls: string }> = {
  win: { text: 'WIN', cls: 'bg-emerald-700 text-emerald-100' },
  blackjack: { text: 'BLACKJACK', cls: 'bg-[var(--accent-gold)] text-black' },
  lose: { text: 'LOSE', cls: 'bg-red-900 text-red-200' },
  push: { text: 'PUSH', cls: 'bg-neutral-700 text-neutral-200' },
  surrender: { text: 'SURRENDER', cls: 'bg-neutral-800 text-neutral-300' }
}
