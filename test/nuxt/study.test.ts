import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StudyHotspots from '../../app/components/table/StudyHotspots.vue'
import { PRESETS } from '../../app/utils/engine/rules'

describe('StudyHotspots', () => {
  it('renders five labeled hotspots with rules-driven copy', async () => {
    const w = await mountSuspended(StudyHotspots, { props: { rules: PRESETS.VEGAS_STRIP_6D! } })
    for (const id of ['shoe', 'discard', 'dealer-rule', 'insurance', 'bet']) {
      expect(w.find(`[data-testid="study-hotspot-${id}"]`).exists()).toBe(true)
    }
    expect(w.find('[data-testid="study-hotspot-shoe"]').attributes('aria-label')).toContain('Study:')
  })
})
