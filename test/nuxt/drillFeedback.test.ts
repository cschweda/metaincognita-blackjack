import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick } from 'vue'
import { useDrillFeedback } from '../../app/composables/useDrillFeedback'

describe('useDrillFeedback', () => {
  it('focuses a plain HTMLElement target (the non-$el arm)', async () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    onTestFinished(() => btn.remove())
    const { srText, focusEl, announce, clear } = useDrillFeedback()
    focusEl.value = btn
    announce('verdict text')
    expect(srText.value).toBe('verdict text')
    await nextTick()
    expect(document.activeElement).toBe(btn)
    clear()
    expect(srText.value).toBe('')
  })

  it('announce with no focus target still sets the text without throwing', async () => {
    const { srText, announce } = useDrillFeedback()
    announce('lonely message')
    await nextTick()
    expect(srText.value).toBe('lonely message')
  })
})
