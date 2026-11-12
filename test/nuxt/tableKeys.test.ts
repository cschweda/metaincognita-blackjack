import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TablePage from '../../app/pages/table.vue'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { __resetCountingForTests } from '../../app/composables/useCounting'
import type { SessionSettings } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

function settings(): SessionSettings {
  const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return {
    rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
    advisor: 'feedback', count: 'off', advancedDeviations: false
  } as SessionSettings
}

function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('table keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
  })

  it('Space deals when focus is on the page, not on a control', async () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 21)
    const page = await mountSuspended(TablePage, { attachTo: document.body })
    await page.find('[data-testid="chip-2500"]').trigger('click')
    press(document.body, ' ')
    expect(loop.phase.value).not.toBe('betting')
    page.unmount()
  })

  it('Space on a keyboard-focused control is left to that control — it must not deal the round', async () => {
    // A keyboard user tabs to a chip, Clear, Keys or Study and presses Space to activate it. The
    // page-level shortcut swallowed the key and dealt the armed bet instead — including when the
    // control was the very toggle that turns shortcuts off.
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 21)
    const page = await mountSuspended(TablePage, { attachTo: document.body })
    await page.find('[data-testid="chip-2500"]').trigger('click')
    const chip = page.find('[data-testid="chip-500"]').element as HTMLElement
    press(document.body, 'Tab') // the user tabbed here
    chip.focus()
    press(chip, ' ')
    expect(loop.phase.value).toBe('betting')
    // …and the same chip reached with the mouse still lets Space deal
    window.dispatchEvent(new Event('pointerdown'))
    press(chip, ' ')
    expect(loop.phase.value).not.toBe('betting')
    page.unmount()
  })

  it('hands focus to Deal when the round ends, instead of dropping it on <body>', async () => {
    // The action buttons unmount at settlement. With nothing taking focus, a keyboard user with
    // shortcuts off had to tab back through the whole page every single round.
    const loop = useGameLoop()
    // find a seed whose round actually reaches a hero decision (no opening blackjack)
    let seed = 20
    do {
      __resetGameLoopForTests()
      loop.startSession(settings(), 100_000, ++seed)
      loop.beginRound(2500, {})
    } while (loop.phase.value !== 'playerTurns')
    __resetGameLoopForTests()
    loop.startSession(settings(), 100_000, seed)
    const page = await mountSuspended(TablePage, { attachTo: document.body })
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')
    expect(loop.phase.value).toBe('playerTurns')
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 12) {
      await page.find('[data-testid="act-stand"]').trigger('click')
    }
    expect(loop.phase.value).toBe('complete')
    await new Promise(resolve => setTimeout(resolve, 450)) // past Deal's double-click cooldown
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-testid')).toBe('deal')
    page.unmount()
  })
})
