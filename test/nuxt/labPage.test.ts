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

  it('labels a simulation with the parameters it ran with, not whatever the inputs say now', async () => {
    // The result card read the live inputs: edit "Rounds per lifetime" after a run and the old
    // chart was relabelled "Went broke within 5,000 rounds"; type 5 and it ran 40 but said 5.
    const w = await mountSuspended(LabPage)
    await w.find('[data-testid="lab-sim-rounds"]').setValue('5') // below the floor → runs 40
    await w.find('[data-testid="lab-sim-traj"]').setValue('10')
    await w.find('[data-testid="lab-simulate"]').trigger('click')
    const result = () => w.find('[data-testid="lab-sim-result"]').text()
    expect(result()).toContain('within 40 rounds')
    expect(result()).toContain('10 lifetimes × 40 rounds')
    await w.find('[data-testid="lab-sim-rounds"]').setValue('5000')
    await w.find('[data-testid="lab-bankroll"]').setValue('123456')
    expect(result()).toContain('within 40 rounds')
    expect(result()).not.toContain('5,000')
  })

  it('refuses a betting unit under one cent — the table hint divides by it', async () => {
    const store = useBlackjackStore()
    const w = await mountSuspended(LabPage)
    await w.find('[data-testid="lab-unit"]').setValue('0.004')
    await w.find('[data-testid="lab-save"]').trigger('click')
    expect(store.training.betRamp?.unitCents).toBe(2500) // unchanged default
  })
})
