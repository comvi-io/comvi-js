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

`@comvi/core` is the framework-independent runtime that powers every Comvi i18n binding. If you already use [`@comvi/vue`](../vue), [`@comvi/react`](../react), [`@comvi/solid`](../solid), [`@comvi/svelte`](../svelte), [`@comvi/next`](../next), or [`@comvi/nuxt`](../nuxt), you have it transitively — install this package directly only when you're building a custom integration or running Comvi i18n in vanilla Node/browser code.

Ships an ICU MessageFormat parser, a plugin system, and locale-aware `Intl` formatters out of the box.

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB minified + gzipped (as bundled by your app)** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/core?

- **Zero runtime dependencies, ~8 kB minified + gzipped (as bundled by your app)** — drops into any JS environment without a tree of transitive packages.
- **No `eval` or `new Function`** — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Plugin system, not a kitchen sink** — translation loading, locale detection, and editing are opt-in plugins. You only ship what you use.

📖 **Documentation:** https://comvi.io/docs/i18n/vanilla/

⚖️ **Comparison:** [Comvi vs i18next](https://comvi.io/compare/i18next/)

## Install

```bash
npm install @comvi/core
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

## Slim / pay-for-what-you-use

`@comvi/core` is the batteries-included entry: ICU, tag syntax, async loading and the
plugin host are all there the moment you import it. When bundle size is the binding
constraint, `@comvi/core/slim` gives you the translation core alone and you compose the
rest back on from pure subpaths — nothing is behind a runtime flag, capabilities are
absent because their modules never enter your module graph.

### Framework bindings run on `/slim` too

Every binding accepts a slim host. `@comvi/{react,solid,svelte,vue,next,nuxt}`
demand `WrapperI18nHost` — `I18nCoreInstance & I18nCoreExtraApi`, which is
exactly what a bare `@comvi/core/slim` instance implements — so the same
component code runs on a bare slim host, on a composed one, or on the root
entry. Loader and plugin members are no longer part of `useI18n()`; they are
acquired explicitly through `useI18nLoader()` / `useI18nPlugins()`, which throw
a named error (in development **and** production) on a host that lacks the
capability rather than being typed present and failing at an arbitrary call
site later.

Whole-app **comvi graph**, min+gz, framework peer dependency externalized —
every number below is produced by `node scripts/size-check.mjs` from the
fixtures CI gates, never estimated:

| binding                | root host | bare `/slim` host | saving           | slim recipe                                                                                      |
| ---------------------- | --------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `@comvi/react`         | 10229     | **7265**          | −2964 B (−29.0%) | `createI18n` from `@comvi/core/slim` → `<I18nProvider i18n={…}>`                                 |
| `@comvi/solid`         | 9953      | **6978**          | −2975 B (−29.9%) | same host → `<I18nProvider i18n={…}>`                                                            |
| `@comvi/svelte`        | 10012     | **7045**          | −2967 B (−29.6%) | same host → `setI18nContext(i18n)`                                                               |
| `@comvi/vue`           | 10535     | **7599**          | −2936 B (−27.9%) | `createI18nFromCore(host)` from **`@comvi/vue/slim`**                                            |
| `@comvi/next` (server) | 10127     | **7628**          | −2499 B (−24.7%) | `createNextI18nFromHost(() => host)` from **`@comvi/next/server`**; host = slim + `attachLoader` |
| `@comvi/nuxt` (server) | 12317     | **10120**         | −2197 B (−17.8%) | `hostModule: "./comvi.host.ts"`; host = slim + `attachLoader`                                    |

Rendering `<T>` buys the tag machinery on top of the slim rows, and only then:
react **+1891 B**, solid **+1807 B**, svelte **+2210 B**, vue **+1865 B**.
Client-only graphs: `@comvi/next` client on a hydrated bare-slim host is
**7668 B**, `@comvi/nuxt` client **8734 B**.

Three bindings need one line of explanation each:

- **vue — import from `@comvi/vue/slim`.** The main entry tree-shakes the root
  graph out of a `createI18nFromCore`-only app under esbuild, vite (development
  and production) and webpack production. It does **not** under webpack
  _development_: `@comvi/vue`'s index carries `export * from "@comvi/core"`, and
  webpack cannot prune a star re-export with `usedExports` off, so the root
  entry — and with it core's ambient `registerTagSyntax()` — survives and
  `t("a <b>x</b>")` renders differently in dev than in prod. `@comvi/vue/slim`
  ships the same classes, composables, `<T>` and injection key without
  `createI18n` and without the core re-export; it is the entry the vue row
  above measures.
- **next — the server always needs a loader.** `createNextI18nFromHost` is
  exported from `@comvi/next/server` and nowhere else, and its host type is
  `NextServerHost = WrapperI18nHost & I18nLoaderApi`. `createNextI18n` keeps its
  exact signature for root apps. The client rides react's host, hydrated from
  the catalog the server serialized.
- **nuxt — the host is a module path, branched at build time.** `hostModule`
  points at a module whose default export is `() => WrapperI18nHost`; the
  generated `#build/comvi.host` template imports the root entry only when the
  option is unset. A server-rendered app's host needs `attachLoader`.

No member of any binding is typed present and then throws "missing capability".
`VueI18n` dropped all eight of its capability proxies, `use` included — plugin
registration is `i18n.core.use(…)`, next to where the host is composed.

Full migration tables, the codemod and the unsupported-shape list:
[MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

```ts
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

// Compose outside-in. Each attach returns the SAME instance, re-typed.
const i18n = attachPlugins(
  attachLoader(
    createI18n({
      locale: "en",
      fallbackLocale: "en",
      translation: { en: { greeting: "Hello, {name}!" } },
    }),
  ),
);

i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
i18n.use(SomePlugin());

await i18n.init();
i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

Both attach functions are idempotent, and they install their methods as **non-enumerable
own properties** with ordinary method descriptors — `Object.keys(i18n)`, spread copies and
`JSON.stringify` see exactly what they saw before.

> **Order matters: `attachLoader` before `attachPlugins`.** Plugins run during `init()`,
> and a loader-registering plugin (for example [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader))
> calls `registerLoader` on the instance. If the loader capability was never attached,
> that call is a `TypeError` at `init()` time, not a compile error. The root
> `@comvi/core` entry ships both capabilities on the class — there is nothing to attach
> and no ordering concern there.

### What bare slim does not have

Everything below exists on a root `@comvi/core` instance. On slim it is a **compile
error** until you attach the subpath — a missing capability is caught by TypeScript, never
discovered in production.

| Capability            | Subpath                                 | Members                                                                                                                           |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Async loading         | `@comvi/core/loader` (`attachLoader`)   | `registerLoader`, `getLoader`, `reloadTranslations`, `addActiveNamespace`, `addActiveNamespaces`, `onLoadError`                   |
| Import-map loading    | `@comvi/core/loader`                    | `createImportMapLoader` — **moved here from `@comvi/core/slim`**; both subpaths first ship in 0.5.0, so no existing import breaks |
| Plugin host           | `@comvi/core/plugins` (`attachPlugins`) | `use`, `setPluginData`, `getPluginData`                                                                                           |
| Locale detection      | `@comvi/core/plugins`                   | `registerLocaleDetector`, `getLanguageDetector`                                                                                   |
| Missing-key callbacks | `@comvi/core/plugins`                   | `onMissingKey`                                                                                                                    |
| Post-processors       | `@comvi/core/plugins`                   | `registerPostProcessor`                                                                                                           |
| ICU plural/select     | `@comvi/core/icu`                       | `createI18n({ …, compiler: icuCompiler })`                                                                                        |
| Tag interpolation     | `@comvi/core/tags`                      | ambient import, or `tagInterpolation.extensions` per call                                                                         |

Two placements are worth calling out because they are not where you might guess:

- **`addActiveNamespace` / `addActiveNamespaces` live on `/loader`.** Activating a
  namespace only means anything when something loads namespaces. Bare slim activates
  implicitly instead: `addTranslations` self-activates the namespaces it carries.
- **`onLoadError` lives on `/loader`.** Only the loader capability can emit `loadError`,
  so subscribing to it without a loader would be a no-op by construction.

The `postProcess` and `onMissingKey` **constructor options** stay universal — they work on
bare slim. Only the runtime _registration_ APIs are part of the plugin-host capability.

### Tags-less graphs: markup stays literal

In any graph without a tag extension — that is **bare slim and slim + `/icu`** — `<tag>…</tag>`
is not syntax. It stays in the output as literal text:

```ts
import { createI18n } from "@comvi/core/slim";

const i18n = createI18n({
  locale: "en",
  translation: { en: { hi: "Hi, <b>{who}</b>!" } },
});

i18n.t("hi", { who: "Alice" }); // "Hi, <b>Alice</b>!"  — root returns "Hi, Alice!"
```

Tag parsing comes back the moment a tag extension is in the graph: `import "@comvi/core/tags"`
for ambient registration, or `tagInterpolation.extensions` per call. The root `@comvi/core`
entry registers tag syntax itself, which is why it is rich by default.

Non-primitive **parameter values** are a separate axis and behave identically on every
entry, slim included: `t()` always returns a string (parts are coerced), `tRaw()` preserves
them as a parts array.

```ts
i18n.t("greeting", { who: someVNode }); // string — coerced
i18n.tRaw("greeting", { who: someVNode }); // ["Hi, ", someVNode, "!"]
```

### What it costs

Measured min+gz through the published exports map (`node scripts/size-check.mjs`):

| Entry                  | min+gz  |
| ---------------------- | ------- |
| `@comvi/core/slim`     | 5,641 B |
| `+ /tags`              | 6,490 B |
| `+ /icu`               | 6,506 B |
| `+ /loader + /plugins` | 6,877 B |
| `+ /icu + /tags`       | 7,330 B |
| `@comvi/core` (root)   | 8,581 B |

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales — those languages have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them — the same syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

### Plurals across languages

```json
{
  "en": { "messages": "{count, plural, one {# message} other {# messages}}" },
  "uk": {
    "messages": "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}"
  },
  "ar": {
    "messages": "{count, plural, zero {لا توجد رسائل} one {رسالة واحدة} two {رسالتان} few {# رسائل} many {# رسالة} other {# رسالة}}"
  }
}
```

```ts
i18n.t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
i18n.t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
i18n.t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
i18n.t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count — grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
i18n.t("rank", { place: 1 }); // "1st"
i18n.t("rank", { place: 22 }); // "22nd"
i18n.t("rank", { place: 113 }); // "113th"
```

### Select (gender, role, status)

```json
{ "greeting": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
i18n.t("greeting", { gender: "female" }); // "Welcome, madam"
i18n.t("greeting", { gender: "male" }); // "Welcome, sir"
i18n.t("greeting", { gender: "other" }); // "Welcome"
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl`:

```ts
await i18n.setLocale("de");

i18n.formatNumber(1234.5); // "1.234,5"
i18n.formatCurrency(99.99, "USD"); // "99,99 $"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "15. Januar 2025"
i18n.formatRelativeTime(-2, "hour"); // "vor 2 Stunden"

i18n.dir; // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

## Type-safe translation keys

Declaration merging on `TranslationKeys` provides autocomplete and parameter validation per key. Generated automatically via [`@comvi/cli`](../cli) (TMS) or [`@comvi/vite-plugin`](../vite-plugin) (local JSON).

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
    "errors:NOT_FOUND": never;
  }
}
```

```ts
// ✓ Compiles — params shape matches the declaration
i18n.t("welcome", { name: "Alice" });

// ✓ No params needed
i18n.t("greeting");

// ✓ Namespaced keys use the ns option
i18n.t("NOT_FOUND", { ns: "errors" });
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
i18n.t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
i18n.t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
i18n.t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
i18n.t("typo", { name: "Alice" });
```

## Plugins

Translation loading, locale detection, and editing are opt-in plugins. Pass them through `.use()` before `.init()`:

```ts
import { createI18n } from "@comvi/core";
import { FetchLoader } from "@comvi/plugin-fetch-loader";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" })
  .use(
    LocaleDetector({
      order: ["querystring", "cookie", "localStorage", "navigator"],
      lookupCookie: "i18n_locale",
    }),
  )
  .use(
    FetchLoader({
      cdnUrl: "https://cdn.comvi.io/your-distribution-id",
    }),
  );

await i18n.init();
```

Plugins run sequentially during `.init()`, with timeout protection (10s default) and error recovery for non-required plugins. Each can return a cleanup function called on `.destroy()` in LIFO order.

For the full API — namespaces, fallback chains, missing-key handling, RTL detection, lifecycle events, and writing your own plugins — see the [documentation](https://comvi.io/docs/i18n/vanilla/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
