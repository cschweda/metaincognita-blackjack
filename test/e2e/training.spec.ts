import { expect, test } from '@nuxt/test-utils/playwright'
import { newSession } from './helpers'

test('strategy flash grades an answer', async ({ page, goto }) => {
  await goto('/drills', { waitUntil: 'hydration' })
  // Click a visible action button — 'Hit' is always a legal action in the flash drill
  await expect(page.getByRole('button', { name: 'Hit' })).toBeVisible()
  await page.getByRole('button', { name: 'Hit' }).click()
  await expect(page.getByTestId('flash-verdict')).toBeVisible()
  await page.getByTestId('flash-next').click()
  await expect(page.getByTestId('flash-verdict')).toHaveCount(0)
})

test('study mode freezes the table and explains the shoe', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 }) // betting phase — no deal needed for study mode
  await page.getByTestId('study-toggle').click()
  await page.getByTestId('study-hotspot-shoe').click()
  await expect(page.getByTestId('study-popover')).toContainText('cut card')
  await page.getByTestId('chip-2500').click()
  await expect(page.getByTestId('deal')).toBeDisabled() // bet placed but study mode blocks dealing
})
