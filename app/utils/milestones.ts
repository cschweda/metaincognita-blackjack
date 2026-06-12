export interface MilestoneState {
  winStreak: number
  firstDeviationDone: boolean
  bankrollAtShuffle: number
}

export function freshMilestones(bankroll: number): MilestoneState {
  return { winStreak: 0, firstDeviationDone: false, bankrollAtShuffle: bankroll }
}

export function roundMilestones(args: {
  heroNet: number
  tookCorrectDeviation: boolean
  state: MilestoneState
}): { lines: string[], state: MilestoneState } {
  const lines: string[] = []
  const state = { ...args.state }
  if (args.heroNet > 0) {
    state.winStreak++
    if (state.winStreak === 3) lines.push('Pit boss glances over — three in a row.')
  } else if (args.heroNet < 0) {
    state.winStreak = 0
  }
  if (args.tookCorrectDeviation && !state.firstDeviationDone) {
    state.firstDeviationDone = true
    lines.push('First correct deviation — you are officially playing the count.')
  }
  return { lines, state }
}

export function shuffleMilestone(bankroll: number, state: MilestoneState): { line: string | null, state: MilestoneState } {
  const grew = bankroll > state.bankrollAtShuffle
  return {
    line: grew ? 'You beat that shoe.' : null,
    state: { ...state, bankrollAtShuffle: bankroll }
  }
}
