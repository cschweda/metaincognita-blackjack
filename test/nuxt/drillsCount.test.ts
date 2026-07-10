import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import CountDrill from '../../app/components/drills/CountDrill.vue'
import TrueCountDrill from '../../app/components/drills/TrueCountDrill.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { mulberry32 } from '../../app/utils/engine/rng'

// NOTE: Following the repo precedent from drillsStrategy.test.ts — NO setActivePinia(createPinia()) here.
// mountSuspended runs inside the Nuxt app which has its own Pinia instance. setActivePinia would
// create a separate Pinia that the component cannot see. Instead we get the Nuxt Pinia store
// directly via useBlackjackStore() and reset what we touch in beforeEach.

describe('CountDrill', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.drillBests = {}
    store.training.countChecks.splice(0)
  })

  it('flashes groups on a timer, then grades the entered RC', async () => {
    vi.useFakeTimers()
    const store = useBlackjackStore()
    const w = await mountSuspended(CountDrill, { props: { rng: mulberry32(3) } })
    await w.find('[data-testid="count-start"]').trigger('click')
    expect(w.find('[data-testid="count-flashing"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1100 * 21) // 20 singles + the terminal tick
    await w.vm.$nextTick()
    expect(w.find('[data-testid="count-answer"]').exists()).toBe(true)
    await w.find('[data-testid="count-answer"]').setValue('0')
    await w.find('[data-testid="count-submit"]').trigger('click')
    expect(w.find('[data-testid="count-result"]').text()).toMatch(/✓|✗/)
    expect(store.training.countChecks).toHaveLength(1)
    vi.useRealTimers()
  })

  it('announces the count verdict and moves focus to Again', async () => {
    vi.useFakeTimers()
    const w = await mountSuspended(CountDrill, { props: { rng: mulberry32(3) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
    expect(w.find('[data-testid="count-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="count-start"]').trigger('click')
    await vi.advanceTimersByTimeAsync(1100 * 21) // 20 singles + the terminal tick
    await w.vm.$nextTick()
    await w.find('[data-testid="count-answer"]').setValue('0')
    await w.find('[data-testid="count-submit"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="count-sr"]').text()).toMatch(/RC/)
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('count-again')
    vi.useRealTimers()
  })
})

describe('TrueCountDrill', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.drillBests = {}
  })

  it('grades within ±0.5 of RC ÷ decks remaining', async () => {
    const w = await mountSuspended(TrueCountDrill, { props: { rng: mulberry32(9) } })
    const text = w.find('[data-testid="tc-question"]').text()
    const rc = Number(text.match(/([+-]?\d+)/)![1])
    const decks = Number(text.match(/([\d.]+) decks left/)![1])
    const actual = rc / decks
    await w.find('[data-testid="tc-answer"]').setValue(String(Math.round(actual * 2) / 2))
    await w.find('[data-testid="tc-submit"]').trigger('click')
    expect(w.find('[data-testid="tc-verdict"]').text()).toContain('✓')
  })

  it('announces the TC verdict and moves focus to Next', async () => {
    const w = await mountSuspended(TrueCountDrill, { props: { rng: mulberry32(9) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
    expect(w.find('[data-testid="tc-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="tc-answer"]').setValue('0')
    await w.find('[data-testid="tc-submit"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="tc-sr"]').text()).toContain('TC =')
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('tc-next')
  })
})
