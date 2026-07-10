import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import PairCancel from '../../app/components/drills/PairCancel.vue'
import DeckCountdown from '../../app/components/drills/DeckCountdown.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { buildDeck, shuffle } from '../../app/utils/engine/cards'
import { hiLoValue } from '../../app/utils/engine/counting'
import { mulberry32 } from '../../app/utils/engine/rng'

// NOTE: Following the repo precedent from drillsStrategy.test.ts — NO setActivePinia here.
// mountSuspended runs inside the Nuxt app which has its own Pinia instance; we reset the
// fields we touch in beforeEach instead.

/** The components deal sequentially from one seeded shuffle, so the test can
 *  recompute the exact same cards and grade against ground truth. */
function seededDeck(seed: number) {
  return shuffle(buildDeck(), mulberry32(seed))
}

describe('PairCancel', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.drillBests = {}
  })

  it('grades the net tag of each pair and tracks streak + lifetime best', async () => {
    const store = useBlackjackStore()
    const deck = seededDeck(21)
    const w = await mountSuspended(PairCancel, { props: { rng: mulberry32(21) } })

    // first pair: answer correctly
    const net0 = hiLoValue(deck[0]!) + hiLoValue(deck[1]!)
    await w.find(`[data-testid="pair-btn-${net0}"]`).trigger('click')
    expect(w.find('[data-testid="pair-verdict"]').text()).toContain('✓')
    expect(store.training.drillBests['pair-cancel']).toBe(1)

    // second pair: answer wrongly — streak resets, best survives
    await w.find('[data-testid="pair-next"]').trigger('click')
    const net1 = hiLoValue(deck[2]!) + hiLoValue(deck[3]!)
    const wrong = net1 === 2 ? -2 : net1 + 1
    await w.find(`[data-testid="pair-btn-${wrong}"]`).trigger('click')
    expect(w.find('[data-testid="pair-verdict"]').text()).toContain('✗')
    expect(w.text()).toContain('Streak: 0')
    expect(store.training.drillBests['pair-cancel']).toBe(1)
  })

  it('explains the cancellation technique when a +1/−1 pair appears', async () => {
    const deck = seededDeck(33)
    // find the first cancelling pair in the seeded sequence
    let cancelAt = -1
    for (let p = 0; p * 2 + 1 < deck.length; p++) {
      const a = hiLoValue(deck[p * 2]!)
      const b = hiLoValue(deck[p * 2 + 1]!)
      if (a + b === 0 && a !== 0) {
        cancelAt = p
        break
      }
    }
    expect(cancelAt).toBeGreaterThanOrEqual(0) // a 52-card deck virtually always has one

    const w = await mountSuspended(PairCancel, { props: { rng: mulberry32(33) } })
    for (let p = 0; p < cancelAt; p++) {
      const net = hiLoValue(deck[p * 2]!) + hiLoValue(deck[p * 2 + 1]!)
      await w.find(`[data-testid="pair-btn-${net}"]`).trigger('click')
      await w.find('[data-testid="pair-next"]').trigger('click')
    }
    await w.find('[data-testid="pair-btn-0"]').trigger('click')
    expect(w.find('[data-testid="pair-verdict"]').text().toLowerCase()).toContain('cancel')
  })

  it('announces the pair verdict and moves focus to Next pair', async () => {
    const w = await mountSuspended(PairCancel, { props: { rng: mulberry32(5) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
    expect(w.find('[data-testid="pair-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="pair-btn-0"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="pair-sr"]').text()).toMatch(/net/)
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('pair-next')
    await w.find('[data-testid="pair-next"]').trigger('click')
    expect(w.find('[data-testid="pair-sr"]').text()).toBe('')
  })
})

describe('DeckCountdown', () => {
  beforeEach(() => {
    localStorage.clear()
    const store = useBlackjackStore()
    store.training.drillTimes = {}
  })

  it('self-verifies against the hidden card and records best time on a correct run', async () => {
    vi.useFakeTimers()
    const store = useBlackjackStore()
    const deck = seededDeck(7)
    const hiddenTag = hiLoValue(deck[0]!) // component sets the FIRST shuffled card aside

    const w = await mountSuspended(DeckCountdown, { props: { rng: mulberry32(7) } })
    await w.find('[data-testid="countdown-start"]').trigger('click')
    expect(w.text()).toContain('1 / 51')

    vi.advanceTimersByTime(4000)
    for (let i = 0; i < 50; i++) {
      await w.find('[data-testid="countdown-advance"]').trigger('click')
    }
    expect(w.text()).toContain('51 / 51')
    await w.find('[data-testid="countdown-advance"]').trigger('click') // past the last card

    await w.find('[data-testid="countdown-answer"]').setValue(String(-hiddenTag))
    await w.find('[data-testid="countdown-submit"]').trigger('click')
    const verdict = w.find('[data-testid="countdown-verdict"]').text()
    expect(verdict).toContain('✓')
    expect(store.training.drillTimes['deck-countdown']).toBe(4000)
    vi.useRealTimers()
  })

  it('does not record a time when the entered count is wrong', async () => {
    vi.useFakeTimers()
    const store = useBlackjackStore()
    const deck = seededDeck(11)
    const hiddenTag = hiLoValue(deck[0]!)

    const w = await mountSuspended(DeckCountdown, { props: { rng: mulberry32(11) } })
    await w.find('[data-testid="countdown-start"]').trigger('click')
    for (let i = 0; i < 51; i++) {
      await w.find('[data-testid="countdown-advance"]').trigger('click')
    }
    await w.find('[data-testid="countdown-answer"]').setValue(String(-hiddenTag + 1))
    await w.find('[data-testid="countdown-submit"]').trigger('click')
    expect(w.find('[data-testid="countdown-verdict"]').text()).toContain('✗')
    expect(store.training.drillTimes['deck-countdown']).toBeUndefined()
    vi.useRealTimers()
  })

  it('advances with the Space key and flips two at a time in pairs mode', async () => {
    vi.useFakeTimers()
    const w = await mountSuspended(DeckCountdown, { props: { rng: mulberry32(5) } })
    await w.find('[data-testid="countdown-mode-pairs"]').trigger('click')
    await w.find('[data-testid="countdown-start"]').trigger('click')
    expect(w.text()).toContain('2 / 51') // pairs mode reveals two cards at once

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    await w.vm.$nextTick()
    expect(w.text()).toContain('4 / 51')
    vi.useRealTimers()
  })

  it('announces the countdown verdict and moves focus to Again', async () => {
    vi.useFakeTimers()
    const w = await mountSuspended(DeckCountdown, { props: { rng: mulberry32(13) }, attachTo: document.body })
    onTestFinished(() => w.unmount())
    expect(w.find('[data-testid="countdown-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="countdown-start"]').trigger('click')
    for (let i = 0; i < 51; i++) {
      await w.find('[data-testid="countdown-advance"]').trigger('click')
    }
    await w.find('[data-testid="countdown-answer"]').setValue('0')
    await w.find('[data-testid="countdown-submit"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="countdown-sr"]').text()).toMatch(/count/)
    await nextTick() // announce() focuses on the tick after the text lands
    expect(document.activeElement?.getAttribute('data-testid')).toBe('countdown-again')
    vi.useRealTimers()
  })
})
