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
npm install @comvi/vue @comvi/core # peer: vue ^3.5.0; the app imports @comvi/core/cdn
```

## Setup

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";
const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" }, uk: { greeting: "Привіт, {name}!" } },
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

`t()` fills `{name}` from its second argument (`{ ns }`, `{ locale }` there apply to one call);
`$t` is the same `t()` in every template. `locale` is writable: setting it switches once the new
catalogs are in (the last of quick switches wins; a failed one keeps the old locale, reported as
`load_failed`). `setLocale()` rejects for an invalid tag, or when no catalog of the locale or its
parent (`de` for `de-AT`) loaded for any namespace it waited for.

```vue title="src/Account.vue"
<script setup lang="ts">
import { useI18n } from "@comvi/vue";
const { t, isReady, isLoading } = useI18n("account");
</script>

<template>
  <h2 v-if="isReady">{{ t("title") }}</h2>
  <p v-else-if="isLoading" class="spinner" />
  <p v-else>Not available</p>
</template>
```

`useI18n("account")` binds `t` and `T` and holds the namespace from mount to unmount (inside
`<KeepAlive>` while active; `v-show` keeps it): it loads for the locale on screen and every
switch; with no component holding it, it stays cached and a switch skips it. `isReady`: a catalog
of the locale on screen, its parent or a `fallbackLocale` is in; `isLoading`: one is on the way.
A failed load is `false`/`false` only with no usable catalog — with a fallback locale's catalog
in, it is `true`/`false` once the requests finish; a remount does not retry, `i18n.load("account")`
does. `t()`, `$t` and `<T>` only read (development warns about a namespace nothing loads). Outside a component
use `i18n.load()`, which holds nothing (`beforeEnter: () => i18n.load("account").catch(() => {})`
preloads a page), or the `namespaces` option.

## Load from Comvi

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";
import App from "./App.vue";
const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/<project-token>") });
i18n.ready.then(() => createApp(App).use(i18n).mount("#app")); // once the first catalogs are in
```

## Markup in a translation

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
import TermsLink from "./TermsLink.vue"; // <a href="/terms"><slot /></a>
</script>

<template>
  <!-- "terms": "Read the <link>terms</link>,<br/><b>in <i>full</i></b>." -->
  <T i18n-key="terms" :components="{ link: TermsLink, br: 'br', b: 'strong', i: 'em' }" />
</template>
```

A tag renders through a handler attribute of its name (`:link="(c) => h('a', c)"`), else its
`components` entry (a tag name, a component, or `{ component: RouterLink, props: { to: "/terms" } }`;
the content is its default slot, nested tags included), else a slot of its name
(`<template #link="{ children }">`, `children` the tag's text), else as text. Every other
attribute but `i18n-key`, `ns`, `locale` and `markers` is a param, camelized, `class` too. `<br/>`
renders nothing without its entry or handler.

## Server rendering

An instance per request; `useI18n(ns)` loads before its component renders, and `handover()` carries
every namespace the request needed. Match a locale from a route, cookie or header against your
supported locales first: `createI18n()` throws a `RangeError` for one that is not a tag, a
configuration error. A valid locale with no translation falls back, and `t(key, { locale })`,
`has()`, `add()` and `fallbackLocale` entries only report `invalid_locale`.

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

In the browser, `createI18n({ ...options, ...window.__I18N__ })` starts from the server's state:
the same `isReady`/`isLoading`, no mismatch, nothing fetched that the server rendered.

## Read next

- [Vue guide](https://comvi.io/docs/i18n/vue): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
