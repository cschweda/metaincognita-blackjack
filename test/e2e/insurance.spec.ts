import { expect, test } from '@nuxt/test-utils/playwright'
import { SEEDS } from './seeds'
import { betAndDeal, newSession, standUntilComplete } from './helpers'

test('declining insurance continues the round', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.ACE_UP })
  await betAndDeal(page)
  await expect(page.getByTestId('decline-insurance')).toBeVisible()
  await page.getByTestId('decline-insurance').click()
  await standUntilComplete(page)
})

test('even money pays 1:1 immediately on a blackjack vs ace', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.EVEN_MONEY })
  await betAndDeal(page) // $25
  await expect(page.getByTestId('even-money')).toBeVisible()
  await page.getByTestId('even-money').click()
  await expect(page.getByTestId('deal')).toBeVisible()
  await expect(page.getByTestId('nav-bankroll')).toHaveText('$525') // 500 + 25 even money
})
