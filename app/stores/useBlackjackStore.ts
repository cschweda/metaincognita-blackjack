import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RuleSet } from '../utils/engine/rules'
import type { PersonaId } from '../utils/engine/bots'
import type { GameSnapshot } from '../utils/engine/serializeTypes'
import type { Action } from '../utils/engine/hand'

export const STORAGE_KEY = 'blackjack-session-v1'
const STORAGE_VERSION = 1
const HISTORY_CAP = 500

export const TRAINING_KEY = 'blackjack-training-v1'
const TRAINING_VERSION = 1
const COUNT_CHECK_CAP = 200

export type PlayMode = 'casino' | 'quick'
export type PlaySpeed = 'relaxed' | 'normal' | 'brisk'
export type AdvisorIntensity = 'coach' | 'feedback' | 'exam'
export type CountVisibility = 'shown' | 'self-check' | 'off'
export type DecisionCategory = 'hard' | 'soft' | 'pair' | 'surrender' | 'insurance'

export interface SessionSettings {
  rules: RuleSet
  mode: PlayMode
  speed: PlaySpeed
  flair: boolean
  botIds: PersonaId[]
  advisor: AdvisorIntensity
  count: CountVisibility
  advancedDeviations: boolean
}

export interface DecisionRecord {
  handIndex: number
  cards: string[] // display strings at decision time
  total: number
  soft: boolean
  pair: boolean
  pairBucket: number | null
  upBucket: number // 2-11
  dealerUp: string // display string
  action: Action
  book: Action // pure basic strategy
  deviationId: string | null
  deviationPlay: Action | null
  correct: boolean // action === deviation-aware advised play
  costCents: number // (EV[book] − EV[action]) × bet, 0 when not priceable
  evs: Partial<Record<Action, number>>
  rc: number
  tc: number // stored to 1 decimal
  category: Exclude<DecisionCategory, 'insurance'>
}

export interface InsuranceRecord {
  took: number | 'even-money' | null
  book: 'take' | 'decline'
  correct: boolean
  rc: number
  tc: number
}

export interface TrainingStats {
  adherence: Record<DecisionCategory, { decisions: number, correct: number }>
  /** key: "<hard|soft|pair>|<totalKey>|<upBucket>" → times missed (drills replay these) */
  mistakeBag: Record<string, number>
  countChecks: Array<{ at: number, entered: number, actual: number }>
  drillBests: Record<string, number>
}

export interface RoundRecord {
  round: number
  at: number // epoch ms
  dealer: { cards: string[], total: number, blackjack: boolean, busted: boolean }
  spots: Array<{
    occupant: 'hero' | PersonaId
    hands: Array<{ cards: string[], bet: number, outcome: string, net: number, doubled: boolean, fromSplit: boolean, total?: number, soft?: boolean }>
    sideBets: Array<{ name: string, stake: number, net: number, label: string }>
    insuranceNet: number
  }>
  /** Face-up cards in dealt order — Plan 3 derives running counts from this. */
  visibleCards: string[]
  /** Hero decisions this round, graded vs the advisor (Plan 3). */
  heroDecisions?: DecisionRecord[]
  heroInsurance?: InsuranceRecord | null
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

function freshTraining(): TrainingStats {
  return {
    adherence: {
      hard: { decisions: 0, correct: 0 },
      soft: { decisions: 0, correct: 0 },
      pair: { decisions: 0, correct: 0 },
      surrender: { decisions: 0, correct: 0 },
      insurance: { decisions: 0, correct: 0 }
    },
    mistakeBag: {},
    countChecks: [],
    drillBests: {}
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
  const countState = ref<{ running: number, cardsSeen: number } | null>(null)
  const training = ref<TrainingStats>(loadTraining())

  const busted = computed(() =>
    sessionActive.value && settings.value !== null && bankroll.value < settings.value.rules.minBet)

  function loadTraining(): TrainingStats {
    try {
      const raw = localStorage.getItem(TRAINING_KEY)
      if (!raw) return freshTraining()
      const data = JSON.parse(raw) as { version?: number } & Partial<TrainingStats>
      if (data.version !== TRAINING_VERSION) return freshTraining()
      const base = freshTraining()
      return {
        adherence: { ...base.adherence, ...(data.adherence ?? {}) },
        mistakeBag: typeof data.mistakeBag === 'object' && data.mistakeBag !== null && !Array.isArray(data.mistakeBag)
          ? data.mistakeBag as Record<string, number>
          : {},
        countChecks: Array.isArray(data.countChecks) ? data.countChecks.slice(-COUNT_CHECK_CAP) : [],
        drillBests: typeof data.drillBests === 'object' && data.drillBests !== null && !Array.isArray(data.drillBests)
          ? data.drillBests as Record<string, number>
          : {}
      }
    } catch {
      return freshTraining()
    }
  }

  function persistTraining(): void {
    try {
      localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: TRAINING_VERSION, ...training.value }))
    } catch {
      storageAvailable.value = false
    }
  }

  /** Machine-readable replay key — drills parse it back. */
  function mistakeKey(d: DecisionRecord): string {
    const kind = d.pair ? 'pair' : d.soft ? 'soft' : 'hard'
    const totalKey = d.pair ? (d.pairBucket ?? d.total) : d.total
    return `${kind}|${totalKey}|${d.upBucket}`
  }

  function recordDecision(d: DecisionRecord): void {
    const bucket = training.value.adherence[d.category]
    bucket.decisions++
    if (d.correct) bucket.correct++
    else training.value.mistakeBag[mistakeKey(d)] = (training.value.mistakeBag[mistakeKey(d)] ?? 0) + 1
    persistTraining()
  }

  function recordInsuranceDecision(r: InsuranceRecord): void {
    const bucket = training.value.adherence.insurance
    bucket.decisions++
    if (r.correct) bucket.correct++
    persistTraining()
  }

  function recordCountCheck(entered: number, actual: number): void {
    training.value.countChecks.push({ at: Date.now(), entered, actual })
    if (training.value.countChecks.length > COUNT_CHECK_CAP) {
      training.value.countChecks.splice(0, training.value.countChecks.length - COUNT_CHECK_CAP)
    }
    persistTraining()
  }

  function recordDrillBest(id: string, score: number): void {
    if (score > (training.value.drillBests[id] ?? 0)) {
      training.value.drillBests[id] = score
      persistTraining()
    }
  }

  function setCountState(s: { running: number, cardsSeen: number } | null): void {
    countState.value = s
  }

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
        countState: countState.value,
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
      const storedSettings = (data.settings ?? null) as Partial<SessionSettings> | null
      settings.value = storedSettings
        ? { advisor: 'feedback', count: 'self-check', advancedDeviations: false, ...storedSettings } as SessionSettings
        : null
      bankroll.value = data.bankroll
      session.value = { ...freshStats(), ...(data.session as Partial<SessionStats> | undefined) }
      history.value = (data.history as RoundRecord[]).slice(-HISTORY_CAP)
      botStates.value = (data.botStates ?? {}) as typeof botStates.value
      roundSnapshot.value = (data.roundSnapshot ?? null) as GameSnapshot | null
      countState.value = (data.countState ?? null) as typeof countState.value
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
    countState.value = null
    try {
      Storage.prototype.removeItem.call(localStorage, STORAGE_KEY)
    } catch { /* ignore */ }
    // deliberately do NOT clear training or TRAINING_KEY — lifetime stats survive leaving the table
  }

  return {
    settings, bankroll, session, history, botStates, roundSnapshot,
    sessionActive, storageAvailable, busted,
    training, countState,
    initSession, applyNet, recordRound, saveSnapshot, persist, restore, clearAll,
    setCountState, recordDecision, recordInsuranceDecision, recordCountCheck, recordDrillBest
  }
})
