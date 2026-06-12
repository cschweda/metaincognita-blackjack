import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import PresetPicker from '../../app/components/setup/PresetPicker.vue'
import RulesEditor from '../../app/components/setup/RulesEditor.vue'
import BotPicker from '../../app/components/setup/BotPicker.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

beforeEach(() => setActivePinia(createPinia()))

describe('PresetPicker', () => {
  it('renders all five cited presets plus Custom, with model-estimate label', async () => {
    const w = await mountSuspended(PresetPicker, { props: { modelValue: 'VEGAS_STRIP_6D' } })
    for (const key of ['MA_205CMR', 'AC_BALLYS', 'WA_CARDROOM', 'VEGAS_STRIP_6D', 'SINGLE_DECK_65', 'CUSTOM']) {
      expect(w.find(`[data-testid="preset-${key}"]`).exists()).toBe(true)
    }
    expect(w.text()).toContain('model estimate')
    expect(w.text()).toMatch(/≈\d+\.\d{2}% edge/)
  })
})

describe('RulesEditor', () => {
  it('surfaces validation errors from the engine', async () => {
    const rules = cloneRules(PRESETS.CUSTOM!)
    rules.blackjackPayout = '6:5' // with evenMoneyOffered=true → MA §7(d) violation
    const w = await mountSuspended(RulesEditor, { props: { modelValue: rules } })
    expect(w.text()).toContain('evenMoneyOffered requires 3:2')
  })

  it('shows the no-peek caveat only when peek is off', async () => {
    const rules = cloneRules(PRESETS.CUSTOM!)
    rules.dealerPeek = false
    const w = await mountSuspended(RulesEditor, { props: { modelValue: rules } })
    expect(w.text()).toContain('NOT European no-hole-card')
  })
})

describe('BotPicker', () => {
  it('caps selection at max', async () => {
    const w = await mountSuspended(BotPicker, { props: { modelValue: [], max: 2 } })
    await w.find('[data-testid="bot-bea"]').trigger('click')
    await w.find('[data-testid="bot-nancy"]').trigger('click')
    await w.find('[data-testid="bot-mike"]').trigger('click') // over cap — ignored
    const emitted = w.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1]![0]).toHaveLength(2)
  })
})
