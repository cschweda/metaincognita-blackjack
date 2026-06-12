import { computed, ref } from 'vue'
import { BlackjackGame } from '../utils/engine/round'
import type { Action } from '../utils/engine/hand'
import type { GameEvent, Phase, SpotBet, SpotState, SideBetKind } from '../utils/engine/round'
import type { Card } from '../utils/engine/cards'
import { displayCard } from '../utils/engine/cards'
import { handTotal, isBust, isBlackjack } from '../utils/engine/hand'
import { PERSONAS, decideFor } from '../utils/engine/bots'
import type { PersonaId } from '../utils/engine/bots'
import { mulberry32, randomSeed } from '../utils/engine/rng'
import { useBlackjackStore } from '../stores/useBlackjackStore'
import type { RoundRecord } from '../stores/useBlackjackStore'

export interface ShownCard {
  card: Card
  faceUp: boolean
}

export interface HandView {
  cards: Card[]
  bet: number
  doubled: boolean
  fromSplit: boolean
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | null
  net: number
}

export interface SpotView {
  spotId: number
  occupant: 'hero' | PersonaId
  hands: HandView[]
  activeHandIndex: number
  sideResults: Array<{ name: string, label: string, net: number }>
  quip: string | null
}

interface Announcement {
  id: number
  text: string
}

// ── module state (ssr: false — client singleton) ─────────────────────────────
let game: BlackjackGame | null = null
let unsubscribe: (() => void) | null = null
let roundCounter = 0
let pumping = false
let visibleThisRound: string[] = []
let quipRng = mulberry32(randomSeed())
const eventQueue: GameEvent[] = []

const phase = ref<Phase>('betting')
const dealerRow = ref<ShownCard[]>([])
const spotsView = ref<SpotView[]>([])
const announcements = ref<Announcement[]>([])
const liveText = ref('')
const queueIdle = ref(true)
const trayFill = ref(0)
/** Bumped whenever the module-level game is attached/detached — reactive bridge for computeds. */
const gameGen = ref(0)
let announceId = 0

const DELAY_BASE: Record<string, number> = {
  'card-dealt': 380,
  'announce': 550,
  'phase': 200,
  'hand-settled': 550,
  'side-bet-settled': 400,
  'insurance-settled': 400,
  'peek-result': 750,
  'hole-revealed': 500,
  'shuffle': 1400,
  'count-visible-card': 0
}
const SPEED_FACTOR = { relaxed: 1.3, normal: 1, brisk: 0.45 } as const

function delayFor(e: GameEvent): number {
  const store = useBlackjackStore()
  const s = store.settings
  if (!s || s.mode === 'quick') return 0
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  return Math.round((DELAY_BASE[e.type] ?? 0) * SPEED_FACTOR[s.speed])
}

export function __resetGameLoopForTests(): void {
  unsubscribe?.()
  game = null
  gameGen.value++
  unsubscribe = null
  roundCounter = 0
  pumping = false
  visibleThisRound = []
  eventQueue.length = 0
  phase.value = 'betting'
  dealerRow.value = []
  spotsView.value = []
  announcements.value = []
  liveText.value = ''
  queueIdle.value = true
  trayFill.value = 0
}

function updateTrayFill(): void {
  const store = useBlackjackStore()
  if (!game || !store.settings) return
  const shoe = game.shoe as { discardCount?: () => number }
  trayFill.value = shoe.discardCount ? shoe.discardCount() / (store.settings.rules.decks * 52) : 0
}

// ── presentation ──────────────────────────────────────────────────────────────
function spotViewFor(spotId: number): SpotView | undefined {
  return spotsView.value.find(s => s.spotId === spotId)
}

function syncAmountsFromEngine(): void {
  if (!game) return
  for (const spot of game.spots) {
    const view = spotViewFor(spot.spotId)
    if (!view) continue
    view.activeHandIndex = spot.activeHandIndex
    spot.hands.forEach((hand, i) => {
      const hv = view.hands[i]
      if (hv) {
        hv.bet = hand.bet
        hv.doubled = hand.doubled
        hv.fromSplit = hand.fromSplit
      }
    })
  }
}

/** A split restructures a spot's hands with NO event of its own (the engine splices, then
 *  deals). When the view's hand count diverges from the engine's, mirror the engine's hand
 *  structure but only show cards the presentation has already revealed — queued card-dealt
 *  events fill in the rest at their own pace. Engine outcomes here are either null or
 *  already presented (settlement events precede this one in the queue), so no leak. */
function reconcileSpotStructure(view: SpotView, engineSpot: SpotState, incoming: Card): void {
  if (view.hands.length === engineSpot.hands.length) return
  const seen = new Set(view.hands.flatMap(h => h.cards))
  seen.add(incoming)
  view.hands = engineSpot.hands.map(h => ({
    cards: h.cards.filter(c => seen.has(c)),
    bet: h.bet,
    doubled: h.doubled,
    fromSplit: h.fromSplit,
    outcome: h.outcome,
    net: h.netResult
  }))
}

function applyEvent(e: GameEvent): void {
  if (!game) return
  switch (e.type) {
    case 'phase':
      phase.value = e.phase
      break
    case 'shuffle':
      pushAnnouncement('Shuffling the shoe')
      updateTrayFill()
      break
    case 'card-dealt': {
      if (e.to === 'dealer-up' || e.to === 'dealer-hole' || e.to === 'dealer-draw') {
        dealerRow.value.push({ card: e.card, faceUp: e.faceUp })
      } else {
        const view = spotViewFor(e.to.spotId)
        const engineSpot = game.spots.find(s => s.spotId === (e.to as { spotId: number }).spotId)
        if (view) {
          if (engineSpot) reconcileSpotStructure(view, engineSpot, e.card)
          while (view.hands.length <= e.to.handIndex) {
            view.hands.push({ cards: [], bet: 0, doubled: false, fromSplit: true, outcome: null, net: 0 })
          }
          const hv = view.hands[e.to.handIndex]!
          if (!hv.cards.includes(e.card)) hv.cards.push(e.card)
        }
      }
      syncAmountsFromEngine()
      updateTrayFill()
      break
    }
    case 'hole-revealed': {
      const hole = dealerRow.value[1]
      if (hole) hole.faceUp = true
      break
    }
    case 'announce':
      pushAnnouncement(e.text)
      break
    case 'peek-result':
      pushAnnouncement(e.blackjack ? 'Dealer has blackjack' : 'Dealer checks… no blackjack')
      break
    case 'hand-settled': {
      const view = spotViewFor(e.spotId)
      const hv = view?.hands[e.handIndex]
      if (view && hv) {
        hv.outcome = e.outcome
        hv.net = e.net
        const flair = useBlackjackStore().settings?.flair === true
        if (flair && view.occupant !== 'hero') view.quip = pickQuip(view.occupant, e.outcome)
      }
      bookkeepHand(e)
      break
    }
    case 'side-bet-settled': {
      const view = spotViewFor(e.spotId)
      view?.sideResults.push({ name: e.result.name, label: e.result.label, net: e.net })
      bookkeepSide(e)
      break
    }
    case 'insurance-settled':
      bookkeepInsurance(e)
      break
    case 'count-visible-card':
      visibleThisRound.push(displayCard(e.card))
      break
  }
}

function pushAnnouncement(text: string): void {
  announcements.value.push({ id: ++announceId, text })
  if (announcements.value.length > 4) announcements.value.shift()
  liveText.value = text
}

function pickQuip(id: PersonaId, outcome: string): string {
  const persona = PERSONAS.find(p => p.id === id)!
  const category = outcome === 'blackjack' ? 'blackjack' : outcome === 'win' ? 'win' : 'lose'
  const lines = persona.quips[category]
  return lines[Math.floor(quipRng() * lines.length)]!
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  queueIdle.value = false
  while (eventQueue.length > 0) {
    const e = eventQueue.shift()!
    applyEvent(e)
    const ms = delayFor(e)
    if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms))
  }
  pumping = false
  queueIdle.value = true
  afterQueueDrained()
}

// ── hero/bot orchestration ───────────────────────────────────────────────────
function heroSpot(): number {
  const store = useBlackjackStore()
  const spots = store.settings?.rules.spots ?? 7
  return Math.floor(spots / 2)
}

function botSpotAssignments(): Array<{ spotId: number, id: PersonaId }> {
  const store = useBlackjackStore()
  if (!store.settings) return []
  const hero = heroSpot()
  const slots: number[] = []
  for (let offset = 1; slots.length < store.settings.botIds.length && offset < store.settings.rules.spots; offset++) {
    if (hero - offset >= 0) slots.push(hero - offset)
    if (slots.length < store.settings.botIds.length && hero + offset < store.settings.rules.spots) {
      slots.push(hero + offset)
    }
  }
  return store.settings.botIds
    .map((id, i) => ({ spotId: slots[i], id }))
    .filter((b): b is { spotId: number, id: PersonaId } => b.spotId !== undefined)
}

function afterQueueDrained(): void {
  if (!game) return
  const store = useBlackjackStore()
  if (game.phase === 'insurance') {
    // bots decide instantly; hero is prompted by the UI
    for (const { spotId, id } of botSpotAssignments()) {
      const persona = PERSONAS.find(p => p.id === id)!
      const spot = game.spots.find(s => s.spotId === spotId)
      if (!spot) continue
      if (persona.takesInsurance) {
        const hand = spot.hands[0]!
        const evenMoneyOk = store.settings!.rules.evenMoneyOffered && isBlackjack(hand.cards, false)
        game.insuranceDecision(spotId, evenMoneyOk ? 'even-money' : Math.floor(hand.bet / 2))
      } else {
        game.insuranceDecision(spotId, null)
      }
    }
    snapshotToStore() // waiting on hero — persist the table first
    return
  }
  if (game.phase === 'playerTurns') {
    const bots = botSpotAssignments()
    // act for the first pending spot in deal order; stop and wait if it's the hero
    for (const spot of game.spots) {
      const pending = spot.hands.some(h => !h.resolved && h.outcome === null)
      if (!pending) continue
      const bot = bots.find(b => b.spotId === spot.spotId)
      if (!bot) {
        snapshotToStore() // hero's turn — persist the table before waiting for input
        return
      }
      const hand = spot.hands[spot.activeHandIndex]!
      const action = decideFor(bot.id, hand, spot.hands.length, game.dealerUp!, store.settings!.rules)
      game.act(spot.spotId, action)
      void pump()
      return
    }
  }
  if (game.phase === 'complete') {
    finalizeRound()
  }
}

// ── bookkeeping ──────────────────────────────────────────────────────────────
function bookkeepHand(e: Extract<GameEvent, { type: 'hand-settled' }>): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('hands', e.net)
}

function bookkeepSide(e: Extract<GameEvent, { type: 'side-bet-settled' }>): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('side', e.net)
}

function bookkeepInsurance(e: Extract<GameEvent, { type: 'insurance-settled' }>): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('insurance', e.net)
}

function finalizeRound(): void {
  if (!game) return
  const store = useBlackjackStore()
  const bots = botSpotAssignments()
  const record: RoundRecord = {
    round: ++roundCounter,
    at: Date.now(),
    dealer: {
      cards: game.dealerCards.map(displayCard),
      total: handTotal(game.dealerCards).total,
      blackjack: isBlackjack(game.dealerCards, false),
      busted: isBust(game.dealerCards)
    },
    spots: game.spots.map((spot: SpotState) => ({
      occupant: spot.spotId === heroSpot() ? 'hero' as const : bots.find(b => b.spotId === spot.spotId)!.id,
      hands: spot.hands.map(h => ({
        cards: h.cards.map(displayCard),
        bet: h.bet,
        outcome: h.outcome ?? 'push',
        net: h.netResult,
        doubled: h.doubled,
        fromSplit: h.fromSplit
      })),
      sideBets: spot.sideBetResults.map(r => ({ name: r.name, stake: r.stake, net: r.net, label: r.label })),
      insuranceNet: spot.insuranceNet
    })),
    visibleCards: visibleThisRound
  }
  store.recordRound(record)
  // bot bet progression
  for (const { spotId, id } of bots) {
    const spot = game.spots.find(s => s.spotId === spotId)
    const state = store.botStates[id]
    if (!spot || !state) continue
    const first = spot.hands[0]!
    const last = first.outcome === 'blackjack' ? 'win' : first.outcome === 'surrender' ? 'lose' : first.outcome ?? 'push'
    const persona = PERSONAS.find(p => p.id === id)!
    state.last = last as 'win' | 'lose' | 'push'
    state.bet = persona.nextBet(state.bet, state.last, store.settings!.rules, quipRng)
  }
  store.saveSnapshot(null)
}

function snapshotToStore(): void {
  if (!game) return
  const store = useBlackjackStore()
  try {
    store.saveSnapshot(game.snapshot())
  } catch { /* snapshot unsupported (test shoe) — skip */ }
}

// ── public api ───────────────────────────────────────────────────────────────
function attach(g: BlackjackGame): void {
  unsubscribe?.()
  game = g
  gameGen.value++
  unsubscribe = g.on((e) => {
    eventQueue.push(e)
  })
}

export function useGameLoop() {
  const store = useBlackjackStore()

  const heroSpotId = computed(() => heroSpot())
  const hasGame = computed(() => {
    void gameGen.value
    return game !== null
  })
  const legalActions = computed<Action[]>(() => {
    void gameGen.value
    if (!game || !queueIdle.value || game.phase !== 'playerTurns') return []
    const spot = game.spots.find(s => s.spotId === heroSpot())
    if (!spot) return []
    const pendingBefore = game.spots.some(s =>
      s.spotId !== spot.spotId
      && game!.spots.indexOf(s) < game!.spots.indexOf(spot)
      && s.hands.some(h => !h.resolved && h.outcome === null))
    if (pendingBefore) return []
    if (!spot.hands.some(h => !h.resolved && h.outcome === null)) return []
    return game.legalFor(spot.spotId)
  })
  const canAct = computed(() => legalActions.value.length > 0)
  const inPlay = computed(() => {
    // amounts come from engine state; the presented phase/queue refs make this reactive
    void queueIdle.value
    void gameGen.value
    if (!game || phase.value === 'complete' || phase.value === 'betting') return 0
    const spot = game.spots.find(s => s.spotId === heroSpot())
    if (!spot) return 0
    const stakes = Object.values(spot.sideBets).reduce((s, v) => s + (v ?? 0), 0)
    return spot.hands.reduce((s, h) => s + (h.outcome === null ? h.bet : 0), 0)
      + stakes + (spot.insuranceBet ?? 0)
  })

  function startSession(settings: Parameters<typeof store.initSession>[0], bankroll: number, seed?: number): void {
    store.initSession(settings, bankroll)
    attach(new BlackjackGame(settings.rules, { seed: seed ?? randomSeed() }))
    quipRng = mulberry32(seed ?? randomSeed())
    resetPresentation()
  }

  function restoreSession(): boolean {
    if (!store.sessionActive && !store.restore()) return false
    if (!store.settings) return false
    if (store.roundSnapshot) {
      attach(BlackjackGame.restore(store.roundSnapshot))
      fastForwardPresentation()
    } else {
      attach(new BlackjackGame(store.settings.rules, { seed: randomSeed() }))
      resetPresentation()
    }
    return true
  }

  function resetPresentation(): void {
    eventQueue.length = 0
    dealerRow.value = []
    spotsView.value = []
    announcements.value = []
    phase.value = game?.phase ?? 'betting'
    queueIdle.value = true
  }

  /** After restore: render the full engine state instantly — no replay (Architecture Notes). */
  function fastForwardPresentation(): void {
    if (!game) return
    eventQueue.length = 0
    const bots = botSpotAssignments()
    phase.value = game.phase
    dealerRow.value = game.dealerCards.map((card, i) => ({
      card,
      faceUp: i !== 1 || game!.holeRevealed
    }))
    spotsView.value = game.spots.map(spot => ({
      spotId: spot.spotId,
      occupant: spot.spotId === heroSpot() ? 'hero' as const : (bots.find(b => b.spotId === spot.spotId)?.id ?? 'hero'),
      hands: spot.hands.map(h => ({
        cards: [...h.cards],
        bet: h.bet,
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        outcome: h.outcome,
        net: h.netResult
      })),
      activeHandIndex: spot.activeHandIndex,
      sideResults: spot.sideBetResults.map(r => ({ name: r.name, label: r.label, net: r.net })),
      quip: null
    }))
    queueIdle.value = true
    updateTrayFill()
    pushAnnouncement('Table restored — your move')
  }

  function beginRound(heroBet: number, heroSideStakes: Partial<Record<SideBetKind, number>>): void {
    if (!game || !store.settings) throw new Error('no active game')
    visibleThisRound = []
    const bots = botSpotAssignments()
    const bets: SpotBet[] = []
    for (const { spotId, id } of bots) {
      bets.push({ spotId, mainBet: store.botStates[id]?.bet ?? store.settings.rules.minBet })
    }
    bets.push({ spotId: heroSpot(), mainBet: heroBet, sideBets: heroSideStakes })
    bets.sort((a, b) => a.spotId - b.spotId)
    // fresh presentation for the round
    dealerRow.value = []
    spotsView.value = bets.map(b => ({
      spotId: b.spotId,
      occupant: b.spotId === heroSpot() ? 'hero' as const : bots.find(x => x.spotId === b.spotId)!.id,
      hands: [{ cards: [], bet: b.mainBet, doubled: false, fromSplit: false, outcome: null, net: 0 }],
      activeHandIndex: 0,
      sideResults: [],
      quip: null
    }))
    pushAnnouncement('Bets down — cards out')
    game.beginRound(bets)
    void pump()
  }

  function act(action: Action): void {
    if (!game) throw new Error('no active game')
    if (!canAct.value) throw new Error('cannot act while the table is presenting')
    game.act(heroSpot(), action)
    void pump()
  }

  function heroInsurance(decision: number | 'even-money' | null): void {
    if (!game) throw new Error('no active game')
    game.insuranceDecision(heroSpot(), decision)
    game.finishInsurance()
    void pump()
  }

  function endSession(): void {
    unsubscribe?.()
    game = null
    gameGen.value++
    store.clearAll()
    resetPresentation()
  }

  return {
    phase, dealerRow, spotsView, announcements, liveText, queueIdle, trayFill,
    canAct, legalActions, heroSpotId, inPlay, hasGame,
    startSession, restoreSession, beginRound, act, heroInsurance, endSession
  }
}
