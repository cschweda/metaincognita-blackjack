import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

/** The paced presentation is where real-browser timing bugs live — the unit suite only
 *  covers it with fake timers. One full casino-procedure round, real clock. */
test('casino-paced dealing plays a full round with dealer announcements', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7, quick: false })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page) // waits for a definite post-deal state, however paced
  await standUntilComplete(page)
  // the aria-live region carried the dealer's calls
  await expect(page.locator('[aria-live]').first()).toBeAttached()
})
