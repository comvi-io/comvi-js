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

Locale-aware `Intl` formatters ride on the base host; the ICU MessageFormat parser, async loading, the plugin system and extension discovery are pure subpaths you compose in.

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~5 kB minified + gzipped for the base host, ~8.6 kB with every capability composed (as bundled by your app)** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS. One explicit import: `compiler: icuCompiler` from `@comvi/core/icu`.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins, each one `.with(…)` call.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/core?

- **Zero runtime dependencies, ~5 kB minified + gzipped for the base host (as bundled by your app)** — drops into any JS environment without a tree of transitive packages.
- **No `eval` or `new Function`** — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Plugin system, not a kitchen sink** — translation loading, locale detection, and editing are opt-in plugins. You only ship what you use.

📖 **Documentation:** https://comvi.io/docs/i18n/vanilla/

⚖️ **Comparison:** [Comvi vs i18next](https://comvi.io/compare/i18next/)

## Install

```bash
npm install @comvi/core
```

## Quick start

The catalogs below use ICU plurals, so the quickstart names the ICU compiler —
on the default compiler `{count, plural, …}` never becomes a plural: it throws
`E_ICU_SYNTAX` in development and renders literally (with a report) in
production, rather than rendering wrong text. Drop both ICU lines and you can
drop the import with them.

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
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

## One entry, pay for what you use

`@comvi/core` is THE entry, and it is the **base host**: text + `{param}`
interpolation, the translation cache, events, default params and the
`.with(installer)` composition pipe. Capability is an import you add, never an
entry you switch — and a capability is absent because its module never entered
your module graph, not because a runtime flag turned it off.

```ts
import { createI18n } from "@comvi/core"; // the base host
import { icuCompiler } from "@comvi/core/icu"; // ICU plural/select/selectordinal
import { loader } from "@comvi/core/loader"; // async loading + nested catalogs
import { plugins } from "@comvi/core/plugins"; // the plugin host
import { devtools } from "@comvi/core/devtools"; // extension discovery
import "@comvi/core/tags"; // ambient <tag> syntax

const i18n = createI18n({ locale: "en", compiler: icuCompiler })
  .with(loader({ uk: () => import("./uk.json") }))
  .with(plugins());
```

**Upgrading from 0.4.x?** The 0.4 root shipped every capability by default, so
this is a deliberate breaking change on a 0.x minor: ICU syntax now throws instead of
rendering plausibly-wrong text, and `.use()`, the loader, discovery and
nested-catalog flattening are absent until composed.
See **[MIGRATION.md](../../MIGRATION.md)** for the per-feature table, the
codemod, and the one rule that has a timing constraint:

- **inline catalogs** — `createI18n({ translation, compiler: icuCompiler })`;
- **remote catalogs** — `createI18n({ locale }).with(icu()).with(fetchLoader({ … }))`,
  BEFORE anything is ingested. The compiler locks irreversibly at the first
  catalog (constructor, `addTranslations`, or a loader merge) and a later
  `icu()` throws `E_COMPILER_LOCKED` before mutating anything.

### ICU syntax on the default compiler is never silent

`{count, plural, …}` on the default compiler is never rendered as a plural, and
never rendered plausibly-wrong: development throws `E_ICU_SYNTAX` at ingestion,
and production renders the braced segment **literally** and reports
`E_ICU_SYNTAX` for it. That is the point: a plural that silently renders as
something plausible reads fine in review and wrong to a user, while a literal
`{count, plural, …}` on the page is visibly broken and takes nothing down with
it.

The error owns exactly two fields — a stable `code` and a truthful
`argumentType` (`"plural"`, `"select"`, `"selectordinal"`, or the parsed token
such as `"number"` / `"date"` / `"other"`, for which the message explicitly does
NOT claim shipped ICU support). Catalog source stays **application-supplied
telemetry**: add it at your own boundary. What the host itself knows it puts in
the report context — `{ source: "compile", key, namespace, locale }`.

Development is EAGER — ingesting a catalog walks its string leaves, so a bad
template throws where it entered, before a single render. The throw always
lands where the template is COMPILED, so a template that never passes through
ingestion — a per-call `params.fallback` — throws at its first compile
instead. Production is LAZY: on the compilation that
hits ICU syntax the segment renders literally and `E_ICU_SYNTAX` is reported
through `onError`, or through `console.error` when no handler is configured —
best-effort, per process, never on cached renders (the parsed template IS
cached, so a hot key costs one report, not one per render). The dev walk costs
the production bundle **0 B** (it is behind the `__DEV__` fold, and a dist test
asserts the identifier occurs in no production artifact).

### Framework bindings

`@comvi/{react,solid,svelte,vue,next,nuxt}` demand `WrapperI18nHost` —
`I18nCoreInstance & I18nCoreExtraApi`, which is exactly what a base host
implements — so the same component code runs on a base host or on any
composition of it. Loader and plugin members are not part of `useI18n()`; they
are acquired explicitly through `useI18nLoader()` / `useI18nPlugins()`, which
throw a named error (in development **and** production) on a host that lacks the
capability rather than being typed present and failing at an arbitrary call site
later.

Each binding re-exports the capability toolkit it needs, so an app names one
package and nothing else; the per-binding recipes and measured weights live in
that package's README.

### The CDN global is the one deliberate exception

`unpkg`/`jsdelivr` serve a **batteries-included** bundle built from its own
entry: a `<script src>` consumer has no import graph to extend, so the global
keeps ICU, ambient tags, the loader, the plugin host and discovery, and
additionally exposes `icuCompiler`, `flattenCatalog`, `prepareTranslation`,
`registerTagSyntax` and `tagSyntaxExtension`. ESM is base-first; the global is
composed. Nothing else in the package has two shapes.

### `.with(installer)` — the composition pipe

`.with` is on the base class, so every host has it, and it is a pipe and nothing
more: `i18n.with(f)` **is** `f(i18n)`. It exists so composition is part of the
construction expression instead of a wrapper around it.

```ts
import { createI18n } from "@comvi/core";
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
capability a host already has — a second `.with(loader())`, or any `.with(…)` on
a host that was already composed — installs nothing and shadows nothing.

> **Order matters: the loader before the plugin host.** Plugins run during `init()`,
> and a loader-registering plugin (for example [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader))
> calls `registerLoader` on the instance. If the loader capability was never composed,
> that call is a `TypeError` at `init()` time, not a compile error. Compose the
> loader first and the ordering concern goes away:
> `createI18n({ … }).with(loader()).with(plugins())`.
>
> Published plugin packages ship a lowercase **installer** that does the ordering
> for you: `.with(fetchLoader({ … }))` composes `/loader`, then `/plugins`, then
> registers the plugin — one call. The uppercase factory is unchanged; reach for
> it when you compose capabilities yourself or register plugins from a list.

### What the base host does not have

Everything below is a **compile error** on the base host until you compose the subpath in —
a missing capability is caught by TypeScript, never discovered in production.

| Capability            | Subpath                               | Members                                                                                                         |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Async loading         | `@comvi/core/loader` (`loader()`)     | `registerLoader`, `getLoader`, `reloadTranslations`, `addActiveNamespace`, `addActiveNamespaces`, `onLoadError` |
| Import-map loading    | `@comvi/core/loader`                  | `createImportMapLoader`, and `loader(map)` to attach + register in one call                                     |
| Nested catalogs       | `@comvi/core/loader`                  | automatic once the loader is composed, or the pure `flattenCatalog(nested)` — see below                         |
| Plugin host           | `@comvi/core/plugins` (`plugins()`)   | `use`, `setPluginData`, `getPluginData`                                                                         |
| Locale detection      | `@comvi/core/plugins`                 | `registerLocaleDetector`, `getLanguageDetector`                                                                 |
| Missing-key callbacks | `@comvi/core/plugins`                 | `onMissingKey`                                                                                                  |
| Post-processors       | `@comvi/core/plugins`                 | `registerPostProcessor`                                                                                         |
| Devtools discovery    | `@comvi/core/devtools` (`devtools()`) | `instanceId`, the `window.__COMVI__` queue protocol, removal on `destroy()`                                     |
| ICU plural/select     | `@comvi/core/icu`                     | `createI18n({ …, compiler: icuCompiler })`, or `.with(icu())` before any catalog                                |
| Rich-text components  | `@comvi/core/rich-text`               | pure `prepareTranslation` / VirtualNode toolbox; tag syntax is passed per call and never registered ambiently   |
| String-API tags       | `@comvi/core/tags`                    | ambient registration plus the same rich-text toolbox — also `&lt;` / `&gt;` / `&amp;` and the `\<` escape       |

Four placements are worth calling out because they are not where you might guess:

- **`addActiveNamespace` / `addActiveNamespaces` live on `/loader`.** Activating a
  namespace only means anything when something loads namespaces. The base host activates
  implicitly instead: `addTranslations` self-activates the namespaces it carries.
- **`onLoadError` lives on `/loader`.** Only the loader capability can emit `loadError`,
  so subscribing to it without a loader would be a no-op by construction.
- **Nested-catalog flattening lives on `/loader`.** A loader hands back raw JSON, so
  turning `{ nav: { home } }` into `"nav.home"` is part of that job. A bare host stores
  catalogs exactly as given — see “The base host wants flat catalogs” below.
- **Discovery lives on `/devtools`.** `instanceId` and the `window.__COMVI__` handshake
  exist for browser extensions; an app that ships no extension integration should not
  carry a `window` protocol. `.with(devtools({ instanceId, exposeGlobal }))` takes
  the two options the 0.4 root read off `createI18n`.

The `postProcess` and `onMissingKey` **constructor options** stay universal — they work on
the base host. Only the runtime _registration_ APIs are part of the plugin-host capability.

### Tags-less graphs: markup stays literal

In any graph without a tag extension — the base host, with or without `/icu` — `<tag>…</tag>`
is not syntax. It stays in the output as literal text:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { hi: "Hi, <b>{who}</b>!" } },
});

i18n.t("hi", { who: "Alice" }); // "Hi, <b>Alice</b>!"  — with a tag extension: "Hi, Alice!"
```

The tag grammar's **escapes travel with it**: `&lt;`, `&gt;`, `&amp;` and `\<` are decoded
only where `<` is syntax. With no tag extension there is nothing to escape from, so they
are ordinary characters and `t()` returns them verbatim.

```ts
i18n.t("legal"); // "a &lt;b&gt; &amp; c"  — with a tag extension: "a <b> & c"
```

ICU apostrophe quoting is **not** part of that: `'{literal}'` and `''` are core grammar and
work on every graph, the bare base host included.

Tag parsing comes back the moment a tag extension is in the graph: `import "@comvi/core/tags"`
for ambient registration, or `tagInterpolation.extensions` per call — and until then,
development warns once per template that the markup is rendering literally.

Non-primitive **parameter values** are a separate axis and behave identically on every
graph: `t()` always returns a string (parts are coerced), `tRaw()` preserves
them as a parts array.

```ts
i18n.t("greeting", { who: someVNode }); // string — coerced
i18n.tRaw("greeting", { who: someVNode }); // ["Hi, ", someVNode, "!"]
```

### The base host wants flat catalogs

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
where raw JSON arrives. So nested input works on any host with the loader composed on;
on a base host it needs one call, and development says so:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) }); // -> "nav.home"
```

`flattenCatalog` is a pure function, so importing only it pulls the flattener and none of
the loader. Either way the cache stores a prototype-less catalog, so a catalog key can never
resolve to an `Object.prototype` member.

### What it costs

Measured min+gz through the published exports map, from the landed run
(`node scripts/size-check.mjs`; the committed anchors live in
`scripts/size-budgets.json`):

| Graph                                    | min+gz  |
| ---------------------------------------- | ------- |
| `@comvi/core` (the base host)            | 5,016 B |
| `+ /icu` (constructor option)            | 5,890 B |
| `+ /icu` (`.with(icu())` installer)      | 5,941 B |
| `+ /tags`                                | 5,976 B |
| `+ /loader + /plugins`                   | 6,549 B |
| `+ /icu + /tags`                         | 6,803 B |
| everything composed (0.4 root semantics) | 8,600 B |

`@comvi/core/devtools` shows up in a graph only when you compose it; the last row
composes all five capabilities plus a tag extension, which is what a 0.4 composed root was.

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

Translation loading, locale detection, and editing are opt-in plugins. Each
first-party package exports two names for the same plugin: a lowercase
**installer** for `.with(…)`, which composes the capabilities that plugin needs
and then registers it, and the uppercase **factory** for `.use(…)` on a host you
composed yourself.

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" })
  .with(
    localeDetector({
      order: ["querystring", "cookie", "localStorage", "navigator"],
      lookupCookie: "i18n_locale",
    }),
  )
  .with(
    fetchLoader({
      cdnUrl: "https://cdn.comvi.io/your-distribution-id",
    }),
  );

await i18n.init();
```

The explicit form spells out the same thing, and it is what you want when you
compose capabilities yourself or register plugins from a list:

```ts
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).with(loader()).with(plugins());

i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

Swapping the two slots is a type error, and loud at runtime as well:
`.use(fetchLoader(…))` throws at `init()` on the installer's first ensure-step,
before any capability is attached, and `.with(FetchLoader(…))` invokes a plugin
against a host that has none of the capabilities it needs, which is rejected.
`.with` is a pipe and nothing more — it never inspects, orders or brands what
you hand it, so each slot has to reject the other explicitly.

Plugins run sequentially during `.init()`, with timeout protection (10s default)
and error recovery for non-required plugins. A plugin may return **nothing or a
cleanup function** — called on `.destroy()` in LIFO order. Any other return value
throws at `init()`: write a statement body (`() => { ready = true; }`), never an
expression-bodied arrow (`() => (ready = true)`, which returns `true`).

For the full API — namespaces, fallback chains, missing-key handling, RTL detection, lifecycle events, and writing your own plugins — see the [documentation](https://comvi.io/docs/i18n/vanilla/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
