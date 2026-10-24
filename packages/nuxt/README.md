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

`@comvi/nuxt` is the Comvi i18n module for Nuxt 3 and 4: it auto-imports the composables and
`<T>`, clones your pages into locale-prefixed routes, builds one i18n instance per request on the
server and hydrates the client from what the server loaded. Use it instead of `@comvi/vue` on
Nuxt; it brings `@comvi/core` and the Vue bindings with it.

## Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0 || ^4.0.0
```

## Setup

Add the module and declare the locales, in `nuxt.config.ts`:

```ts title="nuxt.config.ts" check=group=nuxt-app
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    defaultLocale: "en",
    locales: ["en", "uk"],
    messages: {
      en: { greeting: "Hello, {name}!" },
      uk: { greeting: "Привіт, {name}!" },
    },
  },
});
```

Nuxt renders the pages through an outlet, in `app/app.vue`:

```vue title="app/app.vue" check=group=nuxt-app
<template>
  <NuxtPage />
</template>
```

`comvi.messages` is the inline catalog, nested or flat, and must stay JSON-serializable. The
module writes `<html lang dir>` from the active locale on the server and on every switch.

## Use in components

In a page, `app/pages/index.vue`:

```vue title="app/pages/index.vue" check=group=nuxt-app
<script setup lang="ts">
const { t, locale } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <NuxtLinkLocale to="/" :locale="locale === 'en' ? 'uk' : 'en'">Switch</NuxtLinkLocale>
</template>
```

`useI18n()` is auto-imported. It returns the `@comvi/vue` composable plus `locales` and
`defaultLocale` from runtime config. `setLocale()` loads the new catalog and advances the locale
state the route middleware watches. `$t()` works in any template without calling `useI18n()`.
`formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` are auto-imported too, and
a plain module imports them from `@comvi/nuxt/i18n`. They take the core instance first:
`formatRelativeTime(useNuxtApp().$i18n.core, -2, 'hour')`.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader in `comvi.i18n.ts`:

```ts title="comvi.i18n.ts" check=group=nuxt-cdn
import { createI18n, defineComviI18n } from "@comvi/nuxt/i18n";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

export default defineComviI18n((options) =>
  createI18n(options).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" })),
);
```

Add this file next to `nuxt.config.ts`. The module picks up `./comvi.i18n.*` by convention and
logs the path; `comvi.i18nModule` points at a file elsewhere. The default export receives the
resolved `comvi` options and must return a new instance from `createI18n` on every call; in
development the module throws when it gets the same instance twice. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), set `comvi.icu: true` or pass `compiler: icuCompiler` in the factory, as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

### How it works

On every request the module builds a fresh i18n instance in the default locale, runs `comvi.setup.ts` for it when the file exists, initializes it, and then the route middleware detects the locale from the URL path, the cookie and the `Accept-Language` header and switches to it before the page renders. The loaded catalog is serialized into the Nuxt payload, so the client hydrates
with no second fetch and no flash. Without a `comvi.i18n.ts` file the module builds the base
instance, with no loader, and with the ICU compiler only when `comvi.icu` is `true`; every
installer that file needs (`createI18n`,
`loader`, `icuCompiler`, `plugins`, `devtools`) comes from `@comvi/nuxt/i18n`. In a Nitro route
the server auto-imports are `useTranslation(event)`, `loadMessages(event, locale)`,
`getRequestI18n(event, locale)` and `getServerRuntimeConfig(event)`; the app-side composables do
not exist there. `<T>` is auto-imported: each tag a translator wrote becomes a named slot, or an
entry in the `components` prop. Never render a translation with `v-html`.

## Routing

| `localePrefix` | Default locale | Other locale                                                  |
| -------------- | -------------- | ------------------------------------------------------------- |
| `as-needed`    | `/about`       | `/de/about`                                                   |
| `always`       | `/en/about`    | `/de/about`                                                   |
| `never`        | `/about`       | `/about`, locale from the cookie or `Accept-Language` instead |

The route middleware detects the locale, persists it in the `i18n_locale` cookie and loads that
locale's catalog before the page renders. Pair a switcher with `useSwitchLocalePath()` when the
URL should change too. `localeCookie` takes a name, `{ name, maxAge, secure, sameSite, domain }`,
or `false` to persist nothing; `localeDetection` takes
`{ order, queryParam, headerName, resolveAcceptLanguage }`, or `false` to leave the URL path alone
in charge. `comvi.ns` lists the namespaces to load besides `defaultNs`. `useLocaleHead()` adds canonical, hreflang and `og:locale` tags, and writes `lang` and `dir` too unless `addLang` or `addDir` is `false`; set `comvi.head: false` when you write those attributes yourself.

## Read next

- [Nuxt guide](https://comvi.io/docs/i18n/nuxt): rich text, SSR, locale routing.
- [Nuxt API reference](https://comvi.io/docs/i18n/api/nuxt): every module option, the `i18nModule` factory and setup types, the composables.
- [Server-side rendering](https://comvi.io/docs/i18n/ssr#nuxt): `comvi.setup.ts`, per-request instances and hydration.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` autocompletes in templates.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
