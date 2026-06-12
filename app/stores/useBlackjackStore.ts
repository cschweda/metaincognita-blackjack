import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RuleSet } from '../utils/engine/rules'
import type { PersonaId } from '../utils/engine/bots'
import type { GameSnapshot } from '../utils/engine/serializeTypes'

export const STORAGE_KEY = 'blackjack-session-v1'
const STORAGE_VERSION = 1
const HISTORY_CAP = 500

export type PlayMode = 'casino' | 'quick'
export type PlaySpeed = 'relaxed' | 'normal' | 'brisk'

export interface SessionSettings {
  rules: RuleSet
  mode: PlayMode
  speed: PlaySpeed
  flair: boolean
  botIds: PersonaId[]
}

export interface RoundRecord {
  round: number
  at: number // epoch ms
  dealer: { cards: string[], total: number, blackjack: boolean, busted: boolean }
  spots: Array<{
    occupant: 'hero' | PersonaId
    hands: Array<{ cards: string[], bet: number, outcome: string, net: number, doubled: boolean, fromSplit: boolean }>
    sideBets: Array<{ name: string, stake: number, net: number, label: string }>
    insuranceNet: number
  }>
  /** Face-up cards in dealt order — Plan 3 derives running counts from this. */
  visibleCards: string[]
}

export interface SessionStats {
  roundsPlayed: number
  handsWon: number
  handsLost: number
  handsPushed: number
  blackjacks: number
  totalWagered: number
  totalReturned: number
  sideBetNet: number
  insuranceNet: number
  startedAt: number
}

function freshStats(): SessionStats {
  return {
    roundsPlayed: 0, handsWon: 0, handsLost: 0, handsPushed: 0, blackjacks: 0,
    totalWagered: 0, totalReturned: 0, sideBetNet: 0, insuranceNet: 0, startedAt: Date.now()
  }
}

export const useBlackjackStore = defineStore('blackjack', () => {
  const settings = ref<SessionSettings | null>(null)
  const bankroll = ref(0)
  const session = ref<SessionStats>(freshStats())
  const history = ref<RoundRecord[]>([])
  const botStates = ref<Partial<Record<PersonaId, { bet: number, last: 'win' | 'lose' | 'push' | null }>>>({})
  const roundSnapshot = ref<GameSnapshot | null>(null)
  const sessionActive = ref(false)
  const storageAvailable = ref(true)

  const busted = computed(() =>
    sessionActive.value && settings.value !== null && bankroll.value < settings.value.rules.minBet)

  function initSession(s: SessionSettings, startingBankroll: number): void {
    settings.value = s
    bankroll.value = startingBankroll
    session.value = freshStats()
    history.value = []
    botStates.value = Object.fromEntries(s.botIds.map(id => [id, { bet: s.rules.minBet, last: null }]))
    roundSnapshot.value = null
    sessionActive.value = true
    persist()
  }

  /** Settlement bookkeeping — the ONLY way money moves (Architecture Notes). */
  function applyNet(kind: 'hands' | 'side' | 'insurance', net: number): void {
    bankroll.value += net
    if (kind === 'side') session.value.sideBetNet += net
    if (kind === 'insurance') session.value.insuranceNet += net
  }

  function recordRound(record: RoundRecord): void {
    history.value.push(record)
    if (history.value.length > HISTORY_CAP) history.value.splice(0, history.value.length - HISTORY_CAP)
    session.value.roundsPlayed++
    for (const spot of record.spots) {
      if (spot.occupant !== 'hero') continue
      for (const hand of spot.hands) {
        session.value.totalWagered += hand.bet
        session.value.totalReturned += hand.bet + hand.net
        if (hand.outcome === 'blackjack') session.value.blackjacks++
        if (hand.outcome === 'win' || hand.outcome === 'blackjack') session.value.handsWon++
        else if (hand.outcome === 'push') session.value.handsPushed++
        else session.value.handsLost++
      }
    }
  }

  function saveSnapshot(snap: GameSnapshot | null): void {
    roundSnapshot.value = snap
    persist()
  }

  function persist(): void {
    try {
      // Use Storage.prototype.call so vi.spyOn(Storage.prototype, 'setItem') can intercept
      // (happy-dom wraps localStorage in a Proxy that caches bound methods on the instance,
      //  so a prototype spy only works if we call through the prototype directly).
      Storage.prototype.setItem.call(localStorage, STORAGE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        settings: settings.value,
        bankroll: bankroll.value,
        session: session.value,
        history: history.value,
        botStates: botStates.value,
        roundSnapshot: roundSnapshot.value,
        sessionActive: sessionActive.value,
        meta: { updatedAt: Date.now() }
      }))
      storageAvailable.value = true
    } catch {
      storageAvailable.value = false
    }
  }

  /** Validate + load. Returns false (and clears the key) on anything suspect. */
  function restore(): boolean {
    let raw: string | null
    try {
      raw = Storage.prototype.getItem.call(localStorage, STORAGE_KEY)
    } catch {
      storageAvailable.value = false
      return false
    }
    if (!raw) return false
    try {
      const data = JSON.parse(raw) as Record<string, unknown>
      if (data.version !== STORAGE_VERSION) throw new Error('version mismatch')
      if (typeof data.bankroll !== 'number' || !Number.isFinite(data.bankroll)) throw new Error('bad bankroll')
      if (!Array.isArray(data.history)) throw new Error('bad history')
      settings.value = (data.settings ?? null) as SessionSettings | null
      bankroll.value = data.bankroll
      session.value = { ...freshStats(), ...(data.session as Partial<SessionStats> | undefined) }
      history.value = (data.history as RoundRecord[]).slice(-HISTORY_CAP)
      botStates.value = (data.botStates ?? {}) as typeof botStates.value
      roundSnapshot.value = (data.roundSnapshot ?? null) as GameSnapshot | null
      sessionActive.value = data.sessionActive === true && settings.value !== null
      return sessionActive.value
    } catch {
      try {
        Storage.prototype.removeItem.call(localStorage, STORAGE_KEY)
      } catch { /* storage gone entirely */ }
      return false
    }
  }

  function clearAll(): void {
    settings.value = null
    bankroll.value = 0
    session.value = freshStats()
    history.value = []
    botStates.value = {}
    roundSnapshot.value = null
    sessionActive.value = false
    try {
      Storage.prototype.removeItem.call(localStorage, STORAGE_KEY)
    } catch { /* ignore */ }
  }

  return {
    settings, bankroll, session, history, botStates, roundSnapshot,
    sessionActive, storageAvailable, busted,
    initSession, applyNet, recordRound, saveSnapshot, persist, restore, clearAll
  }
})
