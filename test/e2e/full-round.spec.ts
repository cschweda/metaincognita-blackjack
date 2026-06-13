import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('full quick-mode round settles and lands in history', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)
  await expect(page.locator('main')).toContainText(/WIN|LOSE|PUSH|BLACKJACK|SURRENDER/)
  await page.getByTestId('nav-history').click()
  await expect(page.locator('main')).toContainText('Round 1')
})
