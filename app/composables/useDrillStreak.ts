import { computed, ref } from 'vue'
import { useBlackjackStore } from '../stores/useBlackjackStore'

/** The shared drill scoring contract: the streak resets on a miss, the best is lifetime
 *  (persisted via the store). Every drill uses this; a seventh drill costs three lines.
 *  Drills with per-level bests (Count the Cards) pass an id getter. */
export function useDrillStreak(drillId: string | (() => string)) {
  const store = useBlackjackStore()
  const id = (): string => (typeof drillId === 'function' ? drillId() : drillId)
  const streak = ref(0)
  const best = computed(() => store.training.drillBests[id()] ?? 0)

  function grade(correct: boolean): void {
    if (correct) {
      streak.value++
      store.recordDrillBest(id(), streak.value)
    } else {
      streak.value = 0
    }
  }

  return { streak, best, grade }
}
