import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import StrategyFlash from '../../app/components/drills/StrategyFlash.vue'
import DeviationQuiz from '../../app/components/drills/DeviationQuiz.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { mulberry32 } from '../../app/utils/engine/rng'

// NOTE: Following the repo precedent from panels.test.ts — NO setActivePinia(createPinia()) here.
// mountSuspended runs inside the Nuxt app which has its own Pinia instance. setActivePinia would
// create a separate Pinia that the component cannot see. Instead we get the Nuxt Pinia store
// directly via useBlackjackStore() and reset what we touch in beforeEach.

describe('StrategyFlash', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    // reset training state that tests might modify
    store.training.mistakeBag = {}
    store.training.drillBests = {}
  })

  it('grades an answer against the engine book play and tracks the streak', async () => {
    const store = useBlackjackStore()
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) } })
    // find first action button (clock span also matches the prefix, so narrow to button)
    const firstLegal = w.find('button[data-testid^="flash-"]')
    expect(firstLegal.exists()).toBe(true)
    await firstLegal.trigger('click')
    const verdict = w.find('[data-testid="flash-verdict"]')
    expect(verdict.exists()).toBe(true)
    expect(verdict.text()).toMatch(/✓|✗/)
    await w.find('[data-testid="flash-next"]').trigger('click')
    expect(w.find('[data-testid="flash-verdict"]').exists()).toBe(false)
    void store
  })

  it('replays mistakeBag situations (seeded rng path executes fromMistakeKey)', async () => {
    const store = useBlackjackStore()
    store.training.mistakeBag['hard|16|10'] = 3
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(1) } }) // first rng() = 0.2536 < 0.5 → replay path
    expect(w.text()).toContain('Dealer shows')
  })

  it('timed mode counts a timeout as a miss', async () => {
    vi.useFakeTimers()
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) } })
    expect(w.find('[data-testid="flash-clock"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_500)
    await w.vm.$nextTick()
    expect(w.find('[data-testid="flash-verdict"]').text()).toContain('Too slow')
    vi.useRealTimers()
  })

  it('announces the verdict in a live region and moves focus to Next', async () => {
    // attachTo: document.body — document.activeElement only reflects real focus moves for
    // elements connected to the document; mountSuspended's default container is detached.
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) }, attachTo: document.body })
    const sr = w.find('[data-testid="flash-sr"]')
    expect(sr.attributes('role')).toBe('status')
    expect(sr.text()).toBe('')
    await w.find('button[data-testid^="flash-"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="flash-sr"]').text()).toMatch(/book play|Book:/)
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('flash-next')
    await w.find('[data-testid="flash-next"]').trigger('click')
    expect(w.find('[data-testid="flash-sr"]').text()).toBe('')
    w.unmount()
  })
})

describe('DeviationQuiz', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.drillBests = {}
  })

  it('grades deviate-vs-book correctly against the rolled TC', async () => {
    const w = await mountSuspended(DeviationQuiz, { props: { rng: mulberry32(7) } })
    expect(w.find('[data-testid="quiz-situation"]').text()).toContain('TC')
    await w.find('[data-testid="quiz-deviate"]').trigger('click')
    const verdict = w.find('[data-testid="quiz-verdict"]')
    expect(verdict.exists()).toBe(true)
    expect(verdict.text()).toMatch(/applies at TC/)
  })

  it('always offers two distinct answers — the book side comes from the engine', async () => {
    const w = await mountSuspended(DeviationQuiz, { props: { rng: mulberry32(3) } })
    for (let i = 0; i < 60; i++) {
      const deviate = w.find('[data-testid="quiz-deviate"]')
      const book = w.find('[data-testid="quiz-book"]')
      expect(deviate.exists()).toBe(true)
      expect(book.exists()).toBe(true)
      expect(deviate.text().trim().toLowerCase()).not.toBe(book.text().trim().toLowerCase())
      await deviate.trigger('click')
      await w.find('[data-testid="quiz-next"]').trigger('click')
    }
  })

  it('shows stand as the book answer for the negative-count hit deviations', async () => {
    const w = await mountSuspended(DeviationQuiz, { props: { rng: mulberry32(3) } })
    for (let i = 0; i < 200; i++) {
      const situation = w.find('[data-testid="quiz-situation"]').text()
      if (/hard 13 vs dealer 2/.test(situation)) {
        expect(w.find('[data-testid="quiz-book"]').text().trim().toLowerCase()).toBe('stand')
        return
      }
      await w.find('[data-testid="quiz-deviate"]').trigger('click')
      await w.find('[data-testid="quiz-next"]').trigger('click')
    }
    throw new Error('never rolled hard 13 vs dealer 2 in 200 questions')
  })
})
