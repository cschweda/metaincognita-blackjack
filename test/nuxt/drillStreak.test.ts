import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useDrillStreak } from '../../app/composables/useDrillStreak'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'

describe('useDrillStreak — the shared drill scoring contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('grows the streak on hits, persists the best, resets on a miss', () => {
    const store = useBlackjackStore()
    const { streak, best, grade } = useDrillStreak('scratch-drill')
    grade(true)
    grade(true)
    expect(streak.value).toBe(2)
    expect(best.value).toBe(2)
    grade(false)
    expect(streak.value).toBe(0)
    expect(best.value).toBe(2) // lifetime best survives the miss
    expect(store.training.drillBests['scratch-drill']).toBe(2)
  })

  it('supports per-level ids through a getter', () => {
    const level = ref('easy')
    const { grade, best } = useDrillStreak(() => `count-${level.value}`)
    grade(true)
    expect(best.value).toBe(1)
    level.value = 'hard'
    expect(best.value).toBe(0) // reads the new level's best
    grade(true) // streak continues but records under the new id
    expect(useBlackjackStore().training.drillBests['count-hard']).toBe(2)
  })
})
