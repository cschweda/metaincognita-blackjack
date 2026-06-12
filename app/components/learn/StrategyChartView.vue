<script setup lang="ts">
import type { Bucket } from '~/utils/engine/cards'
import type { RuleSet } from '~/utils/engine/rules'
import type { ChartCode } from '~/utils/engine/basicStrategy'
import { BUCKETS, bestAction, bestActionFull, generateChart } from '~/utils/engine/basicStrategy'
import { pctEV } from '~/utils/advisor'

const props = defineProps<{
  rules: RuleSet
}>()

const chart = computed(() => generateChart(props.rules))

const CODE_STYLE: Record<ChartCode, string> = {
  H: 'bg-sky-950 text-sky-300',
  S: 'bg-emerald-950 text-emerald-300',
  D: 'bg-amber-900 text-amber-200',
  Ds: 'bg-amber-950 text-amber-300',
  P: 'bg-purple-950 text-purple-300',
  Rh: 'bg-neutral-800 text-neutral-300',
  Rs: 'bg-neutral-800 text-neutral-300',
  Rp: 'bg-neutral-800 text-neutral-300'
}

const upLabel = (b: Bucket) => b === 11 ? 'A' : b === 10 ? 'T' : String(b)
const pairLabel = (b: Bucket) => b === 11 ? 'A,A' : b === 10 ? 'T,T' : `${b},${b}`

interface Selection {
  kind: 'hard' | 'soft' | 'pair'
  row: number
  up: Bucket
}
const selected = ref<Selection | null>(null)

const detail = computed(() => {
  const sel = selected.value
  if (!sel) return null
  const rec = sel.kind === 'pair'
    ? bestActionFull(
        { pair: sel.row as Bucket, total: sel.row === 11 ? 12 : sel.row * 2, soft: sel.row === 11 },
        sel.up, props.rules)
    : bestAction(
        { total: sel.row, soft: sel.kind === 'soft', twoCards: true, fromSplit: false },
        sel.up, props.rules)
  const label = sel.kind === 'pair' ? pairLabel(sel.row as Bucket) : `${sel.kind} ${sel.row}`
  return { label, up: upLabel(sel.up), action: rec.action, evs: Object.entries(rec.evs) as Array<[string, number]> }
})

const hardRows = computed(() => Object.keys(chart.value.hard).map(Number).sort((a, b) => a - b))
const softRows = computed(() => Object.keys(chart.value.soft).map(Number).sort((a, b) => a - b))

function codeAt(grid: unknown, row: number, up: Bucket): ChartCode {
  return (grid as Record<number, Record<Bucket, ChartCode>>)[row]![up]!
}
</script>

<template>
  <div class="space-y-4 text-xs">
    <div
      v-for="section in ([
        { kind: 'hard', title: 'Hard totals', rows: hardRows, grid: chart.hard, label: (r: number) => String(r) },
        { kind: 'soft', title: 'Soft totals', rows: softRows, grid: chart.soft, label: (r: number) => `A,${r - 11}` },
        { kind: 'pair', title: 'Pairs', rows: BUCKETS, grid: chart.pairs, label: (r: number) => pairLabel(r as Bucket) }
      ] as const)"
      :key="section.kind"
    >
      <h3 class="mb-1 font-semibold text-neutral-300">
        {{ section.title }}
      </h3>
      <div class="overflow-x-auto">
        <table class="border-collapse font-mono">
          <thead>
            <tr>
              <th class="p-1 text-neutral-500" />
              <th
                v-for="up in BUCKETS"
                :key="up"
                class="p-1 text-neutral-500"
              >
                {{ upLabel(up) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in section.rows"
              :key="row"
            >
              <th class="p-1 text-right text-neutral-500">
                {{ section.label(row) }}
              </th>
              <td
                v-for="up in BUCKETS"
                :key="up"
                class="p-0.5"
              >
                <button
                  type="button"
                  class="block h-6 w-7 rounded text-center font-bold"
                  :class="[CODE_STYLE[codeAt(section.grid, row, up)],
                           selected?.kind === section.kind && selected?.row === row && selected?.up === up ? 'ring-1 ring-[var(--accent-gold)]' : '']"
                  :data-testid="`cell-${section.kind}-${row}-${up}`"
                  @click="selected = { kind: section.kind, row, up }"
                >
                  {{ codeAt(section.grid, row, up) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="detail"
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
      data-testid="cell-detail"
    >
      <p class="font-semibold text-[var(--accent-cream)]">
        {{ detail.label }} vs {{ detail.up }} → <span class="text-[var(--accent-gold)]">{{ detail.action }}</span>
      </p>
      <table class="mt-1 font-mono">
        <tbody>
          <tr
            v-for="[action, ev] in detail.evs"
            :key="action"
            :class="action === detail.action ? 'text-[var(--accent-cream)]' : 'text-neutral-500'"
          >
            <td class="pr-3">
              {{ action }}
            </td>
            <td>{{ pctEV(ev) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-neutral-500">
      H hit · S stand · D double (else hit) · Ds double (else stand) · P split · Rh/Rs/Rp surrender (else hit/stand/split)
    </p>
  </div>
</template>
