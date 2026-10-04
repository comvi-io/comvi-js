---
"@comvi/vue": minor
---

**`createI18n(options).use(installer)` composes capabilities on the wrapper.** `VueI18n` gains `.use(installer)`: it runs the installer on `i18n.core`, returns the same instance, and widens the type of `core` by what the installer composed — so a Vue app reads like the React, Solid and Svelte ones:

```ts
const i18n = createI18n({ locale: "en", fallbackLocale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl }),
);

i18n.core.reloadMessages(); // typed: `.use` widened `core`
createApp(App).use(i18n).mount("#app");
```

`createI18nFromCore` stays as the escape hatch for a host built elsewhere — built with `createI18n` from `@comvi/core`, the `createCore` alias being gone (`vue-drop-create-core.md`); Nuxt's `hostModule` uses it; it is no longer the recommended way to compose. ICU is not composed at all: it is `compiler: icuCompiler` in the options, whatever the catalogs come from. The one ordering rule is vue's own: compose before `app.use(i18n)`, because `install` starts `init()`, which drains the plugin queue once (development warns on a later `.use`). An installer that returns a different object than the host it was given is refused with an error whose `code` is `E_USE_HOST_IDENTITY` (`[@comvi/vue] .use(installer) must return the host it was given` in development).
