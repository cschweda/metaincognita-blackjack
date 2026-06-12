import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BlackjackTable from '../../app/components/table/BlackjackTable.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

describe('BlackjackTable', () => {
  it('renders one seat anchor per rules.spots (7)', async () => {
    const w = await mountSuspended(BlackjackTable, { props: { rules: PRESETS.VEGAS_STRIP_6D! } })
    expect(w.findAll('[data-testid^="seat-"]')).toHaveLength(7)
    expect(w.text()).toContain('BLACKJACK PAYS 3 TO 2')
    expect(w.text()).toContain('DEALER STANDS ON ALL 17s')
  })

  it('renders 9 seats for the Washington preset', async () => {
    const w = await mountSuspended(BlackjackTable, { props: { rules: PRESETS.WA_CARDROOM! } })
    expect(w.findAll('[data-testid^="seat-"]')).toHaveLength(9)
  })

  it('felt text follows the rules: 6:5 and H17', async () => {
    const r = cloneRules(PRESETS.SINGLE_DECK_65!)
    const w = await mountSuspended(BlackjackTable, { props: { rules: r } })
    expect(w.text()).toContain('BLACKJACK PAYS 6 TO 5')
    expect(w.text()).toContain('DEALER HITS SOFT 17')
  })
})
