import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ActionBar from '../../app/components/table/ActionBar.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const base = {
  rules: PRESETS.MA_205CMR!, // all four side bets enabled
  legalActions: [],
  bankroll: 100_000,
  canDeal: true,
  heroHasBlackjack: false,
  lastBet: null
}

describe('ActionBar — betting', () => {
  it('builds a bet from chips and emits deal', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-2500"]').trigger('click')
    await w.find('[data-testid="chip-2500"]').trigger('click')
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([5000, {}])
  })

  it('routes chips to a selected enabled side bet, capped at the main bet', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-2500"]').trigger('click') // main 2500
    await w.find('[data-testid="target-buster"]').trigger('click')
    await w.find('[data-testid="chip-2500"]').trigger('click') // buster 2500 (== main, allowed)
    await w.find('[data-testid="chip-100"]').trigger('click') // would exceed main — ignored
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([2500, { buster: 2500 }])
  })

  it('hides side-bet targets that the rules disable', async () => {
    const rules = cloneRules(PRESETS.MA_205CMR!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const w = await mountSuspended(ActionBar, { props: { ...base, rules, phase: 'betting' } })
    expect(w.find('[data-testid="target-buster"]').exists()).toBe(false)
    expect(w.find('[data-testid="target-twentyOnePlusThree"]').exists()).toBe(false)
  })

  it('disables Deal below the table minimum', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-500"]').trigger('click') // $5 < $10 min
    expect(w.find('[data-testid="deal"]').attributes('disabled')).toBeDefined()
  })

  it('labels chip buttons for screen readers', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    expect(w.find('[data-testid="chip-2500"]').attributes('aria-label')).toBe('Add $25 chip')
  })

  it('rebet clamps to the current bankroll instead of arming a dead Deal', async () => {
    // lost down to $200 with a remembered $300 bet — rebet must re-place only what fits
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'betting', bankroll: 20_000, lastBet: { main: 30_000, side: { buster: 500 } } }
    })
    await w.find('[data-testid="rebet"]').trigger('click')
    expect(w.find('[data-testid="deal"]').attributes('disabled')).toBeUndefined()
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([20_000, {}]) // clamped main; unaffordable side dropped
  })

  it('rebet keeps affordable side stakes', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'betting', bankroll: 100_000, lastBet: { main: 2500, side: { buster: 500 } } }
    })
    await w.find('[data-testid="rebet"]').trigger('click')
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([2500, { buster: 500 }])
  })

  it('says so when the committed amount exceeds the bankroll (no silent dead Deal)', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'betting', bankroll: 20_000 }
    })
    // drive the exposed state directly — UI paths now clamp, this guards future codepaths
    const vm = w.vm as unknown as { mainBet: number }
    vm.mainBet = 30_000
    await w.vm.$nextTick()
    expect(w.find('[data-testid="deal"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bankroll-hint"]').text()).toContain('more than your $200 bankroll')
  })
})

describe('ActionBar — actions & insurance', () => {
  it('enables exactly the legal actions', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'playerTurns', legalActions: ['hit', 'stand'] }
    })
    expect(w.find('[data-testid="act-hit"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="act-double"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="act-stand"]').trigger('click')
    expect(w.emitted('act')![0]).toEqual(['stand'])
  })

  it('offers even money only to a blackjack hand under 3:2 rules', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', heroHasBlackjack: true, lastBet: { main: 1000, side: {} } }
    })
    expect(w.find('[data-testid="even-money"]').exists()).toBe(true)
    await w.find('[data-testid="decline-insurance"]').trigger('click')
    expect(w.emitted('insurance')![0]).toEqual([null])
  })
})

describe('ActionBar — insurance amount & input guards', () => {
  it('derives the insurance amount from the live hand bet, not the remembered bet', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', heroBet: 10_000, lastBet: null }
    })
    expect(w.find('[data-testid="take-insurance"]').text()).toContain('Insure $50')
  })

  it('disables the insurance buy when the bankroll cannot cover it', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', heroBet: 10_000, bankroll: 10_000, inPlay: 10_000 }
    })
    expect(w.find('[data-testid="take-insurance"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="decline-insurance"]').attributes('disabled')).toBeUndefined()
  })

  it('freezes all insurance buttons while the table is presenting', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', heroBet: 1000, insuranceEnabled: false }
    })
    expect(w.find('[data-testid="decline-insurance"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="take-insurance"]').attributes('disabled')).toBeDefined()
  })

  it('exposes the active bet target with aria-pressed', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    expect(w.find('[data-testid="target-main"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-testid="target-buster"]').trigger('click')
    expect(w.find('[data-testid="target-buster"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-testid="target-main"]').attributes('aria-pressed')).toBe('false')
  })

  it('a double-click on Deal emits exactly one deal', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-2500"]').trigger('click')
    await w.find('[data-testid="deal"]').trigger('click')
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')).toHaveLength(1)
  })
})

describe('ActionBar — EV hints', () => {
  it('renders sr-only EV hints when evs are provided', async () => {
    const w = await mountSuspended(ActionBar, {
      props: {
        ...base, phase: 'playerTurns', legalActions: ['hit', 'stand'],
        evs: { hit: -0.41, stand: -0.54 }
      }
    })
    expect(w.find('[data-testid="act-hit"]').text()).toContain('EV -41.0%')
  })

  it('renders the insurance advice line when provided', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', insuranceAdvice: 'Book play: never take insurance.' }
    })
    expect(w.find('[data-testid="insurance-advice"]').text()).toContain('never take insurance')
  })
})
