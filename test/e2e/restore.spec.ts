import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('a mid-round reload restores the exact table', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await expect(page.getByTestId('act-stand')).toBeEnabled()
  const cardsBefore = await page.locator('[data-testid="seat-3"] .card-perspective').count()

  await page.reload()
  await expect(page.locator('main')).toContainText('Table restored', { timeout: 15_000 })
  await expect(page.locator('[data-testid="seat-3"] .card-perspective')).toHaveCount(cardsBefore)
  await standUntilComplete(page)
})

test('a between-rounds reload restores the same shoe and lets play continue', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)

  await page.reload()
  await expect(page.locator('main')).toContainText('Table restored', { timeout: 15_000 })
  await expect(page.getByTestId('deal')).toBeVisible()

  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)
})
