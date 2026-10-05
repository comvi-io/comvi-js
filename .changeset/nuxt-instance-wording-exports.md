---
"@comvi/nuxt": patch
---

Runtime errors and warnings say "i18n instance", the no-loader remedy names `@comvi/nuxt/host`, and the root now exports `NuxtDefaultTranslationParams`, `NuxtI18nSetupNuxtApp`, `NuxtI18nSetupEvent`, `NuxtI18nSetupRuntimeConfig` and `RegisteredNuxtHost`. The route middleware now ignores an unknown `localeDetection.order` entry instead of reading `Accept-Language` for it. The locale state and cookie now follow the instance on `localeChanged`, so a `comvi.setup` listener that switches again no longer leaves them stale, and the root re-exports `MessagesMap`.
