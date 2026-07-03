import { expect, test } from '@nuxt/test-utils/playwright'

/** The Bet Lab's worker never runs in unit environments (happy-dom has no Worker) —
 *  this spec is the only place the real worker protocol executes end-to-end. */
test('the Bet Lab measures TC frequencies and runs a worker simulation to a fan chart', async ({ page, goto }) => {
  await goto('/lab', { waitUntil: 'hydration' })
  // the mount-time frequency measurement (2000 engine rounds in the worker) must land
  await expect(page.getByTestId('lab-ev-round')).toBeVisible({ timeout: 60_000 })

  // shrink the run so CI stays quick, then simulate through the real worker
  await page.locator('[data-testid="lab-sim-rounds"] input, input[data-testid="lab-sim-rounds"]').first().fill('80')
  await page.locator('[data-testid="lab-sim-traj"] input, input[data-testid="lab-sim-traj"]').first().fill('40')
  await page.getByTestId('lab-simulate').click()
  await expect(page.getByTestId('lab-sim-result')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-testid="lab-sim-result"] svg')).toBeVisible() // the fan chart
})
