<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-dark.svg">
    <img alt="Comvi" src="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-light.svg" width="860">
  </picture>
</p>

<h1 align="center">Modern i18n for JavaScript & TypeScript</h1>

<p align="center">
  One framework-agnostic core. ICU MessageFormat and rich text without XSS —<br/>
  for <b>Vue</b>, <b>React</b>, <b>SolidJS</b>, <b>Svelte</b>, <b>Next.js</b>, and <b>Nuxt</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue&label=npm" alt="npm version"></a>
  <a href="https://bundlejs.com/?q=%40comvi%2Fcore"><img src="https://deno.bundlejs.com/?q=@comvi/core&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml"><img src="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://comvi.io"><img src="https://img.shields.io/badge/Platform-comvi.io-7c3aed" alt="Comvi Platform"></a>
</p>

<p align="center">
  <a href="https://x.com/Comvi_io"><img src="https://img.shields.io/twitter/follow/Comvi_io?style=social&logo=x" alt="Follow on X"></a>
  <a href="https://www.linkedin.com/company/comvi-io/"><img src="https://img.shields.io/badge/LinkedIn-Comvi-0A66C2?logo=linkedin&logoColor=white" alt="Comvi on LinkedIn"></a>
</p>

<p align="center">
  <b><a href="https://comvi.io/docs/i18n/quick-start/">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

## Why Comvi?

- **Rich text without XSS.** Embed components into translations (`Click <link>here</link>`) without raw HTML strings or unsafe DOM injection.
- **Same API across six frameworks.** `useI18n()` and the `<T>` component look the same in Vue, React, SolidJS, Svelte, Next.js, and Nuxt. All bindings ship together with the core — same version, same release cycle.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar for every language `Intl.PluralRules` supports. Numbers, dates, currency, and relative time are formatted via native `Intl` methods on the `i18n` instance.
- **~8 kB gzipped core, zero dependencies.** No `eval` or `new Function` in any runtime package — works under a strict CSP without `unsafe-eval`.
- **Pluggable loading & detection.** Translations come from inline objects, local JSON, or a CDN/API loader plugin. Locale detection (query, cookie, storage, `navigator`) is a separate plugin you opt into.
- **Server-side rendering for Next.js & Nuxt.** `@comvi/next` ships an App Router `loadTranslations()` for server components, locale-routed layouts under `[locale]`, and a `createMiddleware()` for redirect-on-detect. `@comvi/nuxt` is a Nuxt 3 module with locale composables, middleware, and `<NuxtLinkLocale>`.

## Install

Pick one — framework packages bundle `@comvi/core`, so a single install is enough:

```bash
npm install @comvi/core      # Vanilla / Node
npm install @comvi/vue       # Vue 3
npm install @comvi/react     # React 16.8+
npm install @comvi/solid     # SolidJS 1.8+
npm install @comvi/svelte    # Svelte 4 / 5
npm install @comvi/next      # Next.js 14+
npm install @comvi/nuxt      # Nuxt 3
```

## Quick start

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: {
      greeting: "Hello, {name}!",
      items: "{count, plural, one {# item} other {# items}}",
    },
    uk: {
      greeting: "Привіт, {name}!",
      items: "{count, plural, one {# елемент} few {# елементи} other {# елементів}}",
    },
  },
});

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items"
```

For framework-specific setup, see the docs:
[React](https://comvi.io/docs/i18n/react/) ·
[Vue](https://comvi.io/docs/i18n/vue/) ·
[Next.js](https://comvi.io/docs/i18n/next/) ·
[Nuxt](https://comvi.io/docs/i18n/nuxt/) ·
[SolidJS](https://comvi.io/docs/i18n/solid/) ·
[Svelte](https://comvi.io/docs/i18n/svelte/) ·
[Vanilla](https://comvi.io/docs/i18n/vanilla/)

Or jump straight into runnable code in [`test-apps/`](test-apps/) — one demo app per framework.

## Rich text without XSS

The hero feature. Embed components inside translation strings without raw HTML, without unsafe DOM injection, without splitting a sentence across multiple template fragments. Translators see clean markup; you control the rendering.

```json
{ "help": "Click <link>here</link> for support, or <bold>read the docs</bold>." }
```

**React**

```tsx
import { T } from "@comvi/react";

<T
  i18nKey="help"
  components={{
    link: <a href="/help" />,
    bold: <strong />,
  }}
/>;
```

**Vue**

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
</script>

<template>
  <T i18nKey="help">
    <template #link="{ children }"
      ><a href="/help">{{ children }}</a></template
    >
    <template #bold="{ children }"
      ><strong>{{ children }}</strong></template
    >
  </T>
</template>
```

SolidJS and Svelte expose the same tag-interpolation concept with framework-specific component map shapes. Pass `tagInterpolation: { strict: "warn" }` to `createI18n` to surface translations referencing tags you forgot to handle — before they ship.

## ICU plurals, ordinals & select

Comvi uses [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) — the industry-standard syntax for localized strings, recognized by every major translation management platform (Crowdin, Lokalise, Phrase, and more). Locale-correct for every language `Intl.PluralRules` supports — Polish, Ukrainian, Arabic, Welsh, and the rest:

```
{count, plural, one {You have # message} other {You have # messages}}
{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}
{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}
```

```ts
t("messages", { count: 1 }); // "You have 1 message"
t("messages", { count: 5 }); // "You have 5 messages"
t("rank", { place: 3 }); // "You finished 3rd"
t("greeting", { gender: "female" }); // "Welcome, madam"
```

## Locale-aware formatting

Numbers, dates, currency, and relative time — automatically follow the active locale via native `Intl`:

```ts
i18n.formatNumber(1234.5); // "1,234.5" · "1.234,5" · "1 234,5"
i18n.formatNumber(0.75, { style: "percent" }); // "75%"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "January 15, 2025" · "15. Januar 2025"
i18n.formatCurrency(99.99, "USD"); // "$99.99" · "99,99 $"
i18n.formatRelativeTime(-2, "hour"); // "2 hours ago" · "vor 2 Stunden"

i18n.dir; // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

Reactive in every framework binding via `useI18n()`.

## Packages

### Frameworks

| Package                            | Description                                              | Docs                                     |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| [`@comvi/core`](packages/core)     | Framework-agnostic runtime, ICU parser, plugin system    | [→](https://comvi.io/docs/i18n/vanilla/) |
| [`@comvi/vue`](packages/vue)       | Vue 3 plugin, `useI18n()`, `<T>` component               | [→](https://comvi.io/docs/i18n/vue/)     |
| [`@comvi/react`](packages/react)   | `<I18nProvider>`, `useI18n()` hook, `<T>` component      | [→](https://comvi.io/docs/i18n/react/)   |
| [`@comvi/solid`](packages/solid)   | SolidJS provider + reactive signals + `<T>` component    | [→](https://comvi.io/docs/i18n/solid/)   |
| [`@comvi/svelte`](packages/svelte) | Svelte stores + context (Svelte 4 & 5) + `<T>` component | [→](https://comvi.io/docs/i18n/svelte/)  |
| [`@comvi/next`](packages/next)     | Next.js App Router: SSR, middleware, locale routing      | [→](https://comvi.io/docs/i18n/next/)    |
| [`@comvi/nuxt`](packages/nuxt)     | Nuxt 3 module: auto-imports, SSR, locale routing         | [→](https://comvi.io/docs/i18n/nuxt/)    |

### Plugins

| Package                                                            | Description                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)       | Load translations from CDN or API                       |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector) | Auto-detect locale from query, cookie, storage, browser |

### Platform plugins

These plugins require the [Comvi Platform](https://comvi.io) — they don't work standalone.

| Package                                                                | Description                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Visual in-app translation editor (requires Comvi account) |

### Tooling

| Package                                      | Description                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| [`@comvi/vite-plugin`](packages/vite-plugin) | Generate types from local JSON files at dev/build time |
| [`@comvi/cli`](packages/cli)                 | Generate types from the Comvi TMS, sync translations   |

## Comvi Platform

Comvi i18n is the open-source library — fully usable on its own. [**Comvi**](https://comvi.io) is the optional translation management platform that pairs with it:

- **Collaborative dashboard** for translators, designers, and developers
- **CDN delivery** via [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader) — ship a translation without a redeploy
- **Auto-generated types** straight from the platform via [`@comvi/cli`](packages/cli)
- **In-context editing** in your live app via [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor)

Adopt the platform when you're ready — the library never depends on it.

## Repository

```
packages/        — published npm packages (12 total)
tooling/         — shared internal Vite/Vitest config
test-apps/       — runnable demo apps for every framework
```

[pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo. Every package builds independently and is published to npm under the `@comvi/*` scope.

## Development

```bash
pnpm install     # install workspace deps
pnpm build       # build all packages
pnpm -w run test # run all tests
pnpm lint        # lint all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [RELEASING.md](RELEASING.md) for the changeset-based release flow.

## License

[MIT](LICENSE) © Comvi
