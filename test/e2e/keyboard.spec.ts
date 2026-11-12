import { expect, test } from '@nuxt/test-utils/playwright'
import { newSession } from './helpers'

/** Has a round been dealt? The session payload carries a round snapshot from the first hero
 *  decision or settlement onward; a session that has only been set up stores null. */
async function dealt(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('blackjack-session-v1') ?? '{}').roundSnapshot != null)
}

test('Space deals after clicking chips with the mouse', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await page.getByTestId('chip-2500').click()
  await page.keyboard.press('Space')
  await expect.poll(() => dealt(page)).toBe(true)
})

test('Space on a control reached by keyboard activates the control, not the deal', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await page.getByTestId('chip-2500').click()
  await page.keyboard.press('Tab') // keyboard focus moves to the next control
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  expect(focused).toBeTruthy()
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  expect(await dealt(page)).toBe(false)
  await expect(page.getByTestId('deal')).toBeVisible()
})

test('focus lands on Deal when a round settles', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await page.getByTestId('chip-2500').click()
  await page.getByTestId('deal').click()
  const decline = page.getByTestId('decline-insurance')
  await decline.or(page.getByTestId('act-stand')).or(page.getByTestId('deal')).first().waitFor()
  if (await decline.isVisible()) await decline.click()
  for (let i = 0; i < 8 && await page.getByTestId('act-stand').isVisible().catch(() => false); i++) {
    await page.keyboard.press('s')
  }
  await expect(page.getByTestId('deal')).toBeFocused({ timeout: 5000 })
})
