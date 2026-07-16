import { describe, expect, it } from 'vitest'
import { statefulMulberry32 } from '../../../app/utils/engine/rng'
import { BlackjackGame } from '../../../app/utils/engine/round'
import type { GameSnapshot } from '../../../app/utils/engine/serializeTypes'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'

describe('statefulMulberry32', () => {
  it('matches mulberry32 output for the same seed', async () => {
    const { mulberry32 } = await import('../../../app/utils/engine/rng')
    const plain = mulberry32(42)
    const stateful = statefulMulberry32(42)
    for (let i = 0; i < 100; i++) expect(stateful.next()).toBe(plain())
  })

  it('resumes exactly from a captured state', () => {
    const a = statefulMulberry32(7)
    for (let i = 0; i < 10; i++) a.next()
    const resumed = statefulMulberry32(a.state())
    const tailA = Array.from({ length: 20 }, () => a.next())
    const tailB = Array.from({ length: 20 }, () => resumed.next())
    expect(tailB).toEqual(tailA)
  })
})

const RULES = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!)
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
})()

describe('BlackjackGame snapshot/restore', () => {
  it('restores a mid-round game that continues identically to the uninterrupted original', () => {
    const a = new BlackjackGame(RULES, { seed: 31415 })
    a.beginRound([{ spotId: 0, mainBet: 1000 }])
    if (a.phase === 'insurance') {
      a.insuranceDecision(0, null)
      a.finishInsurance()
    }
    const snap: GameSnapshot = a.snapshot()
    const b = BlackjackGame.restore(snap)

    expect(b.phase).toBe(a.phase)
    expect(b.dealerUp).toEqual(a.dealerUp)
    expect(b.spots).toEqual(a.spots)
    expect(b.holeRevealed).toBe(a.holeRevealed)

    // play both to completion with the same actions; outcomes and shoe draws must match
    const play = (g: BlackjackGame) => {
      while (g.phase === 'playerTurns') {
        const legal = g.legalFor(0)
        g.act(0, legal.includes('stand') ? 'stand' : legal[0]!)
      }
      return g.spots.map(s => s.hands.map(h => ({ net: h.netResult, outcome: h.outcome })))
    }
    expect(play(b)).toEqual(play(a))
    expect(b.shoe.cardsRemaining()).toBe(a.shoe.cardsRemaining())

    // and the NEXT full round (which may shuffle) must also match — proves RNG state survived
    const next = (g: BlackjackGame) => {
      g.beginRound([{ spotId: 0, mainBet: 1000 }])
      if (g.phase === 'insurance') {
        g.insuranceDecision(0, null)
        g.finishInsurance()
      }
      while (g.phase === 'playerTurns') g.act(0, g.legalFor(0).includes('stand') ? 'stand' : g.legalFor(0)[0]!)
      return g.spots.map(s => s.hands.map(h => h.netResult))
    }
    expect(next(b)).toEqual(next(a))
  })

  it('snapshot is JSON-safe (structured-clone/parse round trip)', () => {
    const g = new BlackjackGame(RULES, { seed: 99 })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    if (g.phase === 'insurance') {
      g.insuranceDecision(0, null)
      g.finishInsurance()
    }
    const snap = JSON.parse(JSON.stringify(g.snapshot())) as GameSnapshot
    const r = BlackjackGame.restore(snap)
    expect(r.phase).toBe(g.phase)
    expect(r.spots).toEqual(g.spots)
  })

  it('rejects snapshots with a wrong version', () => {
    const g = new BlackjackGame(RULES, { seed: 1 })
    const snap = g.snapshot()
    expect(() => BlackjackGame.restore({ ...snap, v: 999 } as unknown as GameSnapshot)).toThrow(/version/)
  })

  it('preserves the RNG stream across restore — post-restore SHUFFLES match the original timeline', () => {
    const rules = cloneRules(PRESETS.SINGLE_DECK_65!) // 1 deck, pen 0.6 → reshuffles arrive within a few rounds
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const a = new BlackjackGame(rules, { seed: 2718 })
    const playRound = (g: BlackjackGame) => {
      g.beginRound([{ spotId: 0, mainBet: 1000 }])
      if (g.phase === 'insurance') {
        g.insuranceDecision(0, null)
        g.finishInsurance()
      }
      while (g.phase === 'playerTurns') {
        g.act(0, g.legalFor(0).includes('stand') ? 'stand' : g.legalFor(0)[0]!)
      }
      return g.spots.flatMap(s => s.hands.map(h => h.netResult))
    }
    playRound(a)
    const b = BlackjackGame.restore(a.snapshot())
    let crossedShuffle = false
    for (let i = 0; i < 30 && !crossedShuffle; i++) {
      crossedShuffle = a.shoe.needsShuffle() // true → the NEXT beginRound reshuffles in both games
      expect(playRound(b)).toEqual(playRound(a))
    }
    expect(crossedShuffle).toBe(true) // the comparison genuinely crossed a shuffle boundary
  })
})

describe('v1 snapshot compatibility', () => {
  it('backfills side-bet result ids on restore so once-only guards keep holding', () => {
    const rules = cloneRules(PRESETS.MA_205CMR!)
    rules.sideBets = { twentyOnePlusThree: 'MA-B', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const game = new BlackjackGame(rules, { seed: 99 })
    game.beginRound([{ spotId: 0, mainBet: 1000, sideBets: { twentyOnePlusThree: 500 } }])
    // 21+3 settles with the deal (MA §28(e)) — mid-flight with one result already recorded
    expect(game.spots[0]!.sideBetResults).toHaveLength(1)

    const snap = game.snapshot()
    for (const spot of snap.spots) {
      for (const r of spot.sideBetResults) delete (r as { id?: unknown }).id // v1 predates SideBetResult.id
    }
    const restored = BlackjackGame.restore(snap)
    expect(restored.spots[0]!.sideBetResults[0]!.id).toBe('twentyOnePlusThree')
  })
})
