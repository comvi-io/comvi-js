<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vue</h1>

<p align="center">Vue 3 bindings for Comvi i18n — one plugin, composables, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vue"><img src="https://img.shields.io/npm/v/@comvi/vue?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/vue"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/vue?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vue` is the whole toolkit for a Vue 3 app: it bundles `@comvi/core`, so one install is
enough. `useI18n()` returns refs and computeds, so a locale or catalog change triggers precise
re-renders. One `app.use(i18n)` covers the Composition API, the Options API and templates. Pair it
with the [Comvi platform](https://comvi.io) and the catalogs are fetched from the CDN at runtime
instead of bundled.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()` — on this package
that is a `VueI18n` wrapper, and the bare core host it wraps is public as `i18n.core`.

📖 [Documentation](https://comvi.io/docs/i18n/vue)

## 1. Install

```bash
npm install @comvi/vue
# Peer: vue ^3.0.0
```

## 2. Quick start — an inline catalog

The smallest working app: `createI18n` builds the host, `locale` is what renders now,
`fallbackLocale` covers a missing key, `translation` is the catalog, and `app.use(i18n)` installs it
so `useI18n()` can find it. Runnable: [`examples/vue`](../../examples/vue).

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createApp(App).use(i18n).mount("#app");
```

```vue title="src/App.vue"
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
</template>
```

There is no `i18n.init()` call: `app.use(i18n)` initializes the host itself. And `app.use(i18n)` is
Vue's own plugin verb, unrelated to comvi's `.use(installer)` composition pipe below — the two share
a name and take different arguments.

## 3. Connect to Comvi

Three questions, and the answers are the lines below.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) fails in development at ingestion, before anything renders. Inline, it
   throws `E_ICU_SYNTAX` at the call that carries the catalog; over a loader it fails that
   namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and
   `init()` rejects with `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when
   that was the only namespace. In production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn` (a second
   install), which fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** `isInitializing`, in the component that owns the children. The
   catalog is in flight during the first paint now, and Vue has no `fallback` prop, so the gate is
   `<div v-if="isInitializing" class="spinner" />` and a `v-else` beside it.

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n, icuCompiler } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

createApp(App).use(i18n).mount("#app");
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

The URL in the snippet above is an example. `cdnUrl` is the whole URL the platform hands you:
open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved). **Compose before `app.use(i18n)`**, which is what the chain above does — it
is the one ordering rule this package adds.

## 4. What is specific to Vue

- **`useI18n(ns?)`** returns refs and computeds — `t`, `locale`, `isLoading`, `isInitializing`,
  `setLocale`, the four `Intl` formatters, and `translationCache` as a direct member. It does
  **not** carry the loader or plugin members: `useI18nLoader()` and `useI18nPlugins()` acquire
  those, and throw on a host that never composed them.
- **The bare core host** is `i18n.core`, or `inject(I18N_INJECTION_KEY).core` inside a component.
- **Options API and templates** get `$t`, `$locale` and `$setLocale` from the same
  `app.use(i18n)`, so a template needs no import.
- **`<T i18nKey="help">`** takes its tag handlers as named slots (`<template #link="{ children }">`),
  with the `components` prop as the programmatic alternative for a map built in `setup()`.

## 5. Where to go next

- **This binding:** [guide](https://comvi.io/docs/i18n/vue) ·
  [API reference](https://comvi.io/docs/i18n/api/vue)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) ·
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) ·
  [`docs/design/`](../../docs/design)

Measured min+gz through the published entry, gated in CI. Every fixture and the 0.4.1 comparison:
[bundle size](https://comvi.io/docs/i18n/bundle-size).

| app shape                      | measured as      | min+gz |
| ------------------------------ | ---------------- | ------ |
| base host + bindings, no `<T>` | `fw-vue-default` | 7272 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
