import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DealerArea from '../../app/components/table/DealerArea.vue'
import SpotSeat from '../../app/components/table/SpotSeat.vue'
import type { SpotView } from '../../app/composables/useGameLoop'

describe('DealerArea', () => {
  it('renders cards with the hole face-down and a live region', async () => {
    const w = await mountSuspended(DealerArea, {
      props: {
        cards: [
          { card: { rank: 9, suit: 'hearts' }, faceUp: true },
          { card: { rank: 13, suit: 'spades' }, faceUp: false }
        ],
        trayFill: 0.25,
        penetration: 0.75,
        announcement: 'Dealer shows 9',
        liveText: 'Dealer shows 9'
      }
    })
    expect(w.findAll('.card-perspective')).toHaveLength(2)
    expect(w.findAll('.is-flipped')).toHaveLength(1) // only the upcard
    expect(w.find('[role="status"]').text()).toBe('Dealer shows 9')
  })
})

describe('SpotSeat', () => {
  const spot: SpotView = {
    spotId: 3,
    occupant: 'hero',
    activeHandIndex: 0,
    sideResults: [],
    quip: null,
    hands: [{
      cards: [{ rank: 14, suit: 'spades' }, { rank: 6, suit: 'clubs' }],
      bet: 1000, doubled: false, fromSplit: false, outcome: null, net: 0
    }]
  }

  it('shows the soft total and the hero label', async () => {
    const w = await mountSuspended(SpotSeat, { props: { spot, isHero: true, isActive: true } })
    expect(w.text()).toContain('soft 17')
    expect(w.text()).toContain('You')
  })

  it('shows persona name, quip, and outcome badge for a settled bot hand', async () => {
    const botSpot: SpotView = {
      ...spot,
      occupant: 'nancy',
      quip: 'See? Patience.',
      hands: [{ ...spot.hands[0]!, outcome: 'win', net: 1000 }]
    }
    const w = await mountSuspended(SpotSeat, { props: { spot: botSpot, isHero: false, isActive: false } })
    expect(w.text()).toContain('Never-Bust Nancy')
    expect(w.text()).toContain('See? Patience.')
    expect(w.text()).toContain('WIN')
  })
})
