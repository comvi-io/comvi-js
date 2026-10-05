---
"@comvi/nuxt": patch
---

Runtime errors and warnings say "i18n instance", the no-loader remedy names `@comvi/nuxt/host`, and the root now exports `NuxtDefaultTranslationParams`, `NuxtI18nSetupNuxtApp`, `NuxtI18nSetupEvent`, `NuxtI18nSetupRuntimeConfig` and `RegisteredNuxtHost`. The route middleware now ignores an unknown `localeDetection.order` entry instead of reading `Accept-Language` for it.
