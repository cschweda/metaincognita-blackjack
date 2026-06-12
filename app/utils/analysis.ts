import type { DecisionCategory, RoundRecord, TrainingStats } from '../stores/useBlackjackStore'

export interface CategoryRow {
  category: DecisionCategory
  decisions: number
  correct: number
  pct: number
}

export function adherenceRows(t: TrainingStats): CategoryRow[] {
  return (Object.entries(t.adherence) as Array<[DecisionCategory, { decisions: number, correct: number }]>)
    .map(([category, a]) => ({
      category,
      decisions: a.decisions,
      correct: a.correct,
      pct: a.decisions === 0 ? 0 : Math.round((a.correct / a.decisions) * 100)
    }))
}

const UP_LABEL: Record<string, string> = { 10: 'T', 11: 'A' }

export function humanizeMistake(key: string): string {
  const [kind, total, up] = key.split('|')
  const upLabel = UP_LABEL[up ?? ''] ?? up ?? '?'
  if (kind === 'pair') return `Pair of ${UP_LABEL[total ?? ''] ?? total}s vs ${upLabel}`
  if (kind === 'soft') return `Soft ${total} vs ${upLabel}`
  return `Hard ${total} vs ${upLabel}`
}

export function topMistakes(bag: Record<string, number>, n = 5): Array<{ key: string, label: string, count: number }> {
  return Object.entries(bag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, label: humanizeMistake(key), count }))
}

function heroSpotOf(round: RoundRecord) {
  return round.spots.find(s => s.occupant === 'hero')
}

function heroNetOf(round: RoundRecord): number {
  const hero = heroSpotOf(round)
  if (!hero) return 0
  return hero.hands.reduce((sum, h) => sum + h.net, 0)
    + hero.sideBets.reduce((sum, b) => sum + b.net, 0)
    + hero.insuranceNet
}

export function evLostCents(history: RoundRecord[]): number {
  return history.reduce((sum, r) =>
    sum + (r.heroDecisions ?? []).reduce((s, d) => s + d.costCents, 0), 0)
}

export function heroPnlCents(history: RoundRecord[]): number {
  return history.reduce((sum, r) => sum + heroNetOf(r), 0)
}

export function countAccuracy(checks: TrainingStats['countChecks']): { total: number, exact: number, withinOne: number } {
  const total = checks.length
  const exact = checks.filter(c => c.entered === c.actual).length
  const withinOne = checks.filter(c => Math.abs(c.entered - c.actual) <= 1).length
  return { total, exact, withinOne }
}

export function sideBetLedger(history: RoundRecord[]): Array<{ name: string, staked: number, net: number }> {
  const map = new Map<string, { staked: number, net: number }>()
  for (const round of history) {
    const hero = heroSpotOf(round)
    for (const bet of hero?.sideBets ?? []) {
      const entry = map.get(bet.name) ?? { staked: 0, net: 0 }
      entry.staked += bet.stake
      entry.net += bet.net
      map.set(bet.name, entry)
    }
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v }))
}

/** Oldest→newest bankroll curve ending at `current` — one point before each round plus the end. */
export function bankrollSeries(history: RoundRecord[], current: number): number[] {
  const series = new Array<number>(history.length + 1)
  series[history.length] = current
  for (let i = history.length - 1; i >= 0; i--) {
    series[i] = series[i + 1]! - heroNetOf(history[i]!)
  }
  return series
}

export function botPnl(history: RoundRecord[]): Array<{ id: string, net: number }> {
  const map = new Map<string, number>()
  for (const round of history) {
    for (const spot of round.spots) {
      if (spot.occupant === 'hero') continue
      const net = spot.hands.reduce((sum, h) => sum + h.net, 0) + spot.insuranceNet
      map.set(spot.occupant, (map.get(spot.occupant) ?? 0) + net)
    }
  }
  return [...map.entries()].map(([id, net]) => ({ id, net }))
}
