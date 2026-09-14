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
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
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
- **Same API across six frameworks.** `useI18n()` and the `<T>` component look the same in Vue, React, SolidJS, Svelte, Next.js, and Nuxt. All bindings ship together with the core, on one version and one release cycle.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar for every language `Intl.PluralRules` supports, reached through one explicit import: `compiler: icuCompiler` from `@comvi/core/icu`. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong. Numbers, dates, currency, and relative time are formatted via native `Intl` by `formatNumber(i18n, …)` and friends, which are free functions on core, already bound to the render locale in every framework binding.
- **~5 kB base host, ~8.5 kB fully composed (min+gz, as bundled by your app), zero dependencies.** On the platform CDN path (`cdnLoader` plus ICU) a whole app graph is ≈ 8.9 kB with `@comvi/core` and ≈ 10.5 kB with `@comvi/react`; `fetchLoader`, which carries the authenticated API path as well, is ≈ 10.8 kB on core. Every capability is an import you add, so an app carries only what it composes. No `eval` or `new Function` in any runtime package, so it works under a strict CSP without `unsafe-eval`.
- **Pluggable loading & detection.** Translations come from inline objects, local JSON, or a CDN/API loader plugin: one `.use(cdnLoader({ … }))`, or `.use(fetchLoader({ … }))` when the app also reads the authenticated API. Locale detection (query, cookie, storage, `navigator`) is a separate plugin you opt into.
- **Server-side rendering for Next.js & Nuxt.** `@comvi/next` ships an App Router `loadTranslations()` for server components, locale-routed layouts under `[locale]`, and a `createMiddleware()` for redirect-on-detect. `@comvi/nuxt` is a Nuxt 3 / 4 module with locale composables, middleware, and `<NuxtLinkLocale>`.

## Install

Pick one. Framework packages bundle `@comvi/core`, so a single install is enough:

```bash
npm install @comvi/core      # Vanilla / Node
npm install @comvi/vue       # Vue 3
npm install @comvi/react     # React 16.8+
npm install @comvi/solid     # SolidJS 1.8+
npm install @comvi/svelte    # Svelte 5
npm install @comvi/next      # Next.js 14+
npm install @comvi/nuxt      # Nuxt 3 / 4
```

Loading translations from the Comvi platform CDN adds the loader plugin beside
the framework package:

```bash
npm install @comvi/react @comvi/plugin-fetch-loader # platform CDN path
```

## Quick start

Translations from the Comvi platform CDN, which is the recipe most apps want:

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items"
```

Drop `compiler: icuCompiler` if you use no plural/select; plain `{param}`
interpolation needs no import. The option is the one way to enable ICU, and it
works whatever the catalogs come from: inline, a loader, the CDN, the API.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project
and read it off the **Distributions** page.

Or ship the catalogs inline instead:

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler, // ICU is an explicit import — see "One entry per package"
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

Without `compiler: icuCompiler` the default compiler never renders
`{count, plural, …}` as a plural: development throws `E_ICU_SYNTAX` at
ingestion, and production renders the braced segment literally and reports
`E_ICU_SYNTAX` through `onError` (or `console.error`) on the compilation that
hit it. That report is best-effort, per process, and never fires on cached
renders. Plain `{param}` interpolation needs no import.

For framework-specific setup, see the docs:
[React](https://comvi.io/docs/i18n/react/) ·
[Vue](https://comvi.io/docs/i18n/vue/) ·
[Next.js](https://comvi.io/docs/i18n/next/) ·
[Nuxt](https://comvi.io/docs/i18n/nuxt/) ·
[SolidJS](https://comvi.io/docs/i18n/solid/) ·
[Svelte](https://comvi.io/docs/i18n/svelte/) ·
[Vanilla](https://comvi.io/docs/i18n/vanilla/)

Wondering how Comvi stacks up? Comparisons: [vs i18next](https://comvi.io/compare/i18next/) · [vs next-intl](https://comvi.io/compare/next-intl/) · [vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/) · [vs Lokalise](https://comvi.io/compare/lokalise/)

Or jump straight into runnable code in [`test-apps/`](test-apps/), one demo app per framework.

## One entry per package

Every package publishes ONE host entry. A capability is an import you add to
that entry, not a second entry you switch to. A bundle carries a capability
because you asked for it, composed with `.use(…)` or, for ICU, named as the
`compiler` option, and for no other reason.

`.use(installer)` is the one composition verb; a later `.use()` warns in
development and does nothing, so compose before `init()`. Beyond that the
library has no ordering rule: ICU is a constructor option, not a composition
step.

| package         | the entry you import                       | host constructor                             | notes                                                                                                                                                                      |
| --------------- | ------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@comvi/core`   | `@comvi/core`                              | `createI18n`                                 | the base host, plus the pure capability subpaths below                                                                                                                     |
| `@comvi/react`  | `@comvi/react`                             | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/solid`  | `@comvi/solid`                             | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/svelte` | `@comvi/svelte`                            | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/vue`    | `@comvi/vue`                               | `createI18n`                                 | builds the `VueI18n` preset over a base host, and `.use(…)` composes on the result; `createI18nFromCore` wraps a host built elsewhere with `createI18n` from `@comvi/core` |
| `@comvi/next`   | `@comvi/next/client`, `@comvi/next/server` | `createI18n`                                 | a RUNTIME split, not a host tier; `createNextI18n` on `@comvi/next` stays the composed 0.4 host                                                                            |
| `@comvi/nuxt`   | auto-imported                              | the module's generated host, or `hostModule` | the default generated host is the base host; `hostModule` is the composition escape                                                                                        |

Capabilities are core's pure subpaths, re-exported **by name** from every
framework entry except `@comvi/nuxt`, so the ones you never call are pruned by
your bundler. The repo's bundler matrix asserts that from the emitted module
graph in webpack and vite, development and production. (`@comvi/nuxt` is the
exception: app code imports nothing, so the toolkit is not on the module's own
entry. Composition happens in one file, `comvi.host.ts`, and the values come
from `@comvi/nuxt/host` — so the recipe follows from `npm install @comvi/nuxt`
and nothing else; a `TranslationKeys` augmentation targets `@comvi/core`, which
the app declares.)

| you want                                                              | you add                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ICU `plural` / `select` / `selectordinal`                             | `compiler: icuCompiler` in the constructor options                              |
| async / remote loading                                                | `.use(loader(importMap))` or `.use(attachLoader)`                               |
| the plugin host: `registerPlugin`, post-processors, missing-key hooks | `.use(plugins())`                                                               |
| your own inline plugin, in one call                                   | `.use(definePlugin(fn))`                                                        |
| browser-extension discovery (`instanceId`, `window.__COMVI__`)        | `.use(devtools())`                                                              |
| `<tag>` markup inside plain string-API `t()`                          | `import "@comvi/core/tags"` once, anywhere in the app                           |
| a nested inline catalog (`{ nav: { home } }`)                         | nothing; every host flattens it, so `t("nav.home")` resolves                    |
| rich text through `<T>`                                               | nothing; `<T>` uses the pure `@comvi/core/rich-text` path and registers nothing |

Two hosts are the exception to "a capability because you composed it":
`createNextI18n` on `@comvi/next` (the composed 0.4 host, kept
behaviour-compatible) and the CDN global build always carry ICU, whether or not
the app asks. Neither is the base host, and neither is what
`createI18n` returns on any entry.

First-party plugins ship a lowercase **installer** beside the uppercase factory,
and the installer composes whatever capabilities that plugin needs:
`.use(cdnLoader({ cdnUrl }))`, `.use(localeDetector())`,
`.use(inContextEditor())`.

## Rich text without XSS

Embed components inside translation strings without raw HTML, without unsafe DOM injection, and without splitting a sentence across multiple template fragments. Translators see clean markup, and you control the rendering.

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

SolidJS and Svelte expose the same tag-interpolation concept with framework-specific component map shapes. Pass `tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you forgot to handle, before they ship.

`<T>` is self-contained: it renders through the pure `@comvi/core/rich-text` path, which takes the tag grammar per call and registers nothing. Rendering it never changes what a plain `t()` does with `<b>` markup. Making `t("Click <b>here</b>")` itself parse tags is a separate, ambient opt-in: `import "@comvi/core/tags"` once.

That import registers the tag grammar **process-wide and retroactively**: it is a property of the bundle, not of one host, so every instance in the graph, including ones built before the import was evaluated, starts parsing `<tag>` markup the moment the module runs. There is no per-instance opt-out. An SSR app must therefore import it in the **server** graph too, or the same string renders literally on the server and with markup on the client.

## ICU plurals, ordinals & select

Comvi uses [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/), the industry-standard syntax for localized strings, recognized by every major translation management platform (Crowdin, Lokalise, Phrase, and more). It is locale-correct for every language `Intl.PluralRules` supports, including Polish, Ukrainian, Arabic and Welsh:

```
{count, plural, one {You have # message} other {You have # messages}}
{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}
{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}
```

Those three argument types are the whole of what the compiler implements. The
`number`, `date` and `time` argument types are not supported and are not on the
roadmap, and neither is the plural `offset:` form. Each one fails with
`E_ICU_SYNTAX` instead of rendering something wrong: format the value in code
and pass it as a plain `{param}`, or quote the braces (`'{'…'}'`) to keep the text
literal; for the plural `offset:` form, drop `offset:` and write the branches
out.

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  compiler: icuCompiler,
  translation: {
    en: {
      messages: "{count, plural, one {You have # message} other {You have # messages}}",
      rank: "You finished {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
      salutation: "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}",
    },
  },
});

i18n.t("messages", { count: 1 }); // "You have 1 message"
i18n.t("messages", { count: 5 }); // "You have 5 messages"
i18n.t("rank", { place: 3 }); // "You finished 3rd"
i18n.t("salutation", { gender: "female" }); // "Welcome, madam"
```

ICU is an opt-in compiler rather than a default. Name it once in the constructor
options, with `compiler: icuCompiler`, and the whole grammar above is live for
every catalog source: inline, a loader, the CDN, the API. Leave it out and the
failure is loud in every build condition, never silent and never a plausible
wrong answer: development throws `E_ICU_SYNTAX` at
ingestion, and production renders the braced segment literally and reports
`E_ICU_SYNTAX` through `onError` (or `console.error`) on the compilation that
hit it. That report is best-effort, per process, and never fires on cached
renders.

## Locale-aware formatting

Numbers, dates, currency, and relative time automatically follow the active locale via native `Intl`:

On a core host they are free functions that take the host as their first
argument. Nothing is bolted onto the instance:

```ts
import {
  createI18n,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";

const i18n = createI18n({ locale: "en" });

formatNumber(i18n, 1234.5); // "1,234.5" · "1.234,5" · "1 234,5"
formatNumber(i18n, 0.75, { style: "percent" }); // "75%"
formatDate(i18n, new Date(), { dateStyle: "long" }); // "January 15, 2025" · "15. Januar 2025"
formatCurrency(i18n, 99.99, "USD"); // "$99.99" · "99,99 $"
formatRelativeTime(i18n, -2, "hour"); // "2 hours ago" · "vor 2 Stunden"

getTextDirection(i18n.locale); // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

Every framework binding hands the same four back off `useI18n()`, together with
`dir`. How _reactive_ they are differs between the bindings; core behaves the
same under all of them:

| binding | formatters re-render on a locale change                                                                                                                 | `dir`                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| React   | **yes**, bound to the tracked locale and passed explicitly (`react/src/useI18n.ts:273-277`, `useFormatters.ts:31-34`)                                   | reactive                     |
| Vue     | **yes**, they default to the reactive `locale` ref (`vue/src/VueI18n.ts:186-193`)                                                                       | reactive (`ComputedRef`)     |
| Svelte  | **no**. They are "plain functions, not stores" (`svelte/src/useI18n.ts:198`) and read `i18n.locale` once per call unless you pass a locale (`:287-292`) | reactive (a `derived` store) |
| Solid   | **no**. They call core with the host and read no signal (`solid/src/useI18n.ts:249-252`), while `dir` does (`:253`)                                     | reactive                     |

In Svelte and Solid, put the formatter call where the locale is already tracked
(a `$:`/`$derived`, a `createMemo`, or the template) or pass the locale
yourself.

## Packages

### Frameworks

| Package                            | Description                                           | Docs                                     |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| [`@comvi/core`](packages/core)     | Framework-agnostic runtime, ICU parser, plugin system | [→](https://comvi.io/docs/i18n/vanilla/) |
| [`@comvi/vue`](packages/vue)       | Vue 3 plugin, `useI18n()`, `<T>` component            | [→](https://comvi.io/docs/i18n/vue/)     |
| [`@comvi/react`](packages/react)   | `<I18nProvider>`, `useI18n()` hook, `<T>` component   | [→](https://comvi.io/docs/i18n/react/)   |
| [`@comvi/solid`](packages/solid)   | SolidJS provider + reactive signals + `<T>` component | [→](https://comvi.io/docs/i18n/solid/)   |
| [`@comvi/svelte`](packages/svelte) | Svelte stores + context (Svelte 5) + `<T>` component  | [→](https://comvi.io/docs/i18n/svelte/)  |
| [`@comvi/next`](packages/next)     | Next.js App Router: SSR, middleware, locale routing   | [→](https://comvi.io/docs/i18n/next/)    |
| [`@comvi/nuxt`](packages/nuxt)     | Nuxt 3 / 4 module: auto-imports, SSR, locale routing  | [→](https://comvi.io/docs/i18n/nuxt/)    |

**Upgrading from 0.4.x?** Every package now has exactly ONE entry, and
`@comvi/core` is the base host: ICU, async loading, the plugin host and
extension discovery are imports you add, not an entry you switch. That is a
breaking change on a 0.x minor. ICU syntax on the default compiler throws
instead of rendering wrong text, and four loader/plugin members moved out of
`useI18n()`. The migration is mechanical and mostly codemodded; see
**[MIGRATION.md](MIGRATION.md)**.

### Plugins

| Package                                                            | Description                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)       | Load translations from CDN or API                       |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector) | Auto-detect locale from query, cookie, storage, browser |

### Platform plugins

These plugins require the [Comvi Platform](https://comvi.io) and don't work standalone.

| Package                                                                | Description                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Visual in-app translation editor (requires Comvi account) |

### Tooling

| Package                                      | Description                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| [`@comvi/vite-plugin`](packages/vite-plugin) | Generate types from local JSON files at dev/build time |
| [`@comvi/cli`](packages/cli)                 | Generate types from the Comvi TMS, sync translations   |

### Internal (not published)

Two workspace packages exist so shared code has one copy in the repo. They are
`"private": true`, publish no npm package, and are inlined into the packages
above at build time — nothing you install ever names them.

| Package                                     | Inlined into                                                        |
| ------------------------------------------- | ------------------------------------------------------------------- |
| [`locale-routing`](packages/locale-routing) | `@comvi/next` (bundled); `@comvi/nuxt` (vendored into its runtime)  |
| [`typegen`](packages/typegen)               | `@comvi/cli`, `@comvi/vite-plugin` (bundled, declarations included) |

## Comvi Platform

Comvi i18n is the open-source library, and it is usable on its own. [**Comvi**](https://comvi.io) is the optional translation management platform that pairs with it:

- **Collaborative dashboard** for translators, designers, and developers
- **CDN delivery** via [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader), so you can ship a translation without a redeploy
- **Auto-generated types** straight from the platform via [`@comvi/cli`](packages/cli)
- **In-context editing** in your live app via [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor)

Adopt the platform when you're ready. The library never depends on it.

## Repository

```
packages/        — 14 workspace packages: 12 published to npm, plus
                   locale-routing and typegen (private, inlined into consumers)
tooling/         — shared internal Vite/Vitest config
test-apps/       — runnable demo apps for every framework
```

[pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo. Every package builds independently; the 12 publishable ones ship to npm under the `@comvi/*` scope as one release train.

## Development

```bash
pnpm install     # install workspace deps
pnpm build       # build all packages
pnpm -w run test # run all tests
pnpm lint        # lint all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © Comvi
