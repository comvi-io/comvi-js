---
"@comvi/vue": minor
---

**`createI18n(options).with(installer)` composes capabilities on the wrapper.** `VueI18n` gains `.with(installer)`: it runs the installer on `i18n.core`, returns the same instance, and widens the type of `core` by what the installer composed — so a Vue app reads like the React, Solid and Svelte ones:

```ts
const i18n = createI18n({ locale: "en", fallbackLocale: "en" })
  .with(icu())
  .with(cdnLoader({ cdnUrl }));

i18n.core.reloadTranslations(); // typed: `.with` widened `core`
createApp(App).use(i18n).mount("#app");
```

`createCore` + `createI18nFromCore` stay as the escape hatch for a host built elsewhere (Nuxt's `hostModule` uses it); they are no longer the recommended way to compose. The ordering rules are unchanged: `icu()` before the first catalog, so an inline `translation` takes `compiler: icuCompiler` in the options instead; and compose before `app.use(i18n)`, because `install` starts `init()`, which drains the plugin queue once (development warns on a later `.with`). An installer that returns a different object than the host it was given is refused with an error whose `code` is `E_WITH_HOST_IDENTITY` (`[i18n] .with(installer) must return the host it was given` in development).
