import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TablePage from '../../app/pages/table.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

// NOTE: no setActivePinia(createPinia()) here — mountSuspended mounts inside the Nuxt app,
// which has its own Pinia. The test body must use that same instance or the page sees an
// empty store. startSession/initSession fully reset store state between tests.

describe('table page integration (quick mode, seeded)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGameLoopForTests()
  })

  it('plays a betting → deal → act → settle round through the DOM', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({ rules, mode: 'quick', speed: 'normal', flair: false, botIds: ['bea'] }, 100_000, 21)

    const page = await mountSuspended(TablePage)
    // bet $25 and deal
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')

    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    // stand through the hero's hands via the DOM
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 10) {
      await page.find('[data-testid="act-stand"]').trigger('click')
    }
    expect(loop.phase.value).toBe('complete')
    expect(store.history).toHaveLength(1)
    expect(page.text()).toMatch(/WIN|LOSE|PUSH|BLACKJACK|SURRENDER/)
    // flair off → no quips rendered
    expect(page.text()).not.toContain('“')
    // bankroll consistent with the recorded round
    const rec = store.history[0]!
    const hero = rec.spots.find(s => s.occupant === 'hero')!
    const net = hero.hands.reduce((s, h) => s + h.net, 0) + hero.insuranceNet
    expect(store.bankroll).toBe(100_000 + net)
  })
})
