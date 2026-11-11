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

Nuxt 3.7+ and Nuxt 4 on Node 22.20+, or the newer Node your Nuxt requires. Verified: Nuxt 3.7.0,
3.21.11, 4.0.0 and 4.6.0 on Node 22.22.3; Nuxt 3.21.11 and 4.6.2 on Node 24.22.1. Three limits outside
the module are listed under [Version notes](#version-notes).

`@comvi/nuxt` is the Comvi i18n module for Nuxt 3 and 4: it creates one i18n instance per request,
renders the page's translations on the server, starts the browser from that render, and clones your
pages into locale-prefixed routes. `useI18n()`, `useFormat()`, `<T>` and `$t` are `@comvi/vue`'s own,
auto-imported; the module brings `@comvi/core` and `@comvi/vue` with it.

## Install

```bash
npm install @comvi/nuxt
```

## Setup

The data go to `nuxt.config.ts`, once; the module uses them on the server and in the browser:

```ts title="nuxt.config.ts" check=group=nuxt-app
export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: ["en", "uk"],
    defaultLocale: "en",
    timeZone: "UTC", // required: the server and the browser format dates in one zone
  },
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
  <p>{{ $t("home.count", { count: 3 }) }}</p>
  <T i18n-key="home.terms">
    <template #link="{ children }"
      ><NuxtLinkLocale to="/terms">{{ children }}</NuxtLinkLocale></template
    >
  </T>
  <NuxtLink :to="switchLocalePath(locale === 'en' ? 'uk' : 'en')">Switch</NuxtLink>
</template>
```

Switching the language is a navigation: the URL, the text, the cookie and `<html lang dir>` move
together, and the old text stays until the new catalogs are in. `setLocale()` changes the instance
only (the text and the cookie, not the URL; the next navigation applies the URL's locale): use it as
the switch with `localePrefix: "never"`. A switch whose catalogs all fail keeps the locale on screen
and its URL. Navigate with `<NuxtLink>` or `router.push`: a `navigateTo()` called while a language
switch is pending is ignored (Nuxt returns the location without navigating).

For a two-line start, `comvi.messages: { en: { … }, uk: { … } }` in `nuxt.config.ts` gives the
`default` namespace without files; those catalogs are compiled into the app bundle, and no page payload
carries a flat one again (a nested one, or one a server `add()` changed, is handed over as usual).

## A page that waits for its namespace

`useI18n("account")` loads the page's namespace on the server render and, on a client navigation,
shows the loading branch until it is in. To keep the previous page on screen instead, load it
explicitly and wait for the result:

```vue title="app/pages/account.vue" check=group=nuxt-app
<script setup lang="ts">
const { t, isReady, isLoading, i18n } = useI18n("account");
// The error is already reported through `onError`; the page shows the fallback or "unavailable".
if (isLoading.value) await i18n.load("account").catch(() => {});
</script>

<template>
  <h1 v-if="isReady">{{ t("title") }}</h1>
  <p v-else-if="isLoading">…</p>
  <button v-else @click="i18n.load('account').catch(() => {})">Retry</button>
</template>
```

At hydration nothing is loading, so the line does nothing and asks for nothing. It inherits
`load()`'s retry semantics: `load(ns)` asks every pair of `ns` not in place, a failed one too, and
`isLoading` can be true while one pair of the chain loads and another has already failed. The empty
`.catch` does not ignore the error: `onError` has reported it, and the page renders the fallback or
the "unavailable" branch. A later visit asks nothing again; the button is the retry.

## A private source

A source with a secret lives in the app's own server route; one loader calls it on the server
render, in the browser and from Nitro routes:

```ts title="server/api/i18n/[locale]/[ns].get.ts" check=group=nuxt-private
import { api } from "@comvi/nuxt/i18n";

const load = api("https://api.comvi.io", { key: String(useRuntimeConfig().comviApiKey) });

export default defineEventHandler(async (event) => {
  const { locale, ns } = getRouterParams(event);
  const { locales } = useRuntimeConfig(event).public.comvi;
  // The app's own list, and its own access rule: a parameter never reaches the source unchecked.
  if (!locales.includes(locale!) || !["default", "account"].includes(ns!))
    throw createError({ statusCode: 404 });
  return load(locale!, ns!, AbortSignal.timeout(10_000));
});
```

```ts title="comvi.i18n.ts" check=group=nuxt-private
import { defineI18nOptions } from "@comvi/nuxt/i18n";

export default defineI18nOptions((event) => {
  // On a server, the request's own fetch: it forwards the user's cookies and calls the route
  // in-process. In the browser `event` is undefined and `$fetch` sends them itself.
  const fetch = event?.$fetch ?? $fetch;
  return {
    loader: (locale, ns, signal) =>
      fetch(`/api/i18n/${locale}/${ns}`, {
        signal,
        retry: 0,
        // Marks the catalog request: if no route answers it, the module answers it 404.
        headers: { "x-comvi-catalog": "1" },
      }),
  };
});
```

`retry: 0` applies to any loader built on `$fetch` where one attempt is wanted: `$fetch` repeats a
failed GET once otherwise, and the retry belongs to `i18n.load(ns)`. A protected route also needs the
request forwarded through `event.$fetch`. The key stays in the server build. `x-comvi-catalog`
marks the catalog request: Nuxt renders a URL with no server route as a page, so a missing route
would render a page whose loader asks for the same URL again, without end. The module answers a
page render that carries the header with a 404 instead, and the load fails (`load_failed`). A
loader that sends no such header to a missing route still recurses until the process runs out of
memory: the route must exist. The header is reserved: any request that carries it to a server-rendered page URL gets that 404.

### How it works

On a server the module resolves the request's locale (URL, cookie, `Accept-Language`) before the
instance exists, creates it in that locale, waits for its catalogs and for each `useI18n(ns)` of the
page, and writes one snapshot into the Nuxt payload after the render. The browser creates its
instance from that snapshot before any component renders, so hydration asks the loader for nothing,
a catalog the server failed included (it renders the fallback the server rendered until a retry).
After it, every new namespace comes from the browser's loader. `useNuxtApp().$i18n` is the instance
outside a component. In a Nitro route, `const { t } = await useTranslation(event, { ns?, locale? })`
gives `{ t, locale, dir, i18n }` on the same options. Every server instance ends with its request:
after the response, when the handler throws, or when the client goes away. `routeRules` with `swr`
are excluded for pages rendered with Comvi: the stale-while-revalidate re-render runs after the
response has ended its instance, and the cache stores raw keys. `isr`, `ssrStreaming`, non-Node
presets and `nuxt generate` are unverified (neither supported nor excluded).

### Version notes

- Nuxt 4.0.0 as installed pins nitropack 2.12.0, which answers every `/_nuxt/` asset with a 500
  (observed with nitropack 2.12.0 to 2.12.8). It is Nuxt's own defect: a plain Nuxt 4.0.0 app without
  Comvi shows it. nitropack 2.12.9 or later fixes it (verified: 2.12.9, 2.13.0, 2.13.6), and so does
  Nuxt 4.0.3, whose install resolves nitropack 2.13.6.
- Older Nuxt versions print their own `[nuxt] error caught during app initialization` with
  `Page not found` when a 404 page hydrates (observed: Nuxt 3.7.0, 3.21.0 and 4.0.0, with or without
  the module; not in 3.21.11 or 4.6.x).
- The server and the browser format dates with their own Intl data: a server Node whose ICU/CLDR
  differs from the visitor's browser can render a different date text and cause a hydration mismatch
  (observed: Node 22.20.0, CLDR 47, against Chromium, CLDR 48, for an `es` long date with a short
  time). It is not specific to the module.

## Routing

| `localePrefix` | Default locale | Other locale                                                  |
| -------------- | -------------- | ------------------------------------------------------------- |
| `as-needed`    | `/about`       | `/de/about`                                                   |
| `always`       | `/en/about`    | `/de/about`                                                   |
| `never`        | `/about`       | `/about`, locale from the cookie or `Accept-Language` instead |

A URL that names no locale reads it from `localeDetection.order` (the query, the `i18n_locale` cookie,
`Accept-Language`); the module records the locale in the cookie. `localeCookie` takes a name,
`{ name, maxAge, secure, sameSite, domain }` or `false`; `localeDetection` takes
`{ order, queryParam, headerName, resolveAcceptLanguage }` or `false`. `useLocalePath()`,
`useSwitchLocalePath()`, `useLocaleRoute()`, `useRouteConfig()` and `<NuxtLinkLocale>` build the
links; `useLocaleHead()` adds canonical, hreflang and `og:locale`. Set `comvi.head: false` to write
`<html lang dir>` yourself. `fallbackLocale`, `namespaces` and `formats` are `comvi` options too.

## Read next

- [Nuxt guide](https://comvi.io/docs/i18n/nuxt): rich text, SSR, locale routing.
- [Server-side rendering](https://comvi.io/docs/i18n/ssr#nuxt): the per-request instance and the handover.
- [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi): `cdn()` and `api()` from `@comvi/nuxt/i18n`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
