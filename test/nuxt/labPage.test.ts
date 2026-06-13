import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LabPage from '../../app/pages/lab.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'

// NOTE: repo precedent — no setActivePinia with mountSuspended (the Nuxt app owns Pinia).
// happy-dom has no Worker, so the page exercises its main-thread fallback here: the
// 2000-round engine pass runs synchronously in onMounted and stats are ready at once.

describe('lab page', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.betRamp = null
    store.training.betHintsEnabled = false
  })

  it('renders the ramp editor with measured instant stats', async () => {
    const w = await mountSuspended(LabPage)
    expect(w.find('[data-testid="lab-unit"]').exists()).toBe(true)
    expect(w.find('[data-testid="lab-step-5"]').exists()).toBe(true)
    const ev = w.find('[data-testid="lab-ev-round"]').text()
    expect(ev).toMatch(/\$\d/) // a real computed dollar figure, not a placeholder
    expect(w.find('[data-testid="lab-ruin"]').text()).toMatch(/%$/)
  })

  it('recomputes the instant stats when the unit changes', async () => {
    const w = await mountSuspended(LabPage)
    const before = w.find('[data-testid="lab-ev-round"]').text()
    await w.find('[data-testid="lab-unit"]').setValue('100') // $25 → $100 unit
    const after = w.find('[data-testid="lab-ev-round"]').text()
    expect(after).not.toBe(before)
  })

  it('saves the ramp and the coaching toggle to lifetime training', async () => {
    const store = useBlackjackStore()
    const w = await mountSuspended(LabPage)
    await w.find('[data-testid="lab-unit"]').setValue('50')
    await w.find('[data-testid="lab-save"]').trigger('click')
    expect(store.training.betRamp?.unitCents).toBe(5000)
    expect(store.training.betHintsEnabled).toBe(false)
  })
})
