import { computed, ref } from 'vue'
import { BlackjackGame } from '../utils/engine/round'
import type { Action } from '../utils/engine/hand'
import type { GameEvent, Phase, SpotBet, SpotState, SideBetKind } from '../utils/engine/round'
import type { Card } from '../utils/engine/cards'
import { displayCard, bucketOf } from '../utils/engine/cards'
import { handTotal, isBust, isBlackjack, isPair } from '../utils/engine/hand'
import { PERSONAS, decideFor } from '../utils/engine/bots'
import type { PersonaId } from '../utils/engine/bots'
import { mulberry32, randomSeed } from '../utils/engine/rng'
import { useBlackjackStore } from '../stores/useBlackjackStore'
import type { RoundRecord, DecisionRecord, InsuranceRecord } from '../stores/useBlackjackStore'
import {
  countShuffle, countVisibleCard, resetCounting, restoreCounting,
  __resetCountingForTests, useCounting
} from './useCounting'
import { adviseHand, adviseInsurance, decisionCost, summarizeRound } from '../utils/advisor'
import { freshMilestones, roundMilestones, shuffleMilestone } from '../utils/milestones'
import type { MilestoneState } from '../utils/milestones'

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
let decisionsThisRound: DecisionRecord[] = []
let insuranceThisRound: InsuranceRecord | null = null
let milestones: MilestoneState = freshMilestones(0)
const lastDecision = ref<DecisionRecord | null>(null)
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
  decisionsThisRound = []
  insuranceThisRound = null
  lastDecision.value = null
  eventQueue.length = 0
  phase.value = 'betting'
  dealerRow.value = []
  spotsView.value = []
  announcements.value = []
  liveText.value = ''
  queueIdle.value = true
  trayFill.value = 0
  milestones = freshMilestones(0)
  __resetCountingForTests()
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
      countShuffle()
      pushAnnouncement('Shuffling the shoe')
      updateTrayFill()
      if (useBlackjackStore().settings?.flair) {
        const result = shuffleMilestone(useBlackjackStore().bankroll, milestones)
        milestones = result.state
        if (result.line) pushAnnouncement(result.line)
      } else {
        milestones = { ...milestones, bankrollAtShuffle: useBlackjackStore().bankroll }
      }
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
      countVisibleCard(e.card)
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
        fromSplit: h.fromSplit,
        total: handTotal(h.cards).total,
        soft: handTotal(h.cards).soft
      })),
      sideBets: spot.sideBetResults.map(r => ({ name: r.name, stake: r.stake, net: r.net, label: r.label })),
      insuranceNet: spot.insuranceNet
    })),
    visibleCards: visibleThisRound,
    heroDecisions: [...decisionsThisRound],
    heroInsurance: insuranceThisRound
  }
  store.recordRound(record)
  // the result reaches the aria-live region (and dealer line) before any flair lines
  const summary = summarizeRound(record)
  if (summary) pushAnnouncement(summary.headline)
  if (store.settings?.flair) {
    const heroNet = record.spots
      .filter(s => s.occupant === 'hero')
      .reduce((sum, s) => sum + s.hands.reduce((x, h) => x + h.net, 0)
        + s.sideBets.reduce((x, b) => x + b.net, 0) + s.insuranceNet, 0)
    const result = roundMilestones({
      heroNet,
      tookCorrectDeviation: decisionsThisRound.some(d => d.deviationId !== null && d.correct),
      state: milestones
    })
    milestones = result.state
    for (const line of result.lines) pushAnnouncement(line)
    // an occasional table myth from a companion (spec §8)
    const botViews = spotsView.value.filter(v => v.occupant !== 'hero')
    if (botViews.length > 0 && quipRng() < 0.18) {
      const view = botViews[Math.floor(quipRng() * botViews.length)]!
      const persona = PERSONAS.find(p => p.id === view.occupant)!
      view.quip = persona.quips.myth[Math.floor(quipRng() * persona.quips.myth.length)]!
    }
  }
  // bot bet progression
  for (const { spotId, id } of bots) {
    const spot = game.spots.find(s => s.spotId === spotId)
    const state = store.botStates[id]
    if (!spot || !state) continue
    const first = spot.hands[0]!
    const last = (first.outcome === 'blackjack' ? 'win' : first.outcome === 'surrender' ? 'lose' : first.outcome ?? 'push') as 'win' | 'lose' | 'push'
    const persona = PERSONAS.find(p => p.id === id)!
    store.advanceBotState(id, last, persona.nextBet(state.bet, last, store.settings!.rules, quipRng))
  }
  store.setRoundTrail(null)
  store.saveSnapshot(null)
}

function snapshotToStore(): void {
  if (!game) return
  const store = useBlackjackStore()
  try {
    store.setRoundTrail({
      visible: [...visibleThisRound],
      decisions: [...decisionsThisRound],
      insurance: insuranceThisRound
    })
    store.saveSnapshot(game.snapshot())
  } catch { /* snapshot unsupported (test shoe) — skip */ }
}

// ── public api ───────────────────────────────────────────────────────────────
function attach(g: BlackjackGame): void {
  unsubscribe?.()
  game = g
  g.exposeHoleAtCleanup = useBlackjackStore().training.exposeMuckedHole
  gameGen.value++
  unsubscribe = g.on((e) => {
    eventQueue.push(e)
  })
}

export function useGameLoop() {
  const store = useBlackjackStore()
  const counting = useCounting()

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
    const acts = game.legalFor(spot.spotId)
    const hand = spot.hands[spot.activeHandIndex]
    if (!hand || (!acts.includes('double') && !acts.includes('split'))) return acts
    // Mid-round outlays are not escrowed (money only moves at settlement), so a double or
    // split must fit in what the bankroll has left after every stake still riding
    const unresolvedBets = spot.hands.reduce((s, h) => s + (h.outcome === null ? h.bet : 0), 0)
    const stakedSide = Object.values(spot.sideBets).reduce((s, v) => s + (v ?? 0), 0)
    const settledSide = spot.sideBetResults.reduce((s, r) => s + r.stake, 0)
    const pendingInsurance = spot.insuranceBet && spot.insuranceNet === 0 ? spot.insuranceBet : 0
    const available = store.bankroll - unresolvedBets - (stakedSide - settledSide) - pendingInsurance
    return acts.filter(a => (a !== 'double' && a !== 'split') || hand.bet <= available)
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
  const heroTurn = computed(() => {
    void gameGen.value
    // the engine is non-reactive, so invalidation must come from presentation state.
    // canAct alone is NOT enough: across a split-hand advance its value stays true→true
    // and Vue's computed stability skips dependents — read queueIdle and the presented
    // activeHandIndex directly so every pump cycle genuinely recomputes this
    void queueIdle.value
    void spotViewFor(heroSpot())?.activeHandIndex
    if (!game || !canAct.value) return null
    const spot = game.spots.find(s => s.spotId === heroSpot())
    const hand = spot?.hands[spot.activeHandIndex]
    if (!spot || !hand || !game.dealerUp) return null
    return {
      cards: [...hand.cards],
      bet: hand.bet,
      fromSplit: hand.fromSplit,
      handIndex: spot.activeHandIndex,
      dealerUp: game.dealerUp
    }
  })

  function startSession(settings: Parameters<typeof store.initSession>[0], bankroll: number, seed?: number): void {
    store.initSession(settings, bankroll)
    attach(new BlackjackGame(settings.rules, { seed: seed ?? randomSeed() }))
    quipRng = mulberry32(seed ?? randomSeed())
    milestones = freshMilestones(bankroll)
    roundCounter = 0
    lastDecision.value = null
    resetPresentation()
    resetCounting()
  }

  function restoreSession(): boolean {
    if (!store.sessionActive && !store.restore()) return false
    if (!store.settings) return false
    milestones = freshMilestones(store.bankroll)
    // history numbering must continue, not restart at 1 with duplicate keys
    roundCounter = store.history[store.history.length - 1]?.round ?? 0
    lastDecision.value = null
    if (store.roundSnapshot) {
      try {
        attach(BlackjackGame.restore(store.roundSnapshot))
        fastForwardPresentation()
        restoreCounting()
        // rebuild the in-flight round's trail so the eventual record stays complete
        visibleThisRound = [...(store.roundTrail?.visible ?? [])]
        decisionsThisRound = [...(store.roundTrail?.decisions ?? [])]
        insuranceThisRound = store.roundTrail?.insurance ?? null
        return true
      } catch {
        // corrupt snapshot: clear it for good and fall through to a fresh shoe —
        // never leave /table re-throwing on every visit
        store.setRoundTrail(null)
        store.saveSnapshot(null)
      }
    }
    attach(new BlackjackGame(store.settings.rules, { seed: randomSeed() }))
    resetPresentation()
    resetCounting()
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
    decisionsThisRound = []
    insuranceThisRound = null
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

  function act(action: Action, expectedHandIndex?: number): void {
    if (!game) throw new Error('no active game')
    if (!canAct.value) throw new Error('cannot act while the table is presenting')
    const spot = game.spots.find(s => s.spotId === heroSpot())!
    // a double-click's second click arrives after the hand advanced — drop the stale action
    if (expectedHandIndex !== undefined && spot.activeHandIndex !== expectedHandIndex) return
    const hand = spot.hands[spot.activeHandIndex]!
    const tc = counting.tc.value
    const rec = adviseHand(
      { cards: hand.cards, fromSplit: hand.fromSplit },
      game.dealerUp!, store.settings!.rules, tc, store.settings!.advancedDeviations,
      legalActions.value
    )
    const pairFlag = isPair(hand.cards) && legalActions.value.includes('split')
    const { total, soft } = handTotal(hand.cards)
    const correct = action === rec.action
    const decision: DecisionRecord = {
      handIndex: spot.activeHandIndex,
      cards: hand.cards.map(displayCard),
      total,
      soft,
      pair: pairFlag,
      pairBucket: pairFlag ? bucketOf(hand.cards[0]!) : null,
      upBucket: bucketOf(game.dealerUp!),
      dealerUp: displayCard(game.dealerUp!),
      action,
      book: rec.book,
      deviationId: rec.deviation?.id ?? null,
      deviationPlay: rec.deviation ? (rec.deviation.play as DecisionRecord['deviationPlay']) : null,
      correct,
      // correct deviation plays diverge from book by design — they cost $0 (advisor contract).
      // Grading is vs rec.action (deviation-aware); pricing is vs rec.book (full-shoe EV is
      // the only thing decisionCost can price — count-adjusted EVs are not computable here)
      costCents: correct ? 0 : decisionCost(rec.evs, action, rec.book, hand.bet),
      evs: rec.evs,
      rc: counting.rc.value,
      tc: Math.round(tc * 10) / 10,
      category: rec.book === 'surrender' ? 'surrender' : pairFlag ? 'pair' : soft ? 'soft' : 'hard'
    }
    store.recordDecision(decision)
    decisionsThisRound.push(decision)
    lastDecision.value = decision
    if (store.settings!.advisor !== 'exam' && !decision.correct) {
      pushAnnouncement(`Book: ${rec.action}${decision.costCents > 0 ? ` — that cost ≈$${(decision.costCents / 100).toFixed(2)}` : ''}`)
    }
    game.act(heroSpot(), action)
    void pump()
  }

  function heroInsurance(decision: number | 'even-money' | null): void {
    // guard against clicks during the post-decision presentation and repeated decisions —
    // stats are persisted, so nothing may be recorded before the engine accepts the play
    if (!game || game.phase !== 'insurance' || !queueIdle.value) return
    const adv = adviseInsurance(counting.tc.value, store.settings!.advancedDeviations)
    const record: InsuranceRecord = {
      took: decision,
      book: adv.take ? 'take' : 'decline',
      correct: adv.take ? decision !== null : decision === null,
      rc: counting.rc.value,
      tc: Math.round(counting.tc.value * 10) / 10
    }
    try {
      game.insuranceDecision(heroSpot(), decision)
      game.finishInsurance()
    } catch {
      return // engine rejected the decision — insurance stays open, nothing recorded
    }
    insuranceThisRound = record
    store.recordInsuranceDecision(record)
    void pump()
  }

  function endSession(): void {
    unsubscribe?.()
    game = null
    gameGen.value++
    lastDecision.value = null
    store.clearAll()
    resetPresentation()
    resetCounting()
  }

  function setExposeMuckedHole(enabled: boolean): void {
    store.setExposeMuckedHole(enabled)
    if (game) game.exposeHoleAtCleanup = enabled
  }

  return {
    phase, dealerRow, spotsView, announcements, liveText, queueIdle, trayFill,
    canAct, legalActions, heroSpotId, inPlay, hasGame, heroTurn, lastDecision,
    startSession, restoreSession, beginRound, act, heroInsurance, endSession, setExposeMuckedHole
  }
}
