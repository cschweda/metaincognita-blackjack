import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TablePage from '../../app/pages/table.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { __resetCountingForTests } from '../../app/composables/useCounting'
import { DEFAULT_RAMP } from '../../app/utils/betRamp'
import type { SessionSettings } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

// NOTE: repo precedent — no setActivePinia with mountSuspended (the Nuxt app owns Pinia).

const HINT = '[data-testid="advisor-bet-hint"]'

function settings(overrides: Partial<SessionSettings> = {}): SessionSettings {
  const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return {
    rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
    advisor: 'coach', count: 'self-check', advancedDeviations: true,
    ...overrides
  } as SessionSettings
}

describe('opt-in ramp bet hints at the table', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
  })

  it('shows the ramp line between rounds when every gate passes', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, steps: [...DEFAULT_RAMP.steps] }, true)

    const page = await mountSuspended(TablePage)
    const hint = page.find(HINT)
    expect(hint.exists()).toBe(true)
    // fresh shoe: TC 0 → bucket ≤0 → 1 unit of the $25 default ramp
    expect(hint.text()).toBe('Ramp: bet 1 unit ($25) — TC +0.0')
  })

  it('says sit out at non-positive counts when the ramp wongs out', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, wongOut: true, steps: [...DEFAULT_RAMP.steps] }, true)

    const page = await mountSuspended(TablePage)
    expect(page.find(HINT).text()).toBe('Ramp: sit out — TC +0.0')
  })

  it('stays hidden when the toggle is off, counting is off, or exam mode is on', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()

    // toggle off
    loop.startSession(settings(), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, steps: [...DEFAULT_RAMP.steps] }, false)
    let page = await mountSuspended(TablePage)
    expect(page.find(HINT).exists()).toBe(false)
    page.unmount()

    // counting off
    __resetGameLoopForTests()
    __resetCountingForTests()
    loop.startSession(settings({ count: 'off' }), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, steps: [...DEFAULT_RAMP.steps] }, true)
    page = await mountSuspended(TablePage)
    expect(page.find(HINT).exists()).toBe(false)
    page.unmount()

    // exam mode
    __resetGameLoopForTests()
    __resetCountingForTests()
    loop.startSession(settings({ advisor: 'exam' }), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, steps: [...DEFAULT_RAMP.steps] }, true)
    page = await mountSuspended(TablePage)
    expect(page.find(HINT).exists()).toBe(false)
  })

  it('disappears during the hand and returns once the round settles', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 21)
    store.setBetRamp({ ...DEFAULT_RAMP, steps: [...DEFAULT_RAMP.steps] }, true)

    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')
    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    if (loop.phase.value === 'playerTurns') {
      expect(page.find(HINT).exists()).toBe(false) // mid-hand: no bet to size
      let guard = 0
      while (loop.phase.value === 'playerTurns' && guard++ < 10) {
        await page.find('[data-testid="act-stand"]').trigger('click')
      }
    }
    expect(loop.phase.value).toBe('complete')
    await page.vm.$nextTick()
    expect(page.find(HINT).exists()).toBe(true) // settled: size the NEXT bet
  })
})
