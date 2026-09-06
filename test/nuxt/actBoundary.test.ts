import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { SessionSettings } from '../../app/stores/useBlackjackStore'

// clampToLegal makes an illegal persona choice unreachable TODAY. This test covers the boundary
// that decides what happens when it is not: game.act() ran with no try/catch inside pump(), and
// every caller launches it as `void pump()`, so one IllegalActionError escaped as an unhandled
// rejection. `pumping` and `queueIdle` were already reset, phase stayed 'playerTurns', and nothing
// re-entered afterQueueDrained — the table wedged permanently, survived reload (restoreSession
// never pumps), and the only exit was endSession(), which wipes the session.

vi.mock('../../app/utils/engine/bots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/engine/bots')>()
  return {
    ...actual,
    // a persona from the future that ignores the legal set entirely
    // VEGAS_STRIP_6D has surrender: 'none', so legalActions never offers it
    decideFor: () => 'surrender' as const
  }
})

function settings(overrides: Partial<SessionSettings> = {}): SessionSettings {
  const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return {
    rules, mode: 'quick', speed: 'normal', flair: false, botIds: ['bea', 'nancy'],
    advisor: 'feedback', count: 'off', advancedDeviations: false, ...overrides
  }
}

describe('one bad decision cannot wedge the table', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    const { __resetGameLoopForTests } = await import('../../app/composables/useGameLoop')
    const { __resetCountingForTests } = await import('../../app/composables/useCounting')
    __resetGameLoopForTests()
    __resetCountingForTests()
  })

  it('recovers when a persona returns an action the table refuses', async () => {
    const { useGameLoop } = await import('../../app/composables/useGameLoop')
    const loop = useGameLoop()
    loop.startSession(settings(), 500_000)

    let rejection: unknown = null
    const onRejection = (e: PromiseRejectionEvent) => {
      rejection = e.reason
    }
    globalThis.addEventListener?.('unhandledrejection', onRejection as EventListener)

    loop.beginRound(2500, {})
    // drive the hero out of the way; the bots are the ones returning the illegal action
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 40) {
      if (loop.canAct.value) loop.act('stand')
      else break
    }
    await new Promise(resolve => setTimeout(resolve, 0))

    globalThis.removeEventListener?.('unhandledrejection', onRejection as EventListener)
    expect(rejection, 'an IllegalActionError must not escape as an unhandled rejection').toBeNull()
    expect(loop.phase.value, 'the round must reach settlement, not hang in playerTurns')
      .toBe('complete')
  })
})
