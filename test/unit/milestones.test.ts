import { describe, expect, it } from 'vitest'
import { freshMilestones, roundMilestones, shuffleMilestone } from '../../app/utils/milestones'

describe('milestones', () => {
  it('fires the pit-boss line on the third straight win, once per streak', () => {
    let state = freshMilestones(50_000)
    let lines: string[] = []
    for (let i = 0; i < 3; i++) {
      ({ lines, state } = roundMilestones({ heroNet: 1000, tookCorrectDeviation: false, state }))
    }
    expect(lines.some(l => l.includes('Pit boss'))).toBe(true)
    ;({ lines, state } = roundMilestones({ heroNet: 1000, tookCorrectDeviation: false, state }))
    expect(lines).toHaveLength(0) // streak continues silently at 4
    ;({ state } = roundMilestones({ heroNet: -1000, tookCorrectDeviation: false, state }))
    expect(state.winStreak).toBe(0)
  })

  it('fires the first-correct-deviation line exactly once', () => {
    let state = freshMilestones(50_000)
    const first = roundMilestones({ heroNet: 0, tookCorrectDeviation: true, state })
    expect(first.lines.some(l => l.toLowerCase().includes('deviation'))).toBe(true)
    state = first.state
    const second = roundMilestones({ heroNet: 0, tookCorrectDeviation: true, state })
    expect(second.lines).toHaveLength(0)
  })

  it('congratulates beating a shoe when the bankroll grew since the last shuffle', () => {
    let state = freshMilestones(50_000)
    const up = shuffleMilestone(52_500, state)
    expect(up.line).toContain('shoe')
    state = up.state
    expect(state.bankrollAtShuffle).toBe(52_500)
    const down = shuffleMilestone(51_000, state)
    expect(down.line).toBeNull()
  })
})
