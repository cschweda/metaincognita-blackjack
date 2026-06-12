import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PlayingCard from '../../app/components/cards/PlayingCard.vue'
import ChipStack from '../../app/components/table/ChipStack.vue'

describe('PlayingCard', () => {
  it('renders rank and suit when face up', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: true }
    })
    expect(w.text()).toContain('A')
    expect(w.text()).toContain('♠')
    expect(w.find('.card-inner').classes()).toContain('is-flipped')
  })

  it('hides the face and shows the back when face down', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: false }
    })
    expect(w.find('.card-inner').classes()).not.toContain('is-flipped')
  })
})

describe('ChipStack', () => {
  it('decomposes an amount into denominations, capped stack', async () => {
    const w = await mountSuspended(ChipStack, { props: { amount: 13600 } }) // $136 = 100+25+5+5+1
    expect(w.text()).toContain('$136')
    expect(w.findAll('.rounded-full.border-dashed').length).toBe(5)
  })

  it('renders nothing for zero', async () => {
    const w = await mountSuspended(ChipStack, { props: { amount: 0 } })
    expect(w.find('[aria-label]').exists()).toBe(false)
  })
})
