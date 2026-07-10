import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
          testTimeout: 30000
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom'
            }
          }
        }
      })
    ],
    coverage: {
      provider: 'v8',
      // the TS logic layers only — .vue rendering is exercised by the nuxt/e2e suites
      include: ['app/utils/**', 'app/composables/**', 'app/stores/**', 'app/workers/**'],
      // floors are measured-reality minus a 2-point regression margin (spec §2) —
      // raise coverage to move them, never lower them to dodge a red bar
      thresholds: {
        'app/utils/engine/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        // per-file: the engine aggregate must never mask the personas again
        'app/utils/engine/bots.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'app/composables/**': { statements: 86, branches: 71, functions: 88, lines: 91 },
        'app/stores/**': { statements: 91, branches: 81, functions: 94, lines: 93 },
        'app/workers/**': { statements: 95, branches: 95, functions: 95, lines: 95 }
      }
    }
  }
})
