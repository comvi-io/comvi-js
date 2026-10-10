<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vue</h1>

<p align="center">Vue 3 bindings for Comvi i18n: one plugin, composables, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vue"><img src="https://img.shields.io/npm/v/@comvi/vue?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/vue"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/vue?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

Translate a Vue 3 app with `@comvi/vue`: `app.use(i18n)` at the root, `useI18n()` in components,
and `<T>` for markup. The package depends on `@comvi/core`, so one install is enough. The full
guide is [Vue](https://comvi.io/docs/i18n/vue) on the docs site.

## Install

```bash
npm install @comvi/vue
# Peer: vue ^3.0.0
```

## Setup

```ts title="src/main.ts" check=group=vue-1
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createApp(App).use(i18n).mount("#app");
```

`createI18n` builds the i18n instance and `app.use(i18n)` installs the plugin and starts `init()`.
`app.use(i18n)` is Vue's plugin verb; Comvi's `.use(installer)` composes a capability onto the instance.

## Use in components

```vue title="src/App.vue" check=group=vue-1
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, locale, setLocale } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }} ({{ locale }})</h1>
  <button @click="setLocale('uk')">Українська</button>
  <button @click="locale = 'en'">English</button>
</template>
```

`t()` inside a template or `computed` tracks the locale and the cache. `locale` is a
`Ref<string>`: `setLocale()` resolves once the new locale's translations are loaded, and assigning
`locale.value` triggers the same switch. `useI18n('admin')` binds a namespace.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/main.ts" check=group=vue-3
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));

createApp(App).use(i18n).mount("#app");
```

```vue title="src/App.vue" check=group=vue-3
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, isInitializing } = useI18n();
</script>

<template>
  <div v-if="isInitializing" class="spinner" />
  <h1 v-else>{{ t("greeting", { name: "Alice" }) }}</h1>
</template>
```

`.use(cdnLoader({ cdnUrl }))` fetches each locale from the CDN. Compose before `app.use(i18n)`: `init()`
drains the plugin queue once, and a plugin queued after it waits for a second `init()` that never comes. Vue has no `fallback`
prop, so `isInitializing` gates the first paint. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent, and either works without the other.

## Specific to Vue

- `useI18n()` returns refs and computeds: `t`, `locale`, `setLocale`, `isLoading`,
  `isInitializing`, and `dir` as a `ComputedRef<"ltr" | "rtl">`.
- Installing the plugin adds `$t(key, params?)`, `$tRaw(key, params?)` and `$i18n` to every
  component, so `$i18n.setLocale('uk')` works from a template too.
- `<T i18nKey="help">` takes a named slot per tag, with the content as `children`; the `components`
  prop takes an HTML tag name, a Vue component or a `{ component, props }` config and wins over a
  slot of the same name. Plain `t()` does not parse tags.
- For server-side rendering, build one instance per request, pass the request locale as
  `ssrLocale`, and await `i18n.init()` before `renderToString`, because `app.use(i18n)` starts it
  fire-and-forget. On Nuxt, [`@comvi/nuxt`](https://comvi.io/docs/i18n/nuxt) does all three per
  request. `ssrLocale` paints on the first render when that locale's catalogs are already available (inline `messages`, or loaded earlier); otherwise the first render is in the instance's current locale and the switch lands when the load completes.

## Next steps

- [Vue guide](https://comvi.io/docs/i18n/vue): markup inside a translation, SSR, the Options API.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `loader(map)`, namespaces and `useI18nLoader()`.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` checks keys and params.
- [Vue API reference](https://comvi.io/docs/i18n/api/vue): every export, composable, `<T>` prop and the injection key.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
