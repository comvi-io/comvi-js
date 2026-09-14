<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/core</h1>

<p align="center">Framework-agnostic i18n runtime for JavaScript and TypeScript.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/core` is the runtime every Comvi i18n binding is built on. If you use
[`@comvi/vue`](../vue), [`@comvi/react`](../react), [`@comvi/solid`](../solid),
[`@comvi/svelte`](../svelte), [`@comvi/next`](../next) or [`@comvi/nuxt`](../nuxt), you already have
it — install this package directly for vanilla JS, Node, a worker, or a custom integration.

Throughout this README, **the host** is the i18n instance `createI18n` returns.

Zero runtime dependencies, and no `eval` or `new Function` anywhere, so it runs under a strict CSP
without `unsafe-eval`.

📖 [Documentation](https://comvi.io/docs/i18n/vanilla/) ·
⚖️ [Comvi vs i18next](https://comvi.io/compare/i18next/)

## 1. Install

```bash
npm install @comvi/core
# Node 20 or newer. No peer dependencies.
```

## 2. Quick start — an inline catalog

The smallest working script. Five things to know: `createI18n` builds the host, `locale` is what
renders now, `fallbackLocale` covers a missing key, `translation` is the catalog, and `init()`
readies the host before the first `t()`.

Runnable version: [`examples/vanilla`](../../examples/vanilla).

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"

i18n.locale = "uk";
i18n.t("greeting", { name: "Аліса" }); // "Привіт, Аліса!"
```

A parameter you leave out renders as its own placeholder — `t("greeting")` gives
`"Hello, {name}!"` — plus one development warning per template and parameter. Pass
`missingParam: "drop"` to render an empty string instead.

## 3. Connect to Comvi

Two additions to the host, and nothing else changes:

1. **`compiler: icuCompiler`** from `@comvi/core/icu`. The platform's catalogs use ICU plurals.
   Without the compiler an ICU message throws in development and renders literally in production, so
   name it once here and it covers every catalog the host ever ingests.
2. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which fetches the
   catalog at runtime instead of bundling it.

`await init()` is where the first fetch happens, so there is no first-paint gate to write here — a
vanilla script simply awaits it.

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items" — from "{count, plural, one {# item} other {# items}}"
```

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page. Compose before `init()`: composing after it warns once per host in
development.

## 4. Core API reference

### Catalogs: nested or flat, on every host

`addTranslations` — and `translation` in the constructor — takes catalogs keyed by locale or by
`"locale:namespace"`. The values may be **flat** (dot-notation keys, string values) or **nested**,
and the two are the same catalog:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.addTranslations({
  en: { "nav.home": "Home" },
  "en:admin": { nav: { home: "Admin home" } }, // -> "nav.home"
});
```

Flattening happens in the base host, unconditionally, at the one place a catalog enters, so
`createI18n({ translation: { en: { nav: { home: "Home" } } } })` resolves `t("nav.home")` with
nothing composed. A loader result, an `addTranslations` call and the constructor all go through it,
and an object mixing both shapes works too. The cache stores a prototype-less catalog, so a catalog
key can never resolve to an `Object.prototype` member.

Two leaf shapes are not strings, and both behave the same way everywhere: a non-string leaf (number,
boolean, array) is **coerced with `String()`**, and a `null` or `undefined` leaf is **dropped**, so
the key is simply missing. Each reports one development warning naming the key; production is
silent.

`flattenCatalog`, exported from the `@comvi/core` root, is the same function for pre-flattening data
by hand — inspecting the keys a nested object will produce, or merging several sources before
handing one object over. It is not an escape hatch, and it is not on `@comvi/core/loader`:

```ts
import { createI18n, flattenCatalog } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

flattenCatalog({ nav: { home: "Home" } }); // { "nav.home": "Home" }
i18n.addTranslations({ en: { nav: { home: "Home" } } }); // the same result, no call needed
```

### `t()` and `tRaw()`

`t()` always returns a string: non-primitive parameter values are coerced. `tRaw()` preserves them
as a parts array, which is what the rich-text components are built on.

```ts
import { createI18n } from "@comvi/core";
import type { VirtualNode } from "@comvi/core";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi, {who}!" } } });

const someVNode: VirtualNode = { type: "text", text: "Alice" };

i18n.t("hi", { who: someVNode }); // string — coerced
i18n.tRaw("hi", { who: someVNode }); // ["Hi, ", someVNode, "!"]
```

### `Intl` formatters

Free functions that take the host as their first argument, so a graph that never formats never pays
for it:

```ts
import {
  createI18n,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";

const i18n = createI18n({ locale: "de" });

formatNumber(i18n, 1234.5); // "1.234,5"
formatCurrency(i18n, 99.99, "USD"); // "99,99 $"
formatDate(i18n, new Date(), { dateStyle: "long" }); // "15. Januar 2025"
formatRelativeTime(i18n, -2, "hour"); // "vor 2 Stunden"

getTextDirection(i18n.locale); // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

Every framework binding hands the same four back off `useI18n()`, already bound to the render
locale, together with `dir`. How reactive they are differs per binding:
[docs/design/formatting.md](../../docs/design/formatting.md).

### The capability subpaths

`@comvi/core` is the base host: text and `{param}` interpolation, the translation cache, events,
default params and the `.use(installer)` pipe. Everything else is a subpath you import.

| you want                              | you import                                             | you write                   |
| ------------------------------------- | ------------------------------------------------------ | --------------------------- |
| ICU `plural`/`select`/`selectordinal` | `icuCompiler` from `@comvi/core/icu`                   | `compiler: icuCompiler`     |
| async / remote loading                | `loader` or `attachLoader` from `@comvi/core/loader`   | `.use(loader(map))`         |
| the plugin host, post-processors      | `plugins` or `definePlugin` from `@comvi/core/plugins` | `.use(plugins())`           |
| browser-extension discovery           | `devtools` from `@comvi/core/devtools`                 | `.use(devtools())`          |
| `<tag>` markup inside `t()`           | `@comvi/core/tags`                                     | `import "@comvi/core/tags"` |
| the pure rich-text toolbox            | `@comvi/core/rich-text`                                | `prepareTranslation(…)`     |

A capability you never import never enters your module graph, and there is no runtime flag that
turns one off. Calling a capability member on a host that never composed it is a **compile error**,
so you never discover one in production.

The full member list per subpath, the three placements that are not where you might guess, and the
`init()`-time warnings for an option whose capability never arrived are in
[docs/design/composition.md](../../docs/design/composition.md).

### Reference: composing by hand

`loader(map)` attaches the loader capability **and** registers the map, so it needs its map; a bare
`loader()` is a compile error. For a plain loader function, compose `attachLoader` and register it
yourself, which also keeps the import-map adapter out of your bundle:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

First-party plugin packages ship a lowercase **installer** beside an uppercase factory. The
installer composes whatever capabilities that plugin needs and registers it, in one call; the
factory goes to `registerPlugin` on a host you composed yourself:

```ts
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" })
  .use(
    localeDetector({
      order: ["querystring", "cookie", "localStorage", "navigator"],
      lookupCookie: "i18n_locale",
    }),
  )
  .use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

await i18n.init();
```

Your own inline plugin goes in through `definePlugin(fn)` from `@comvi/core/plugins`, which composes
the plugin host and registers `fn` in one call. Plugins run sequentially during `init()`, with a 10s
default timeout and error recovery for non-required ones. A plugin may return nothing or a cleanup
function, called on `destroy()` in LIFO order; any other return value throws at `init()`.

Swapping an installer and a plugin is a type error, and loud at runtime both ways —
`E_INSTALLER_AS_PLUGIN` and `E_USE_NOT_INSTALLER`. Why, and what `.use` actually checks, is in
[docs/design/composition.md](../../docs/design/composition.md#installer-or-plugin-swapping-the-slots-is-loud-both-ways).

### The CDN global build

`unpkg` and `jsdelivr` serve a fully composed bundle from its own entry, because a `<script src>`
consumer has no import graph to extend. It keeps ICU, ambient tags, the loader, the plugin host and
discovery. ESM starts from the base host; the global starts composed.

## 5. Server-side rendering

`@comvi/core` has no framework opinion, so the module-scope question is the host framework's. The
one rule core imposes: `import "@comvi/core/tags"` registers the tag grammar **per bundle**, and an
SSR app has two, so import it in the server graph too or the same string renders literally on the
server and with markup on the client.

The four bindings' module-scope rules side by side, including the one that inverts:
[docs/design/ssr.md](../../docs/design/ssr.md). The cross-framework SSR guide on the site is at
[comvi.io/docs/i18n/guides/ssr/](https://comvi.io/docs/i18n/guides/ssr/).

## 6. Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key. One
augmentation serves every binding, generated by [`@comvi/cli`](../cli) from the platform or
[`@comvi/vite-plugin`](../vite-plugin) from local JSON. The declaration, the examples and what
TypeScript catches are in the
[root README](https://github.com/comvi-io/comvi-js#typed-translation-keys).

## 7. What it weighs

Measured min+gz through the published exports map, and gated in
[`scripts/size-budgets.json`](../../scripts/size-budgets.json) at the recorded baseline + 5 %.

| graph                                          | fixture                        | min+gz |
| ---------------------------------------------- | ------------------------------ | ------ |
| `@comvi/core` alone, nothing composed          | `core-base`                    | 5270 B |
| base host + ICU                                | `core-base-icu`                | 6183 B |
| all six subpaths composed (0.4 root semantics) | `core-full-composite`          | 8874 B |
| base host + ICU + the CDN-only loader subpath  | `plugin-fetch-loader-cdn-lite` | 9173 B |

`@comvi/core/devtools` shows up in a graph only when you compose it.

## 8. Where to go next

- **A framework:** [react](../react) · [vue](../vue) · [solid](../solid) · [svelte](../svelte) ·
  [next](../next) · [nuxt](../nuxt)
- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader)
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** the 0.4 root shipped every capability by default, so this is a breaking
  change on a 0.x minor. See
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) for the per-feature
  table and the codemod.
- **Full API**, including namespaces, fallback chains, missing-key handling, lifecycle events and
  writing your own plugins: [comvi.io/docs/i18n/vanilla/](https://comvi.io/docs/i18n/vanilla/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
