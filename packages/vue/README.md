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
writable: setting it switches, and it keeps the old value until the new locale's catalogs are in;
when you switch twice quickly the last switch wins. A failed switch keeps the old locale (the
`<select>` shows it again), reported as `load_failed` through `onError`; `setLocale()` is the
call that rejects, if you want to catch it. `useI18n("admin")` binds `t` and `T` to a namespace
and loads it (`useI18n()` loads `default`): on a server before the component renders, in the
browser after it mounts. While a catalog of it is on the way `isLoading` is `true` and `t()`
returns what a missing key returns (the key, or your `missing()`), unreported: show your
placeholder from `isLoading`. A load that failed ends that state (fallback text or the key) and
is not fetched again when a component mounts; `i18n.load("admin")` asks again and rejects when
it fails.

## Load from Comvi

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";
import App from "./App.vue";

const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/<project-token>") });

const app = createApp(App).use(i18n);
// Mount once the first catalogs are in.
i18n.ready.then(() => app.mount("#app"));
```

Later loads keep the app on screen (`isLoading`); a route can load its namespace before it
renders: `beforeEnter: () => i18n.load("account").catch(() => {})` (a rejected guard would
cancel the navigation; the page renders the fallback text instead).

## Markup in a translation

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
import TermsLink from "./TermsLink.vue"; // <a href="/terms"><slot /></a>
</script>

<template>
  <!-- "terms": "Read the <link>terms</link>, <b>in <i>full</i></b>." -->
  <T i18n-key="terms" :components="{ link: TermsLink, b: 'strong', i: 'em' }" />
</template>
```

Each tag renders through, in this order, a handler attribute of its name
(`:link="(c) => h('a', c)"`), its entry in `components` (an HTML tag name or a component; the
content is its default slot, nested tags included), or a slot of its name
(`<template #link="{ children }">{{ children }}</template>`: `children` is the tag's text when
it holds text only; a tag that holds markup takes `components`, and development warns). An
attribute that is `undefined` leaves the tag to the next; a tag with none of them renders as
text. Every attribute but `i18n-key`, `components` and the per-call options `ns`, `locale` and
`markers` is a message param, camelized (`:first-name` is `{firstName}`); `:markers="false"`
keeps the editor from marking the message. `useI18n(ns).T` takes no `ns`. On neither `<T>` do
`class` or `style` fall through (they are params): wrap `<T>` in your own element to style it.

## Server rendering

An instance per request, created with the app. `useI18n(ns)` and `<T ns>` load their namespace
before they render (`renderToString` waits for them), so the request only waits for the locale's
first catalogs, then hands everything over:

```ts title="server.ts"
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n, handover } from "@comvi/vue";

const i18n = createI18n({ ...options, locale, timeZone: "UTC" }); // timeZone: required
await i18n.ready;
const html = await renderToString(createSSRApp(App).use(i18n));
const payload = JSON.stringify(handover(i18n)).replace(/</g, "\\u003c");
// The page embeds it: <script>window.__I18N__ = ${payload}</script>
```

In the browser, `createI18n({ ...options, ...window.__I18N__ })` starts with the server's locale,
time zone, clock (`serverNow`) and catalogs: the app hydrates without a mismatch and fetches
nothing the server rendered. Relative time counts from the server's clock during the hydration
and from the browser's after mount; nothing re-renders by itself as time passes.

### How it works

`app.use(i18n)` provides the instance and `$t`. The binding keeps one `shallowRef` of the
instance's state; `locale` and `dir` are slices of it, so a component that reads only the locale
does not re-render when a namespace loads. `useFormat()` from `@comvi/vue/format` formats
numbers, dates, currency and relative time (`relative(date, { now?, numeric?, style? })`) in the
locale on screen.

## Read next

- [Vue guide](https://comvi.io/docs/i18n/vue): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.
- [Type safety](https://comvi.io/docs/i18n/type-safety): `t()`, `$t` and `<T>` check keys and params.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
