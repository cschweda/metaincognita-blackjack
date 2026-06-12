import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBlackjackStore, STORAGE_KEY } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

describe('useBlackjackStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function started() {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!),
      mode: 'quick',
      speed: 'normal',
      flair: true,
      botIds: ['bea']
    }, 100_000)
    return store
  }

  it('initSession sets bankroll, settings, and an active session', () => {
    const store = started()
    expect(store.bankroll).toBe(100_000)
    expect(store.sessionActive).toBe(true)
    expect(store.settings!.botIds).toEqual(['bea'])
  })

  it('applyNet moves the bankroll and accumulates session stats', () => {
    const store = started()
    store.applyNet('hands', 1500)
    store.applyNet('side', -500)
    store.applyNet('insurance', -250)
    expect(store.bankroll).toBe(100_750)
    expect(store.session.sideBetNet).toBe(-500)
    expect(store.session.insuranceNet).toBe(-250)
  })

  it('recordRound caps history at 500, newest kept', () => {
    const store = started()
    for (let i = 1; i <= 510; i++) {
      store.recordRound({
        round: i, at: i, visibleCards: [],
        dealer: { cards: [], total: 17, blackjack: false, busted: false },
        spots: []
      })
    }
    expect(store.history).toHaveLength(500)
    expect(store.history[0]!.round).toBe(11)
    expect(store.history[499]!.round).toBe(510)
  })

  it('persists and restores a session round-trip', () => {
    const store = started()
    store.applyNet('hands', 2000)
    store.persist()

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.restore()).toBe(true)
    expect(fresh.bankroll).toBe(102_000)
    expect(fresh.sessionActive).toBe(true)
    expect(fresh.settings!.rules.name).toBe('Vegas Strip 6-deck')
  })

  it('rejects corrupt payloads and clears the key', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = useBlackjackStore()
    expect(store.restore()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('rejects wrong-version payloads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, bankroll: 5 }))
    const store = useBlackjackStore()
    expect(store.restore()).toBe(false)
  })

  it('survives storage quota failures without crashing', () => {
    const store = started()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    expect(() => store.persist()).not.toThrow()
    expect(store.storageAvailable).toBe(false)
    spy.mockRestore()
  })

  it('clearAll wipes state and storage', () => {
    const store = started()
    store.persist()
    store.clearAll()
    expect(store.sessionActive).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
