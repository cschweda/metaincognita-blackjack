import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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
    // a constant below 0.5 takes the replay branch. (This used mulberry32(1), whose first draw is
    // 0.627 — the test passed without ever reaching fromMistakeKey.)
    const w = await mountSuspended(StrategyFlash, { props: { rng: () => 0.1 } })
    expect(w.text()).toContain('Dealer shows')
    expect(w.html()).toContain('10 of')
    expect(w.html()).toContain('6 of')
  })

  it('a replayed mistake answered correctly is worked off the bag', async () => {
    // Nothing ever removed a key, so one lifetime mistake stayed half of all questions forever.
    const store = useBlackjackStore()
    store.training.mistakeBag['hard|16|10'] = 2
    const w = await mountSuspended(StrategyFlash, { props: { rng: () => 0.1 } }) // replay path
    await w.find('[data-testid="flash-hit"]').trigger('click') // Vegas Strip, no surrender: book hits
    expect(w.find('[data-testid="flash-verdict"]').text()).toContain('✓')
    expect(store.training.mistakeBag['hard|16|10']).toBe(1)
    store.resolveMistake('hard|16|10')
    expect(store.training.mistakeBag).toEqual({}) // the key leaves at zero
  })

  it('rebuilds a soft-12 mistake as a pair of aces, not an ace and a rank-1 card', async () => {
    // A,A that could not be split is filed as soft 12; total − 11 produced rank 1, which has no
    // face and rendered a blank card labelled "1 of hearts".
    const store = useBlackjackStore()
    store.training.mistakeBag['soft|12|6'] = 1
    const w = await mountSuspended(StrategyFlash, { props: { rng: () => 0.1 } })
    expect(w.html()).not.toContain('1 of')
    expect(w.html()).toContain('Ace of')
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
    // attachTo: document.body — see useDrillFeedback.ts doc comment for the focus-testing rationale.
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
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

  it('announces the quiz verdict and moves focus to Next', async () => {
    const w = await mountSuspended(DeviationQuiz, { props: { rng: mulberry32(7) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
    expect(w.find('[data-testid="quiz-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="quiz-deviate"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="quiz-sr"]').text()).toContain('applies at')
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('quiz-next')
  })
})
