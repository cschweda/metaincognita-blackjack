import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AnalysisPage from '../../app/pages/analysis.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'

describe('analysis page', () => {
  beforeEach(() => {
    localStorage.clear()
    // training is lifetime (survives clearAll by design) and the pinia store instance
    // is shared across the nuxt test-file worker. Earlier suites (store.test.ts,
    // gameLoop.test.ts) write to training.adherence, so we reset it explicitly here
    // to guarantee a deterministic zero state for this test.
    const store = useBlackjackStore()
    const cats = ['hard', 'soft', 'pair', 'surrender', 'insurance'] as const
    for (const cat of cats) {
      store.training.adherence[cat] = { decisions: 0, correct: 0 }
    }
    store.training.mistakeBag = {}
    store.training.countChecks.splice(0)
  })

  it('renders with an empty store (all zero states)', async () => {
    const store = useBlackjackStore()
    store.clearAll()
    const w = await mountSuspended(AnalysisPage)
    expect(w.find('[data-testid="adherence-overall"]').text()).toBe('0%')
    expect(w.text()).toContain('Clean sheet')
  })
})
