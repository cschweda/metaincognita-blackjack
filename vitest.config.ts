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
      // the engine is the heart — hold it to a high floor
      thresholds: {
        'app/utils/engine/**': { statements: 90, branches: 85, functions: 90, lines: 90 }
      }
    }
  }
})
