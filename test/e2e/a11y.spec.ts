import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession } from './helpers'

/** Guidelines §4: axe-clean WCAG 2.1 AA on every user route. */
async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const summary = results.violations.map(v => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map(n => n.target)
  }))
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([])
}

test('setup, learn, drills, lab, history, and analysis pass axe WCAG 2.1 AA', async ({ page, goto }) => {
  for (const path of ['/', '/learn', '/drills', '/lab', '/history', '/analysis']) {
    await goto(path, { waitUntil: 'hydration' })
    await expectAxeClean(page)
  }
})

test('the live table passes axe WCAG 2.1 AA', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await expectAxeClean(page)
})
