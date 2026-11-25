<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt module for Comvi i18n: auto-imports, SSR, and locale-prefixed routes.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/nuxt"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/nuxt` is the Nuxt module of Comvi i18n: it creates an i18n instance per request, renders the
page's translations on the server, starts the browser from that render, and clones your pages into
locale-prefixed routes. Add the module, list your locales in `nuxt.config.ts`, and put the loader in
`comvi.i18n.ts`; `useI18n()`, `useFormat()`, `<T>` and `$t` are auto-imported.

## Install

```bash
npm install @comvi/nuxt # peer: nuxt ^3.7.0 || ^4.0.0; Node 22.20 or newer
```

The module brings `@comvi/core` and `@comvi/vue` with it. `@comvi/core` and every binding in an app
must be on one version. With two copies of `@comvi/core` (two versions, or one version installed
twice) nothing fails at import: an error that names both versions is thrown when an instance
created by one copy reaches code of the other (a binding, or `@comvi/core/format`).

On Nuxt 4.0.0, add a `nitropack` override first (`pnpm.overrides`, npm `overrides` or Yarn
`resolutions`): `"nitropack": "2.12.9"`. That is the configuration the module is tested with on Nuxt
4.0.0 ([Compatibility](https://comvi.io/docs/i18n/compatibility)).

## Setup

The data go to `nuxt.config.ts` (`timeZone` is required: the server and the browser format dates in
one zone):

```ts title="nuxt.config.ts" check=group=nuxt-app
export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "uk"], defaultLocale: "en", timeZone: "UTC" },
});
```

The functions go to `comvi.i18n.ts` next to it. A dynamic import returns a module, so the loader
returns its `default`, the catalog. Catalogs are nested or flat JSON, `locales/<ns>/<locale>.json`:

```ts title="comvi.i18n.ts" check=group=nuxt-app
import { defineI18nOptions } from "@comvi/nuxt/i18n";

export default defineI18nOptions(() => ({
  loader: async (locale, ns) => (await import(`./locales/${ns}/${locale}.json`)).default,
}));
```

```vue title="app/pages/index.vue" check=group=nuxt-app
<script setup lang="ts">
const { t, locale } = useI18n();
const switchLocalePath = useSwitchLocalePath();
</script>

<template>
  <h1>{{ t("home.title", { name: "Alice" }) }}</h1>
  <NuxtLink :to="switchLocalePath(locale === 'en' ? 'uk' : 'en')">Switch</NuxtLink>
</template>
```

`<T i18n-key="terms" :components="{ b: 'strong' }">` renders a message with markup: a tag renders
through its `components` entry, else through a slot of its name (`<template #link="{ children }">`),
else as its inner text, and a param is always text
([limit](https://comvi.io/docs/i18n/limitations#params-are-text)). Switching the language is a
navigation: the URL, the text, the cookie and `<html lang dir>` move together, and the old text
stays until the new catalogs are in. In a Nitro route, `const { t } = await useTranslation(event)`
translates with the same options.

## Typed keys

`comvi.types` needs Nuxt 3.21.11+ or 4.6.0+: on an older Nuxt the module stops with an error that
names your version ([limit](https://comvi.io/docs/i18n/limitations#nuxt-types-version)). It is not
tested on Windows. It types the keys and params from JSON catalogs, the ones the loader imports: add
`types: { from: "./locales" }` (relative to the project root) to `comvi` in `nuxt.config.ts`.
`nuxt prepare`, `nuxt typecheck` and `nuxt build` write `.nuxt/types/comvi.d.ts` from the
`defaultLocale` catalogs, and `nuxt dev` rewrites it when a catalog changes; there is nothing to
commit. For `{ "greeting": "Hello, {name}!" }` in `locales/default/en.json` the file reads, after a
header comment:

<!-- prettier-ignore -->
```ts title=".nuxt/types/comvi.d.ts (generated)" check=group=nuxt-types
import '@comvi/nuxt';

declare module '@comvi/nuxt' {
  interface Catalogs {
    "default": {
      "greeting": { "name": string | number };
    };
  }
}

export {};
```

From then on, a key that is not in the catalog is a type error that `nuxt typecheck` reports:

```vue title="app/pages/greeting.vue" check=group=nuxt-types check=expect-error
<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <!-- "greting" is not a key -->
  <h1>{{ t("greting", { name: "Alice" }) }}</h1>
</template>
```

A param the message uses is required too. A misspelt namespace is an error in `useI18n(ns)` and
`t(key, { ns })`, and still compiles in `load()`, `add()`, `has()` and the `namespaces` option
([limit](https://comvi.io/docs/i18n/limitations#namespace-typos-config)).

## Namespaces: `isReady`, `isLoading` and `ready`

`useI18n("account")` binds `t` to the `account` namespace and holds the namespace while the
component is mounted: it loads on the server render, for the locale on screen and for every locale a
switch goes to. `isReady` is `true` when a catalog of the namespace is usable for the locale on
screen; `isLoading` is `true` while one is on the way. Check `isReady` first. Both `false` means the
text is not available and nothing is loading. `i18n.ready` is something else: a promise that
resolves when the loads in flight have settled, the failed ones too.

## Load from Comvi

`cdn()` from `@comvi/nuxt/i18n` is a `loader` that reads the catalogs your Comvi project published
to its CDN.

### `messages` beside `loader`

An inline catalog (`comvi.messages` in `nuxt.config.ts`, or `add()`) switches off loading for its
own pair of locale and namespace, and for nothing else: the loader is never asked for that pair,
while other namespaces of that locale and the same namespace in other locales still load. So do not
inline a catalog the CDN should serve. For a bundled catalog that is used when the CDN does not
answer, pass `fallback`: it is a spare, not a base that the CDN's catalog is laid over
([limit](https://comvi.io/docs/i18n/limitations#messages-and-loader)).

### Report errors with `onError`

`onError` receives every problem as an object with a `code` (`load_failed`, `missing_key` and
others) and the `locale`, `ns` and `key` it concerns. Without it, a development build prints
problems to the console and a production build prints nothing. `onError` reports and changes nothing
else: when a catalog fails, the page still renders, with the `fallbackLocale`'s text or, with no
catalog at all, the key or your "not available" branch.

```ts title="comvi.i18n.ts" check=group=nuxt-cdn
import { cdn, defineI18nOptions } from "@comvi/nuxt/i18n";

export default defineI18nOptions(() => ({
  loader: cdn("https://cdn.comvi.io/<project-token>", {
    // keys: "<locale>", or "<locale>:<namespace>"
    fallback: { en: () => import("./locales/default/en.json").then((m) => m.default) },
  }),
  onError(error) {
    if (error.code === "load_failed")
      console.error(`No catalog for ${error.locale}/${error.ns}`, error.cause);
  },
}));
```

### A loader that asks your own server: `x-comvi-catalog`

A custom loader that requests catalogs from the app's own server (a Nitro route, through `$fetch` or
`event.$fetch`) must send the header `x-comvi-catalog: 1`. Nuxt renders a URL with no server route
as a page, and without the header the module cannot tell a catalog request from a page view. With
it, the module answers a request that no server route answers with a 404, and the load fails with
`load_failed`. A loader that reads an outside URL, such as the CDN, does not send it. The header is
reserved: a request that carries it to a server-rendered page URL gets a 404
([limit](https://comvi.io/docs/i18n/limitations#nuxt-catalog-header)).

```ts title="comvi.i18n.ts" check=group=nuxt-private
import { defineI18nOptions } from "@comvi/nuxt/i18n";

export default defineI18nOptions((event) => {
  // On a server, the request's own fetch forwards the user's cookies.
  const fetch = event?.$fetch ?? $fetch;
  return {
    loader: (locale, ns, signal) =>
      fetch(`/api/i18n/${locale}/${ns}`, {
        signal,
        retry: 0, // one attempt: `i18n.load(ns)` is the retry
        headers: { "x-comvi-catalog": "1" },
      }),
  };
});
```

## A rejected `setLocale()`

Switch with a link (`useSwitchLocalePath()`, `<NuxtLinkLocale locale>`): a switch whose catalogs all
fail keeps the locale on screen and its URL, and `onError` gets `load_failed`. `setLocale()` changes
the i18n instance only (the text and the cookie, not the URL), and the next navigation applies the
URL's locale: use it as the switch with `localePrefix: "never"`. When none of the new locale's
catalogs loads, it rejects with the loader's error and the locale and the text on screen stay as
they were. Calling `setLocale()` again calls the loader again.

## Retry with `load()`

A namespace whose load failed renders its "not available" branch, and mounting the component again
does not call the loader. `i18n.load(ns)` does: it calls the loader again for the catalogs of `ns`
that failed, and it rejects with the loader's error only when the locale's own catalog fails again
and no catalog of its parents (`de` for `de-AT`) is usable; a `fallbackLocale`'s does not count. On
a client navigation the component shows its loading branch until the namespace is in. To keep the
previous page on screen instead, wait for the load in the page's setup, as the `await` line does:

```vue title="app/pages/account.vue" check=group=nuxt-app
<script setup lang="ts">
const { t, locale, setLocale, isReady, isLoading, i18n } = useI18n("account");
const retry = () => i18n.load("account").catch(() => {}); // `onError` has the report
if (isLoading.value) await retry();
const failed = ref(false);
const toggle = () =>
  setLocale(locale.value === "en" ? "uk" : "en").then(
    () => (failed.value = false),
    () => (failed.value = true),
  );
</script>

<template>
  <h1 v-if="isReady">{{ t("title") }}</h1>
  <p v-else-if="isLoading">…</p>
  <button v-else @click="retry">Not available. Retry</button>
  <button @click="toggle">{{ failed ? "Could not switch. Try again" : locale }}</button>
</template>
```

## Routing

`localePrefix` decides the URLs: `as-needed` (the default) gives `/about` and `/de/about`, `always`
`/en/about` and `/de/about`, `never` `/about` for every locale. Under `as-needed` `/about` is the
default locale's URL, cookie or not; `/` and any URL under `never` read the `i18n_locale` cookie,
then `Accept-Language`, and the module records the locale in the cookie. A query parameter named in
`localeDetection.queryParam` wins on any unprefixed URL. `useLocalePath()`, `useSwitchLocalePath()`,
`useLocaleRoute()` and `<NuxtLinkLocale>` build the links, and `useLocaleHead()` adds canonical,
hreflang and `og:locale` ([Nuxt guide](https://comvi.io/docs/i18n/nuxt)).

## Limits

[Limits](https://comvi.io/docs/i18n/limitations) lists what Comvi i18n does not do. Among its
entries:

- [`{count, number}` and `{when, date}` are not message syntax](https://comvi.io/docs/i18n/limitations#no-number-date-args): format the value with `useFormat()` and pass the result as a plain param.
- [`routeRules` with `swr` are not supported for pages Comvi renders](https://comvi.io/docs/i18n/limitations#nuxt-swr).
- [`isr`, `ssrStreaming`, non-Node Nitro presets and `nuxt generate` are not verified](https://comvi.io/docs/i18n/limitations#nuxt-unverified).
- [An error page renders in the locale of its own URL](https://comvi.io/docs/i18n/limitations#nuxt-error-page-locale).
- [A handed-over catalog replaces the browser's catalog of the same locale and namespace whole](https://comvi.io/docs/i18n/limitations#handover-replaces-slot), and [after a switch, a component inside a deactivated `<KeepAlive>` loads its namespace when it is activated again](https://comvi.io/docs/i18n/limitations#vue-keepalive).

Read next: the [Nuxt guide](https://comvi.io/docs/i18n/nuxt),
[Server-side rendering](https://comvi.io/docs/i18n/ssr) and
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
