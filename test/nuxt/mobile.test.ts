import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BotChips from '../../app/components/table/BotChips.vue'
import type { SpotView } from '../../app/composables/useGameLoop'

const SPOTS: SpotView[] = [
  {
    spotId: 2, occupant: 'bea', activeHandIndex: 0, sideResults: [], quip: 'The chart provides.',
    hands: [{ cards: [], bet: 1000, doubled: false, fromSplit: false, outcome: 'win', net: 1000 }]
  },
  {
    spotId: 3, occupant: 'hero', activeHandIndex: 0, sideResults: [], quip: null,
    hands: [{ cards: [], bet: 2500, doubled: false, fromSplit: false, outcome: null, net: 0 }]
  }
]

describe('BotChips', () => {
  it('lists bots (never the hero) with outcome and quip, hidden on md+', async () => {
    const w = await mountSuspended(BotChips, { props: { spots: SPOTS } })
    const strip = w.find('[data-testid="bot-chips"]')
    expect(strip.exists()).toBe(true)
    expect(strip.classes()).toContain('md:hidden')
    expect(strip.text()).toContain('By-the-Book Bea')
    expect(strip.text()).toContain('WIN')
    expect(strip.text()).not.toContain('You')
  })

  it('renders nothing without bots', async () => {
    const w = await mountSuspended(BotChips, { props: { spots: [SPOTS[1]!] } })
    expect(w.find('[data-testid="bot-chips"]').exists()).toBe(false)
  })
})
