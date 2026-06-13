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
      htmlAttrs: { lang: 'en' },
      // inline so the first paint is dark even before any stylesheet arrives
      bodyAttrs: { style: 'background-color: #0a0a0a' },
      title: 'Blackjack Trainer',
      meta: [
        { name: 'description', content: 'Authentic casino blackjack simulator and trainer — basic strategy, card counting, official-rulebook rules' },
        { property: 'og:title', content: 'Blackjack Trainer' },
        { property: 'og:description', content: 'Basic strategy coaching and Hi-Lo counting practice on rules from official casino documents.' },
        { property: 'og:image', content: '/og-image.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Blackjack Trainer' },
        { name: 'twitter:description', content: 'Basic strategy coaching and Hi-Lo counting practice on rules from official casino documents.' },
        { name: 'twitter:image', content: '/og-image.png' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  // branded boot screen while the SPA bundle loads (app/spa-loading-template.html)
  spaLoadingTemplate: true,

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
