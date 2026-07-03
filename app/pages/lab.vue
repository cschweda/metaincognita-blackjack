<script setup lang="ts">
import type { BetRamp, SimResult, TcFrequencies } from '~/utils/betRamp'
import { DEFAULT_RAMP, rampStats, simulateTrajectories, tcFrequencies } from '~/utils/betRamp'
import { houseEdge } from '~/utils/engine/basicStrategy'
import { PRESETS } from '~/utils/engine/rules'
import { randomSeed } from '~/utils/engine/rng'
import { formatCents } from '~/utils/format'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
  requestFreqs()
})

// ── ramp editor state (cents internally, dollars at the inputs) ───────────────

const presetOptions = Object.entries(PRESETS)
  .filter(([key]) => key !== 'CUSTOM')
  .map(([key, r]) => ({ label: r.name, value: key }))
const presetKey = ref('VEGAS_STRIP_6D')
const rules = computed(() => PRESETS[presetKey.value]!)

const saved = store.training.betRamp
const ramp = reactive<BetRamp>({
  ...DEFAULT_RAMP,
  ...(saved ?? {}),
  steps: [...(saved?.steps ?? DEFAULT_RAMP.steps)]
})
const STEP_LABELS = ['TC ≤ 0', 'TC +1', 'TC +2', 'TC +3', 'TC +4', 'TC ≥ +5']

const unitDollars = computed({
  get: () => ramp.unitCents / 100,
  set: (v) => {
    if (typeof v === 'number' && !Number.isNaN(v) && v > 0) ramp.unitCents = Math.round(v * 100)
  }
})
const bankrollDollars = computed({
  get: () => ramp.bankrollCents / 100,
  set: (v) => {
    if (typeof v === 'number' && !Number.isNaN(v) && v > 0) ramp.bankrollCents = Math.round(v * 100)
  }
})
const roundsPerHour = computed({
  get: () => ramp.roundsPerHour,
  set: (v) => {
    if (typeof v === 'number' && !Number.isNaN(v) && v >= 1) ramp.roundsPerHour = Math.round(v)
  }
})

function setStep(i: number, v: number | null): void {
  if (typeof v === 'number' && !Number.isNaN(v) && v >= 0) ramp.steps[i] = Math.round(v)
}

const hintsEnabled = ref(store.training.betHintsEnabled)
const savedFlash = ref(false)
function saveRamp(): void {
  store.setBetRamp(JSON.parse(JSON.stringify(ramp)) as BetRamp, hintsEnabled.value)
  savedFlash.value = true
  setTimeout(() => {
    savedFlash.value = false
  }, 2000)
}

// ── TC frequencies: measured by an engine pass, cached per preset ──────────────

const FREQ_ROUNDS = 2000
const FREQ_SEED = 20260612 // fixed → the measured table is reproducible
const freqCache = new Map<string, TcFrequencies>()
const freqs = ref<TcFrequencies | null>(null)
const measuring = ref(false)

let worker: Worker | null = null
let workerBroken = false
let pendingFreqKey: string | null = null
/** Monotonic run id — a result carrying a stale id belongs to abandoned rules; drop it. */
let simRunId = 0

function handleWorkerMessage(e: MessageEvent): void {
  const msg = e.data
  if (msg.type === 'freqs' && typeof msg.key === 'string') {
    // the reply names its own preset — a slow answer can never poison another key's cache
    freqCache.set(msg.key, msg.freqs)
    if (msg.key === presetKey.value) {
      freqs.value = msg.freqs
      measuring.value = false
    }
    if (pendingFreqKey === msg.key) pendingFreqKey = null
  } else if (msg.type === 'progress') {
    if (msg.id === simRunId) simProgress.value = msg.fraction
  } else if (msg.type === 'result') {
    if (msg.id !== simRunId) return // finished under rules we've since left
    simResult.value = msg.result
    simulating.value = false
  }
}

function handleWorkerError(): void {
  worker?.terminate()
  worker = null
  workerBroken = true // don't rebuild a worker whose module can't load
  // finish whatever was in flight on the main thread
  if (measuring.value) {
    pendingFreqKey = null
    requestFreqs()
  }
  if (simulating.value) {
    simResult.value = simulateTrajectories(simParams())
    simulating.value = false
  }
}

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined' || workerBroken) return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/ruin-sim.ts', import.meta.url), { type: 'module' })
      worker.onmessage = handleWorkerMessage
      worker.onerror = handleWorkerError
    } catch {
      worker = null
    }
  }
  return worker
}

function requestFreqs(): void {
  const key = presetKey.value
  const cached = freqCache.get(key)
  if (cached) {
    freqs.value = cached
    measuring.value = false
    return
  }
  if (measuring.value && pendingFreqKey === key) return // already on its way
  freqs.value = null
  measuring.value = true
  const w = ensureWorker()
  if (w) {
    pendingFreqKey = key
    w.postMessage({ type: 'freqs', key, rules: rules.value, rounds: FREQ_ROUNDS, seed: FREQ_SEED })
  } else {
    // no Worker (tests, exotic browsers): compute on the main thread
    const measured = tcFrequencies(rules.value, FREQ_ROUNDS, FREQ_SEED)
    freqCache.set(key, measured)
    freqs.value = measured
    measuring.value = false
  }
}

watch(presetKey, () => {
  if (simulating.value) cancelSim() // its rules no longer apply — stop burning the cores
  simResult.value = null // a simulation is only meaningful for the rules it ran under
  requestFreqs()
})

// ── instant math (closed form, recomputed on every edit; rendered by RampStatsPanel) ──

const stats = computed(() => {
  if (!freqs.value) return null
  return rampStats(ramp, freqs.value, houseEdge(rules.value), rules.value)
})

// ── real simulation (worker-driven, cancellable) ──────────────────────────────

const simRounds = ref(840) // ≈ 12 hours at 70 rounds/hour
const simTrajectories = ref(500)
const simulating = ref(false)
const simProgress = ref(0)
const simResult = ref<SimResult | null>(null)

function simParams() {
  return {
    rules: rules.value,
    ramp: JSON.parse(JSON.stringify(ramp)) as BetRamp,
    rounds: Math.max(40, Math.round(simRounds.value)),
    trajectories: Math.max(10, Math.round(simTrajectories.value)),
    seed: randomSeed(),
    sampleEvery: Math.max(1, Math.round(Math.max(40, simRounds.value) / 40))
  }
}

function simulate(): void {
  simResult.value = null
  simProgress.value = 0
  simulating.value = true
  const w = ensureWorker()
  if (w) {
    simRunId++
    w.postMessage({ type: 'simulate', id: simRunId, params: simParams() })
  } else {
    simResult.value = simulateTrajectories(simParams())
    simulating.value = false
  }
}

function cancelSim(): void {
  // simulateTrajectories is one synchronous pass — cancellation IS termination
  simRunId++ // anything the dying worker already posted is now stale
  worker?.terminate()
  worker = null
  simulating.value = false
  simProgress.value = 0
  if (measuring.value) {
    pendingFreqKey = null
    requestFreqs() // a freqs request may have died with the worker
  }
}

onBeforeUnmount(() => {
  worker?.terminate()
  worker = null
})
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Bet Lab
    </h1>
    <p class="text-xs text-neutral-400">
      Counting tells you <em>when</em> you have the edge; the ramp decides <em>how much</em> rides on it.
      Build a bet ramp, read its math instantly, then stress-test it by playing thousands of
      engine rounds. Every number here is computed, never transcribed.
    </p>

    <!-- ramp editor -->
    <section class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Ramp
      </h2>
      <div class="grid gap-3 sm:grid-cols-4">
        <UFormField label="Rules">
          <USelect
            v-model="presetKey"
            :items="presetOptions"
            data-testid="lab-preset"
          />
        </UFormField>
        <UFormField label="Unit ($)">
          <UInput
            v-model.number="unitDollars"
            type="number"
            min="1"
            data-testid="lab-unit"
          />
        </UFormField>
        <UFormField label="Bankroll ($)">
          <UInput
            v-model.number="bankrollDollars"
            type="number"
            min="1"
            data-testid="lab-bankroll"
          />
        </UFormField>
        <UFormField label="Rounds / hour">
          <UInput
            v-model.number="roundsPerHour"
            type="number"
            min="1"
            data-testid="lab-rph"
          />
        </UFormField>
      </div>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <UFormField
          v-for="(label, i) in STEP_LABELS"
          :key="label"
          :label="label"
        >
          <UInput
            :model-value="ramp.steps[i]"
            type="number"
            min="0"
            :disabled="ramp.wongOut && i === 0"
            :data-testid="`lab-step-${i}`"
            @update:model-value="setStep(i, Number($event))"
          />
        </UFormField>
      </div>
      <p class="text-[10px] text-neutral-400">
        Units bet at each true count. 1-2-4-6-8-12 is a classic shape: steep enough to matter,
        flat enough to survive scrutiny.
      </p>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <USwitch
          v-model="ramp.wongOut"
          label="Wong out — sit out rounds at TC ≤ 0 (back-count)"
          data-testid="lab-wongout"
        />
        <div class="flex items-center gap-3">
          <USwitch
            v-model="hintsEnabled"
            label="Coach my bets at the table"
            data-testid="lab-hints"
          />
          <UButton
            color="primary"
            size="sm"
            data-testid="lab-save"
            @click="saveRamp"
          >
            {{ savedFlash ? 'Saved ✓' : 'Save ramp' }}
          </UButton>
        </div>
      </div>
      <p class="text-[10px] text-neutral-400">
        Saving stores the ramp with your lifetime training data. With coaching on (and counting
        active at the table), the advisor adds one bet-size line between rounds — never in exam mode.
      </p>
    </section>

    <!-- instant math -->
    <RampStatsPanel
      :stats="stats"
      :measuring="measuring"
      :freq-rounds="FREQ_ROUNDS"
      :rounds-per-hour="ramp.roundsPerHour"
    />

    <!-- real simulation -->
    <section class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Simulation — the reality check
      </h2>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Rounds per lifetime">
          <UInput
            v-model.number="simRounds"
            type="number"
            min="40"
            data-testid="lab-sim-rounds"
          />
        </UFormField>
        <UFormField label="Lifetimes">
          <UInput
            v-model.number="simTrajectories"
            type="number"
            min="10"
            data-testid="lab-sim-traj"
          />
        </UFormField>
        <UButton
          v-if="!simulating"
          color="primary"
          :disabled="measuring"
          data-testid="lab-simulate"
          @click="simulate"
        >
          Simulate
        </UButton>
        <UButton
          v-else
          color="error"
          variant="outline"
          data-testid="lab-cancel"
          @click="cancelSim"
        >
          Cancel ({{ Math.round(simProgress * 100) }}%)
        </UButton>
      </div>
      <UProgress
        v-if="simulating"
        :model-value="simProgress * 100"
        size="sm"
      />

      <div
        v-if="simResult"
        class="space-y-3"
        data-testid="lab-sim-result"
      >
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-neutral-400">
              Went broke within {{ simRounds.toLocaleString() }} rounds
            </p>
            <p
              class="font-mono text-lg font-bold"
              :class="simResult.ruinRate > 0.1 ? 'text-red-400' : 'text-[var(--accent-gold)]'"
            >
              {{ (simResult.ruinRate * 100).toFixed(1) }}%
            </p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-neutral-400">
              Closed form (no time limit)
            </p>
            <p class="font-mono text-lg font-bold text-neutral-300">
              {{ stats ? (stats.ruin * 100).toFixed(1) : '—' }}%
            </p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-neutral-400">
              Mean final bankroll
            </p>
            <p class="font-mono text-lg font-bold text-[var(--accent-cream)]">
              {{ formatCents(simResult.meanFinalCents, 0) }}
            </p>
          </div>
        </div>

        <FanChart
          :bands="simResult.bands"
          :start-cents="ramp.bankrollCents"
        />
        <p class="text-[10px] text-neutral-400">
          {{ simTrajectories }} lifetimes × {{ simRounds }} rounds through the real engine — seeded
          shoes, basic strategy, live Hi-Lo count, your ramp. Gold line: median bankroll. Bands:
          25–75th and 5–95th percentiles. Dashed: starting bankroll. Red: broke. If the closed
          form looks scarier than the simulation, that is the lesson: ruin needs time — raise the
          rounds and watch the gap close.
        </p>
      </div>
    </section>
  </main>
</template>
