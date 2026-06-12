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
