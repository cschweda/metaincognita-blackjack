import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DefaultLayout from '../../app/layouts/default.vue'

describe('default layout', () => {
  it('renders the five training nav links', async () => {
    const w = await mountSuspended(DefaultLayout)
    for (const id of ['nav-history', 'nav-analysis', 'nav-learn', 'nav-drills', 'nav-bet-lab']) {
      expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true)
    }
  })
})
