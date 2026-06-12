export default defineNuxtConfig({

  modules: ['@pinia/nuxt', '@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils'],
  ssr: false,

  // components live in domain subdirectories (cards/, table/, setup/) but are
  // referenced unprefixed in templates (<PlayingCard>, <ChipStack>, ...)
  components: [{ path: '~/components', pathPrefix: false }],

  devtools: {
    enabled: true
  },

  app: {
    head: {
      title: 'Blackjack Trainer',
      meta: [
        { name: 'description', content: 'Authentic casino blackjack simulator and trainer — basic strategy, card counting, official-rulebook rules' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    clientBundle: {
      scan: true
    }
  }
})
