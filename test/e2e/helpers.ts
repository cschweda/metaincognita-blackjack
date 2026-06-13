import type { Page } from '@playwright/test'
import { expect } from '@nuxt/test-utils/playwright'

export interface SessionOpts {
  seed?: number
  quick?: boolean
  bots?: string[]
}

/** Drives the real setup screen: preset stays Vegas, optional quick mode, optional bots, then deals nothing. */
export async function newSession(page: Page, goto: (url: string, opts: { waitUntil: 'hydration' }) => Promise<unknown>, opts: SessionOpts = {}): Promise<void> {
  await goto(opts.seed ? `/?seed=${opts.seed}` : '/', { waitUntil: 'hydration' })
  for (const bot of opts.bots ?? []) {
    await page.getByTestId(`bot-${bot}`).click()
  }
  if (opts.quick !== false) {
    await page.getByRole('combobox', { name: 'Presentation' }).click()
    await page.getByRole('option', { name: 'Quick play (instant)' }).click()
  }
  await page.getByTestId('start').click()
  await expect(page.getByTestId('deal')).toBeVisible()
}

export async function betAndDeal(page: Page, chips: number[] = [2500]): Promise<void> {
  for (const chip of chips) {
    await page.getByTestId(`chip-${chip}`).click()
  }
  await page.getByTestId('deal').click()
}

export async function declineInsuranceIfOffered(page: Page): Promise<void> {
  const decline = page.getByTestId('decline-insurance')
  if (await decline.isVisible().catch(() => false)) {
    await decline.click()
  }
}

export async function standUntilComplete(page: Page): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const stand = page.getByTestId('act-stand')
    if (!(await stand.isVisible().catch(() => false)) || !(await stand.isEnabled().catch(() => false))) break
    await stand.click()
  }
  await expect(page.getByTestId('deal')).toBeVisible() // back to betting controls = round settled
}
