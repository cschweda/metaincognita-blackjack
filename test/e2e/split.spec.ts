import { expect, test } from '@nuxt/test-utils/playwright'
import { SEEDS } from './seeds'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('splitting 8,8 produces two played hands', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.PAIR })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  // After split: two separate chip stacks appear (one per hand) and the hero still has an action
  await expect(page.locator('[data-testid="seat-3"]').getByLabel(/^Bet \$/)).toHaveCount(2, { timeout: 10_000 })
  await standUntilComplete(page)
})

test('resplitting forms a third hand', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.RESPLIT })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  await page.getByTestId('act-split').click()
  // After two splits: three separate chip stacks appear
  await expect(page.locator('[data-testid="seat-3"]').getByLabel(/^Bet \$/)).toHaveCount(3, { timeout: 10_000 })
  await standUntilComplete(page)
})

test('split aces take exactly one card each and the round resolves', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.ACES })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  // Aces are one-card: both hands auto-complete, dealer plays out, betting controls return
  await expect(page.getByTestId('deal')).toBeVisible()
  // Two resolved hands visible with their chip stacks
  await expect(page.locator('[data-testid="seat-3"]').getByLabel(/^Bet \$/)).toHaveCount(2)
})
