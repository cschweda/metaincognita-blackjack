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

describe('PlayingCard — information leaks and accessible names', () => {
  it('never puts a face-down card\'s identity in the DOM (hole card must not leak)', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: false }
    })
    expect(w.text()).not.toContain('A')
    expect(w.text()).not.toContain('♠')
    expect(w.attributes('aria-label')).toBe('Face-down card')
  })

  it('names the card for assistive tech and hides the glyph internals', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: true }
    })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('Ace of spades')
    expect(w.find('.card-front').attributes('aria-hidden')).toBe('true')
  })

  it('names number and court cards naturally', async () => {
    const ten = await mountSuspended(PlayingCard, {
      props: { card: { rank: 10, suit: 'hearts' }, faceUp: true }
    })
    expect(ten.attributes('aria-label')).toBe('10 of hearts')
    const queen = await mountSuspended(PlayingCard, {
      props: { card: { rank: 12, suit: 'diamonds' }, faceUp: true }
    })
    expect(queen.attributes('aria-label')).toBe('Queen of diamonds')
  })
})

describe('ChipStack — accessible naming', () => {
  it('exposes the labelled stack as an image role', async () => {
    const w = await mountSuspended(ChipStack, { props: { amount: 13600 } })
    const labelled = w.find('[aria-label]')
    expect(labelled.exists()).toBe(true)
    expect(labelled.attributes('role')).toBe('img')
  })
})
