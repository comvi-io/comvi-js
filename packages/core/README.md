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

| binding                | root host | single-package `/slim` | saving           | slim recipe                                                                                         |
| ---------------------- | --------- | ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `@comvi/react`         | 10054     | **6532**               | −3522 B (−35.0%) | `createI18n` from **`@comvi/react/slim`** → `<I18nProvider i18n={…}>`                               |
| `@comvi/solid`         | 9773      | **6236**               | −3537 B (−36.2%) | `createI18n` from **`@comvi/solid/slim`** → `<I18nProvider i18n={…}>`                               |
| `@comvi/svelte`        | 9836      | **6319**               | −3517 B (−35.8%) | `createI18n` from **`@comvi/svelte/slim`** → `setI18nContext(i18n)`                                 |
| `@comvi/vue`           | 10363     | **6880**               | −3483 B (−33.6%) | one-call `createI18n` from **`@comvi/vue/slim`** (or `createCore` + `createI18nFromCore`)           |
| `@comvi/next` (server) | 9948      | **7129**               | −2819 B (−28.3%) | `createNextI18nFromHost(() => createSlimI18n(…).with(attachLoader))`, all from `@comvi/next/server` |
| `@comvi/nuxt` (server) | 12156     | **9585**               | −2571 B (−21.2%) | `hostModule: "./comvi.host.ts"`; host = `createI18n(…).with(loader(map))`                           |

Rendering `<T>` buys the tag machinery on top of the slim rows, and only then:
react **+2005 B**, solid **+1926 B**, svelte **+2318 B**, vue **+1967 B**.
Client-only graphs: `@comvi/next` client on a hydrated bare-slim host is
**6964 B**, `@comvi/nuxt` client **8013 B**.

### One package per app

Every binding's `/slim` entry (and both `@comvi/next` entries) re-exports the
capability toolkit — `icuCompiler`, the `loader` / `plugins` / `devtools`
installers and the low-level `attachLoader` / `flattenCatalog` /
`attachPlugins` / `attachDevtools` — so an app names its framework package and
nothing else:

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react/slim";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

They are **named** re-exports of core's own bindings, from core's PURE subpaths
only. The ones you do not call are pruned: the `*-slim-preset` bundler-matrix
cases assert the icu, plugins and devtools subpaths never enter the module
graph — webpack and vite, development and production. `@comvi/core/tags` is
deliberately not among them; importing it registers tag syntax ambiently, and
`<T>` already owns that import in its own dist chunk.

`@comvi/react`, `@comvi/solid` and `@comvi/vue` build their `/slim` entry in a
separate pass, so its provider/injection identity is distinct from the main
entry's. Pick one entry per app — `/slim` is a superset of the bindings, so
there is never a reason to mix.

Four bindings need one line of explanation each:

- **vue — import from `@comvi/vue/slim`.** The main entry tree-shakes the root
  graph out of a `createI18nFromCore`-only app under esbuild, vite (development
  and production) and webpack production. It does **not** under webpack
  _development_: `@comvi/vue`'s index carries `export * from "@comvi/core"`, and
  webpack cannot prune a star re-export with `usedExports` off, so the root
  entry — and with it core's ambient `registerTagSyntax()` — survives and
  `t("a <b>x</b>")` renders differently in dev than in prod. `@comvi/vue/slim`
  ships the same classes, composables, `<T>` and injection key without the
  root-bound `createI18n` and without the core re-export; it is the entry the
  vue row above measures. Its `createI18n` is the one-call preset over a slim
  core, and `createCore` is core's own constructor for the
  `createI18nFromCore` path.
- **next — the server always needs a loader.** `createNextI18nFromHost` is
  exported from `@comvi/next/server` and nowhere else, and its host type is
  `NextServerHost = WrapperI18nHost & I18nLoaderApi`. Both next entries carry
  the toolkit plus `createSlimI18n`. `@comvi/next/client` keeps its published
  root `createI18n` under that name — it is not a `/slim` entry, and swapping
  the binding would silently drop ICU and tags for an existing app —
  so the slim client host is `createSlimI18n`. `createNextI18n` keeps its exact
  signature for root apps.
- **nuxt — the host is a module path, branched at build time.** `hostModule`
  points at a module whose default export is `() => WrapperI18nHost`; the
  generated `#build/comvi.host` template imports the root entry only when the
  option is unset. A server-rendered app's host needs the loader capability. Nuxt has
  no `/slim` entry and needs none: the composables are auto-imported, so app
  code names no package at all, and `comvi.host.ts` is a build-time composition
  root where naming `@comvi/core/slim` is how you see which branch you are on.

No member of any binding is typed present and then throws "missing capability".
`VueI18n` dropped all eight of its capability proxies, `use` included — plugin
registration is `i18n.core.use(…)`, next to where the host is composed.

Full migration tables, the codemod and the unsupported-shape list:
[MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

### `.with(installer)` — the composition pipe

`.with` is on every host, root and slim alike, and it is a pipe and nothing
more: `i18n.with(f)` **is** `f(i18n)`. It exists so composition is part of the
construction expression instead of a wrapper around it.

```ts
import { createI18n } from "@comvi/core/slim";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .with(loader({ uk: () => import("./uk.json") }))
  .with(plugins());

i18n.use(SomePlugin());

await i18n.init();
i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

An **installer** is any `(host) => value`, so the `attach*` functions are
installers already — `.with(attachLoader)` works, and it is what you want for a
host you will hand a plain `LoaderFn`:

```ts
const i18n = createI18n({ locale: "en" }).with(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

`loader()`, `plugins()` and `devtools()` are the _configured_ installers: they
attach **and** configure in the same call. Pick by what you have — `loader`
names the import-map adapter statically, so it costs ~111–124 B min+gz whether
or not you pass a map, while `attachLoader` costs 2 B over calling it directly.

Every install is idempotent, and installs land as **non-enumerable own
properties** with ordinary method descriptors — `Object.keys(i18n)`, spread
copies and `JSON.stringify` see exactly what they saw before. Composing a
capability a host already has (a second `.with(loader())`, or any `.with(…)` on
a root instance) installs nothing and shadows nothing.

> **Order matters: the loader before the plugin host.** Plugins run during `init()`,
> and a loader-registering plugin (for example [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader))
> calls `registerLoader` on the instance. If the loader capability was never composed,
> that call is a `TypeError` at `init()` time, not a compile error. The root
> `@comvi/core` entry ships both capabilities on the class — there is nothing to compose
> and no ordering concern there.
>
> Published plugin packages are unchanged: compose the host, then `use` them.
> That is the current recipe, not the final one — plugin packages will become
> directly `.with`-able in a follow-up.

### What bare slim does not have

Everything below exists on a root `@comvi/core` instance. On slim it is a **compile
error** until you attach the subpath — a missing capability is caught by TypeScript, never
discovered in production.

| Capability            | Subpath                               | Members                                                                                                                           |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Async loading         | `@comvi/core/loader` (`loader()`)     | `registerLoader`, `getLoader`, `reloadTranslations`, `addActiveNamespace`, `addActiveNamespaces`, `onLoadError`                   |
| Import-map loading    | `@comvi/core/loader`                  | `createImportMapLoader` — **moved here from `@comvi/core/slim`**; both subpaths first ship in 0.5.0, so no existing import breaks |
| Nested catalogs       | `@comvi/core/loader`                  | automatic once the loader is composed, or the pure `flattenCatalog(nested)` — see below                                           |
| Plugin host           | `@comvi/core/plugins` (`plugins()`)   | `use`, `setPluginData`, `getPluginData`                                                                                           |
| Locale detection      | `@comvi/core/plugins`                 | `registerLocaleDetector`, `getLanguageDetector`                                                                                   |
| Missing-key callbacks | `@comvi/core/plugins`                 | `onMissingKey`                                                                                                                    |
| Post-processors       | `@comvi/core/plugins`                 | `registerPostProcessor`                                                                                                           |
| Devtools discovery    | `@comvi/core/devtools` (`devtools()`) | `instanceId`, the `window.__COMVI__` queue protocol, removal on `destroy()`                                                       |
| ICU plural/select     | `@comvi/core/icu`                     | `createI18n({ …, compiler: icuCompiler })`                                                                                        |
| Tag interpolation     | `@comvi/core/tags`                    | ambient import, or `tagInterpolation.extensions` per call — also `&lt;` / `&gt;` / `&amp;` and the `\<` escape                    |

Four placements are worth calling out because they are not where you might guess:

- **`addActiveNamespace` / `addActiveNamespaces` live on `/loader`.** Activating a
  namespace only means anything when something loads namespaces. Bare slim activates
  implicitly instead: `addTranslations` self-activates the namespaces it carries.
- **`onLoadError` lives on `/loader`.** Only the loader capability can emit `loadError`,
  so subscribing to it without a loader would be a no-op by construction.
- **Nested-catalog flattening lives on `/loader`.** A loader hands back raw JSON, so
  turning `{ nav: { home } }` into `"nav.home"` is part of that job. A bare host stores
  catalogs exactly as given — see “Bare slim wants flat catalogs” below.
- **Discovery lives on `/devtools`.** `instanceId` and the `window.__COMVI__` handshake
  exist for browser extensions; an app that ships no extension integration should not
  carry a `window` protocol. `.with(devtools({ instanceId, exposeGlobal }))` takes
  the two options the root entry reads off `createI18n`.

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

The tag grammar's **escapes travel with it**: `&lt;`, `&gt;`, `&amp;` and `\<` are decoded
only where `<` is syntax. With no tag extension there is nothing to escape from, so they
are ordinary characters and `t()` returns them verbatim.

```ts
i18n.t("legal"); // "a &lt;b&gt; &amp; c"  — root returns "a <b> & c"
```

ICU apostrophe quoting is **not** part of that: `'{literal}'` and `''` are core grammar and
work on every entry, bare slim included.

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

### Bare slim wants flat catalogs

A bare host stores what you hand it. `addTranslations` (and `translation` in the
constructor) takes catalogs keyed by locale or `"locale:namespace"`, whose values are
**flat** — dot-notation keys, string values:

```ts
i18n.addTranslations({
  en: { "nav.home": "Home" },
  "en:admin": { "nav.home": "Admin home" },
});
```

Nested objects are recursively flattened by the **loader capability**, because that is
where raw JSON arrives. So nested input works unchanged on the root entry and on any host
with the loader capability; on a bare host it needs one call, and dev mode says so:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) }); // -> "nav.home"
```

`flattenCatalog` is a pure function, so importing only it pulls the flattener and none of
the loader. Either way the cache stores a prototype-less catalog, so a catalog key can never
resolve to an `Object.prototype` member.

### What it costs

Measured min+gz through the published exports map (`node scripts/size-check.mjs`):

| Entry                  | min+gz  |
| ---------------------- | ------- |
| `@comvi/core/slim`     | 4,909 B |
| `+ /tags`              | 5,869 B |
| `+ /icu`               | 5,783 B |
| `+ /loader + /plugins` | 6,328 B |
| `+ /icu + /tags`       | 6,698 B |
| `@comvi/core` (root)   | 8,397 B |

`@comvi/core/devtools` shows up in a graph only when you attach it; the root entry
composes it in, which is part of the 8,397 B.

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
