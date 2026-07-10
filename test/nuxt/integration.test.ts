import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TablePage from '../../app/pages/table.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { __resetCountingForTests } from '../../app/composables/useCounting'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

// NOTE: no setActivePinia(createPinia()) here — mountSuspended mounts inside the Nuxt app,
// which has its own Pinia. The test body must use that same instance or the page sees an
// empty store. startSession/initSession fully reset store state between tests.

describe('table page integration (quick mode, seeded)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
  })

  it('plays a betting → deal → act → settle round through the DOM', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({ rules, mode: 'quick', speed: 'normal', flair: false, botIds: ['bea'], advisor: 'feedback', count: 'off', advancedDeviations: false }, 100_000, 21)

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

  it('coach mode surfaces a recommendation and the count panel shows RC', async () => {
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'coach', count: 'shown', advancedDeviations: false
    }, 100_000, 21)

    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')
    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    if (loop.phase.value === 'playerTurns') {
      expect(page.find('[data-testid="advisor-action"]').exists()).toBe(true)
      expect(page.find('[data-testid="count-values"]').exists()).toBe(true)
    }
  })

  it('study mode freezes the deal', async () => {
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'feedback', count: 'off', advancedDeviations: false
    }, 100_000, 5)
    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="study-toggle"]').trigger('click')
    expect(page.find('[data-testid="deal"]').attributes('disabled')).toBeDefined()
    expect(page.find('[data-testid="study-hotspot-shoe"]').exists()).toBe(true)
  })

  it('hole toggle exposes the mucked hole card', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'feedback', count: 'off', advancedDeviations: false
    }, 100_000, 5)
    const page = await mountSuspended(TablePage)

    // Initially aria-pressed should be "false"
    const holeToggle = page.find('[data-testid="hole-toggle"]')
    expect(holeToggle.exists()).toBe(true)
    expect(holeToggle.attributes('aria-pressed')).toBe('false')
    expect(store.training.exposeMuckedHole).toBe(false)

    // Click to enable
    await holeToggle.trigger('click')
    await page.vm.$nextTick()
    expect(store.training.exposeMuckedHole).toBe(true)
    expect(page.find('[data-testid="hole-toggle"]').attributes('aria-pressed')).toBe('true')

    // Click to disable
    await holeToggle.trigger('click')
    await page.vm.$nextTick()
    expect(store.training.exposeMuckedHole).toBe(false)
    expect(page.find('[data-testid="hole-toggle"]').attributes('aria-pressed')).toBe('false')
  })

  it('shows the round-outcome banner and advisor recap after settlement', async () => {
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'coach', count: 'off', advancedDeviations: false
    }, 100_000, 21)
    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')
    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 10) {
      await page.find('[data-testid="act-stand"]').trigger('click')
    }
    expect(loop.phase.value).toBe('complete')
    expect(page.find('[data-testid="round-outcome"]').text()).toMatch(/WIN|LOSE|PUSH|BLACKJACK/)
    expect(page.find('[data-testid="advisor-headline"]').text()).toMatch(/Won|Lost|Push|Blackjack/)
    expect(page.find('[data-testid="advisor-bankroll"]').text()).toContain('Bankroll')
  })

  it('heads-up table hides the empty-seat markers (no companions)', async () => {
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'feedback', count: 'off', advancedDeviations: false
    }, 100_000, 7)
    const page = await mountSuspended(TablePage)
    expect(page.findAll('.border-dashed.rounded-full').length).toBe(0)
  })
})
