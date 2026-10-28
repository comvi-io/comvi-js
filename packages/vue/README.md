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
  <a href="https://bundlejs.com/?q=@comvi/vue&amp;treeshake=%5B%7BcreateI18n%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22vue%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/vue&amp;treeshake=%5B%7BcreateI18n%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22vue%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vue"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/vue` binds the Comvi i18n instance to Vue 3: `app.use(i18n)` at the root, `useI18n()` in
components, and `<T>` for translations that contain markup. On Nuxt, install
[`@comvi/nuxt`](https://comvi.io/docs/i18n/nuxt) instead; it builds on this package.

## Install

```bash
npm install @comvi/vue
# Peer: vue ^3.0.0
```

## Setup

In `src/main.ts`:

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

In a component, `src/App.vue`:

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
`locale.value` triggers the same switch. `useI18n('admin')` binds a namespace. Outside a
component, `formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` come from
`@comvi/vue` too and take the core instance first: `formatRelativeTime(i18n.core, -2, 'hour')`.

## Load from Comvi

Pass the CDN loader (`@comvi/core/cdn`) as the instance's `loader`, in `src/main.ts`:

```ts title="src/main.ts" check=group=vue-3
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});

createApp(App).use(i18n).mount("#app");
```

Read `isInitializing` in the component, in `src/App.vue`:

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

`cdn(url)` fetches each locale from the CDN. Vue has no `fallback`
prop, so `isInitializing` gates the first paint. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).

### How it works

`createI18n` from `@comvi/vue` wraps the core instance in a Vue plugin whose state is reactive:
`useI18n()` returns `t`, `locale` (a writable `Ref`), `setLocale`, `isLoading`, `isInitializing`
and `dir` as a `ComputedRef<"ltr" | "rtl">`, and a template or `computed` that calls `t()` re-runs
when the locale or the catalog changes. Installing the plugin also adds `$t`, `$tRaw` and `$i18n`
to every component, so `$i18n.setLocale('uk')` works from a template. `<T i18nKey="help">` takes
a named slot per tag; the `components` prop takes an HTML tag name, a Vue component or a
`{ component, props }` config and wins over a slot of the same name. Plain `t()` does not parse
tags.

For server-side rendering, build one instance per request, pass the request locale as
`ssrLocale`, and await `i18n.init()` before `renderToString`, because `app.use(i18n)` starts it
without waiting. `createI18n` builds the instance in `ssrLocale`, so it paints on the first render; `createI18nFromCore` on an existing instance switches to it once that locale's catalogs are available, and the first render is in the instance's current locale until then. On Nuxt, `@comvi/nuxt` does all of
this per request.

## Read next

- [Vue guide](https://comvi.io/docs/i18n/vue): markup inside a translation, SSR, the Options API.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `loader(map)`, namespaces and `useI18nLoader()`.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` checks keys and params.
- [Vue API reference](https://comvi.io/docs/i18n/api/vue): every export, composable, `<T>` prop and the injection key.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
