import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppHubLink from '../../app/components/AppHubLink.vue'
import DefaultLayout from '../../app/layouts/default.vue'

const HUB = '[data-testid="hub-link"]'
const ARIA = 'METAINCOGNITA — exit the simulator, back to all the games'

/** Guidelines §5: the hub exit is on every route of every app — and it is not the leave. */
describe('hub exit', () => {
  // Never gated. A player deep in the trainer must always be able to get out, so this
  // renders on the index (where there is no back link at all) as well as at the table.
  it.each(['/', '/table', '/history', '/analysis', '/learn', '/drills', '/lab'])(
    'renders on %s',
    async (route) => {
      const w = await mountSuspended(DefaultLayout, { route })
      expect(w.find(HUB).exists()).toBe(true)
    }
  )

  it('is a real anchor to the hub, not a router push', async () => {
    const w = await mountSuspended(AppHubLink)
    expect(w.element.tagName).toBe('A')
    expect(w.get(HUB).attributes('href')).toBe('https://metaincognita.com')
    // a router link would keep the player inside the SPA; this has to leave it
    expect(w.findAllComponents({ name: 'RouterLink' })).toHaveLength(0)
    expect(w.findAllComponents({ name: 'NuxtLink' })).toHaveLength(0)
  })

  it('exits in the same tab', async () => {
    const w = await mountSuspended(AppHubLink)
    expect(w.get(HUB).attributes('target')).toBeUndefined()
  })

  // WCAG 2.5.3 Label in Name: the accessible name must contain the visible label
  // verbatim. "Meta Incognita floor" reads fine to a human and fails on the space.
  it('has an accessible name containing the visible wordmark', async () => {
    const link = (await mountSuspended(AppHubLink)).get(HUB)
    expect(link.text()).toBe('METAINCOGNITA')
    expect(link.attributes('aria-label')).toBe(ARIA)
    expect(link.attributes('aria-label')).toContain(link.text())
  })

  // The two controls sit side by side in the top-left and are different things, which
  // they must stay: "Leave table" destroys the session and asks first (guidelines §5);
  // the hub exit destroys nothing and never confirms.
  it('coexists with Leave table without opening the leave confirmation', async () => {
    const w = await mountSuspended(DefaultLayout, { route: '/table' })
    const leave = w.findAll('button').find(b => b.text().includes('Leave table'))
    expect(leave).toBeDefined()
    expect(w.find(HUB).exists()).toBe(true)

    // The modal teleports to body, so assert against the document, not the wrapper.
    await w.get(HUB).trigger('click')
    await flushPromises()
    expect(document.body.textContent).not.toContain('Leaving ends the session')

    // ...while the control that *does* destroy the session still asks.
    await leave!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Leaving ends the session')
  })
})
