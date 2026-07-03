import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession } from './helpers'

// Seeds hunted against the current MA deal stream (see seeds.ts for the re-hunt procedure):
// MA preset, heads-up quick play, $25 bet — both reach a two-card hero turn on round one
// where every first-two-cards action (double, late surrender) is on the table.

test('doubling down doubles the stake and resolves the round', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 2, preset: 'MA_205CMR' })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-double').click()
  // the doubled stake shows on the felt and the round settles back to betting
  await expect(page.locator('[data-testid="seat-3"]').getByLabel('Bet $50')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('deal')).toBeVisible()
})

test('late surrender forfeits exactly half the wager', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 1, preset: 'MA_205CMR' })
  await betAndDeal(page) // $25 from the $500 default bankroll
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-surrender').click()
  await expect(page.getByTestId('deal')).toBeVisible()
  await expect(page.getByTestId('nav-bankroll')).toHaveText('$487.50')
})
