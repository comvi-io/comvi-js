<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vue</h1>

<p align="center">Vue 3 bindings for Comvi i18n: a plugin, <code>useI18n()</code>, <code>$t</code> and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vue"><img src="https://img.shields.io/npm/v/@comvi/vue?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vue"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/vue` binds the Comvi i18n instance to Vue: `app.use(i18n)` once, `useI18n()` or `$t` in
components, and `<T>` for translations that contain markup.

## Install

```bash
npm install @comvi/vue # peer: vue ^3.5.0
```

## Setup

```ts title="src/main.ts"
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

## Use in components

```vue title="src/App.vue"
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, locale } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <select v-model="locale">
    <option value="en">English</option>
    <option value="uk">Українська</option>
  </select>
</template>
```

`t()` fills `{name}` from its second argument; `{ ns }` and `{ locale }` there switch the
namespace and the locale for one call. `$t` is the same `t()` in every template. `locale` is
writable: setting it switches, and it keeps the old value until the new locale's catalogs are in.
`useI18n("admin")` binds `t` and `T` to a namespace and loads it after the component mounts;
`isLoading` tells you when one of its catalogs is on the way. A load that failed is not fetched
again when a component mounts; `i18n.load("admin")` asks again.

## Load from Comvi

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";
import App from "./App.vue";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/<project-token>") });

const app = createApp(App).use(i18n);
// Mount once the first catalogs are in, so raw keys never paint.
i18n.ready.then(() => app.mount("#app"));
```

Later loads keep the app on screen (`isLoading`); a route can load its namespace before it
renders: `beforeEnter: () => i18n.load("account")`.

## Markup in a translation

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
</script>

<template>
  <!-- "terms": "Read the <link>terms</link>." -->
  <T i18n-key="terms">
    <template #link="{ children }">
      <a href="/terms">{{ children }}</a>
    </template>
  </T>
</template>
```

Each tag is a slot of the same name, or a handler attribute (`:link="(c) => h('a', c)"`, for a tag
that holds markup itself); a tag without either renders as text. Every attribute but `i18n-key`
and the per-call options `ns`, `locale` and `markers` is a message param, camelized
(`:first-name` is `{firstName}`); `:markers="false"` keeps the editor from marking the message.
`useI18n(ns).T` takes no `ns`; on it `class` and `style` also fall through to its root element.

## Server rendering

An instance per request, created with the app; load what the route needs, then hand it over:

```ts title="server.ts"
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n, handover } from "@comvi/vue";

const i18n = createI18n({ ...options, locale, timeZone: "UTC" }); // timeZone: required
await Promise.all([i18n.load("account"), i18n.ready]);
const html = await renderToString(createSSRApp(App).use(i18n));
const payload = JSON.stringify(handover(i18n)).replace(/</g, "\\u003c");
// The page embeds it: <script>window.__I18N__ = ${payload}</script>
```

In the browser, `createI18n({ ...options, ...window.__I18N__ })` starts with the server's locale,
time zone, clock and catalogs: the app hydrates without a mismatch and fetches nothing the server
rendered.

### How it works

`app.use(i18n)` provides the instance and `$t`. The binding keeps one `shallowRef` of the
instance's state; `locale` and `dir` are `computed` slices of it, so a component that reads only
the locale does not re-render when a namespace loads. `useFormat()` from `@comvi/vue/format`
formats numbers, dates and currency in the locale on screen.

## Read next

- [Vue guide](https://comvi.io/docs/i18n/vue): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.
- [Type safety](https://comvi.io/docs/i18n/type-safety): `t()`, `$t` and `<T>` check keys and params.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
