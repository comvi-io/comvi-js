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

`@comvi/core` is the framework-independent runtime that powers every Comvi i18n binding. If you already use [`@comvi/vue`](../vue), [`@comvi/react`](../react), [`@comvi/solid`](../solid), [`@comvi/svelte`](../svelte), [`@comvi/next`](../next), or [`@comvi/nuxt`](../nuxt), you already have it transitively. Install this package directly only when you're building a custom integration or running Comvi i18n in vanilla Node/browser code.

Locale-aware `Intl` formatters ride on the base host; the ICU MessageFormat parser, async loading, the plugin system and extension discovery are pure subpaths you compose in.

## About Comvi i18n

Comvi i18n is a framework-agnostic internationalization library. You get ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~5 kB minified + gzipped for the base host, ~8.5 kB with every capability composed (as bundled by your app)**, with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **ICU `plural`, `selectordinal` & `select`:** locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS. One explicit import: `compiler: icuCompiler` from `@comvi/core/icu`. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Type-safe translation keys** via TypeScript declaration merging, for autocomplete and parameter validation everywhere.
- **Pluggable:** translation loading, locale detection, and in-context editing are opt-in plugins, one `.use(…)` call each.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/core?

- **Zero runtime dependencies, ~5 kB minified + gzipped for the base host (as bundled by your app).** It drops into any JS environment without a tree of transitive packages.
- **No `eval` or `new Function`.** Runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Plugin system.** Translation loading, locale detection, and editing are opt-in plugins. You only ship what you use.

📖 **Documentation:** https://comvi.io/docs/i18n/vanilla/

⚖️ **Comparison:** [Comvi vs i18next](https://comvi.io/compare/i18next/)

## Install

```bash
npm install @comvi/core
```

## Quick start

The catalogs below use ICU plurals, so the quickstart names the ICU compiler. On
the default compiler `{count, plural, …}` never becomes a plural: it throws
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
`.use(installer)` composition pipe. You add a capability by importing it, not by
switching entry points. A capability you never import never enters your module
graph, and there is no runtime flag that turns one off.

```ts
import { createI18n } from "@comvi/core"; // the base host
import { icuCompiler } from "@comvi/core/icu"; // ICU plural/select/selectordinal
import { loader } from "@comvi/core/loader"; // async / remote loading
import { plugins } from "@comvi/core/plugins"; // the plugin host
import { devtools } from "@comvi/core/devtools"; // extension discovery
import "@comvi/core/tags"; // ambient <tag> syntax

const i18n = createI18n({ locale: "en", compiler: icuCompiler })
  .use(loader({ uk: () => import("./uk.json") }))
  .use(plugins());
```

**Upgrading from 0.4.x?** The 0.4 root shipped every capability by default, so
this is a breaking change on a 0.x minor: ICU syntax now throws instead of
rendering plausibly-wrong text, and plugin registration, the loader and
discovery are absent until composed. (Nested-catalog flattening is not on that
list: every host does it.)
See **[MIGRATION.md](../../MIGRATION.md)** for the per-feature table and the
codemod.

ICU is not a composed capability at all: `compiler: icuCompiler` is a
constructor field held for the instance's life, so one option covers every
catalog source. `createI18n({ translation, compiler: icuCompiler })` for inline
catalogs, `createI18n({ locale, compiler: icuCompiler }).use(cdnLoader({ … }))`
for remote ones, and nothing about where the catalog came from changes the
answer.

### ICU syntax on the default compiler is never silent

`{count, plural, …}` on the default compiler is never rendered as a plural, and
never rendered plausibly-wrong. Development throws `E_ICU_SYNTAX` at ingestion.
Production renders the braced segment **literally** and reports `E_ICU_SYNTAX`
for it. A plural that silently renders as something plausible reads fine in
review and wrong to a user. A literal `{count, plural, …}` on the page is
visibly broken and takes nothing down with it.

The error has only two own fields: a stable `code` and an `argumentType`
(`"plural"`, `"select"`, `"selectordinal"`, or the parsed token such as
`"number"` / `"date"` / `"other"`, for which the message explicitly does NOT
claim shipped ICU support). Catalog source stays **application-supplied
telemetry**: add it at your own boundary. What the host itself knows goes into
the report context: `{ source: "compile", key, namespace, locale }`.

Development is EAGER: ingesting a catalog walks its string leaves, so a bad
template throws where it entered, before a single render. The throw always
lands where the template is COMPILED, so a template that never passes through
ingestion, such as a per-call `params.fallback`, throws at its first compile
instead. Production is LAZY: on the compilation that hits ICU syntax the segment
renders literally and `E_ICU_SYNTAX` is reported through `onError`, or through
`console.error` when no handler is configured. That report is best-effort, per
process, and never fires on cached renders (the parsed template IS cached,
so a hot key costs one report, not one per render). The dev walk costs the
production bundle **0 B**: it sits behind the `__DEV__` guard, and a dist test
asserts the identifier occurs in no production artifact.

### Framework bindings

`@comvi/{react,solid,svelte,vue,next,nuxt}` are typed against `WrapperI18nHost`,
which is `I18nCoreInstance & I18nCoreExtraApi` and is exactly what a base host
implements. So the same component code runs on a base host or on any composition
of it. The provider and context entry points accept slightly more than that
name: `WrapperI18nHost<D>` is invariant in `D`, so react, solid and svelte widen
`setDefaultParams` and `init` on the parameter type, and a host built with
`defaultParams` is accepted rather than rejected. Loader and plugin members are
not part of `useI18n()`; you acquire them
through `useI18nLoader()` / `useI18nPlugins()`, which throw a named error (in
development **and** production) on a host that lacks the capability rather than
being typed present and failing at an arbitrary call site later.

Each binding re-exports the capability toolkit it needs, so an app names one
package and nothing else; the per-binding recipes and measured weights live in
that package's README.

### The CDN global build

`unpkg`/`jsdelivr` serve a fully composed bundle built from its own entry. A
`<script src>` consumer has no import graph to extend, so the global keeps ICU,
ambient tags, the loader, the plugin host and discovery, and also exposes
`icuCompiler`, `flattenCatalog`, `prepareTranslation`, `registerTagSyntax` and
`tagSyntaxExtension`. ESM starts from the base host; the global starts composed.
Nothing else in the package is published two ways.

### `.use(installer)` — the composition pipe

`.use` is on the base class, so every host has it. It is a pipe and nothing
more: `i18n.use(f)` **is** `f(i18n)`. Composition stays part of the
construction expression instead of a wrapper around it.

```ts
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .use(loader({ uk: () => import("./uk.json") }))
  .use(plugins());

i18n.registerPlugin(LocaleDetector({ supportedLocales: ["en", "uk"] }));

await i18n.init();
i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

An **installer** is any `(host) => value`, so the `attach*` functions are
installers already. `.use(attachLoader)` works, and it is what you want for a
host you will hand a plain `LoaderFn`:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

`loader(map)`, `plugins()` and `devtools()` are the _configured_ installers:
they attach **and** configure in the same call. For the loader that is one
sentence, because the import map is **required**: a static map of import
functions goes to `.use(loader(map))`; a plain `LoaderFn` goes to
`.use(attachLoader)` followed by `registerLoader(fn)`, as above. A bare
`loader()` is a compile error, so there is no third form and nothing to weigh —
and the import-map adapter (~111–124 B min+gz) is in your bundle only when you
actually hand over a map.

Your app's own inline plugin reaches the queue through
`definePlugin(fn, options?)` from `@comvi/core/plugins`:
`.use(definePlugin((i18n) => { … }))` composes the plugin host and registers
`fn` in the same call. An installer widens the host **in place** and hands that
same host back, so `.use` refuses anything else, whatever its shape: give it the
raw plugin and it throws `E_USE_NOT_INSTALLER`. The check is identity, not
shape, which is why an async plugin cannot slip past it — and why `.use` is not
a place to register one: it calls the function before it checks, so the promise
that function returns is never awaited. `definePlugin(fn)` and
`registerPlugin(fn)` put the plugin in the queue, where `required`, `timeout`
and `onError` apply to it.

Every install is idempotent, and installs land as **non-enumerable own
properties** with ordinary method descriptors, so `Object.keys(i18n)`, spread
copies and `JSON.stringify` see exactly what they saw before. Composing a
capability a host already has (a second `.use(attachLoader)`, or any `.use(…)` on
a host that was already composed) installs nothing and shadows nothing.

> **Compose the loader alongside the plugin host. Order between them is free.**
> Plugins run during `init()`, and a loader-registering plugin (for example
> [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader)) calls `registerLoader`
> on the instance. If the loader capability was never composed at all, that call
> is a `TypeError` at `init()` time, not a compile error. Composing both is what
> fixes it, and either chain does it:
> `createI18n({ … }).use(attachLoader).use(plugins())` and
> `createI18n({ … }).use(plugins()).use(attachLoader)` are equivalent, because
> every capability composed before `init()` is attached by the time plugins run.
>
> Beyond that the library has no ordering rule. ICU is not composed at all: it
> is `compiler: icuCompiler` in the constructor options, and it covers every
> catalog source.
>
> Published plugin packages ship a lowercase **installer** that does the ordering
> for you: `.use(cdnLoader({ … }))` composes `/loader`, then `/plugins`, then
> registers the plugin, all in one call. The uppercase factory is unchanged; use
> it when you compose capabilities yourself or register plugins from a list.

### What the base host does not have

Everything below is a **compile error** on the base host until you compose the subpath in.
TypeScript catches a missing capability, so you never discover one in production.

| Capability            | Subpath                                                 | Members                                                                                                                 |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Async loading         | `@comvi/core/loader` (`attachLoader`)                   | `registerLoader`, `getLoader`, `reloadTranslations`, `addActiveNamespace(s)`, `removeActiveNamespace(s)`, `onLoadError` |
| Import-map loading    | `@comvi/core/loader`                                    | `createImportMapLoader`, and `loader(map)` to attach + register in one call                                             |
| Plugin host           | `@comvi/core/plugins` (`plugins()`, `definePlugin(fn)`) | `registerPlugin`, `setPluginData`, `getPluginData`                                                                      |
| Locale detection      | `@comvi/core/plugins`                                   | `registerLocaleDetector`, `getLanguageDetector`                                                                         |
| Missing-key callbacks | `@comvi/core/plugins`                                   | `onMissingKey`                                                                                                          |
| Post-processors       | `@comvi/core/plugins`                                   | `registerPostProcessor`                                                                                                 |
| Devtools discovery    | `@comvi/core/devtools` (`devtools()`)                   | `instanceId`, the `window.__COMVI__` queue protocol, removal on `destroy()`                                             |
| ICU plural/select     | `@comvi/core/icu`                                       | `createI18n({ …, compiler: icuCompiler })`                                                                              |
| Rich-text components  | `@comvi/core/rich-text`                                 | pure `prepareTranslation` / VirtualNode toolbox; tag syntax is passed per call and never registered ambiently           |
| String-API tags       | `@comvi/core/tags`                                      | ambient registration plus the same rich-text toolbox, and `&lt;` / `&gt;` / `&amp;` and the `\<` escape                 |

`@comvi/core/rich-text` also exports `registerTagSyntax` itself, so you can opt into the same ambient registration `@comvi/core/tags` performs — explicitly, next to `prepareTranslation` — without importing that second subpath.

Three placements are not where you might guess, and one non-placement:

- **`addActiveNamespace(s)` / `removeActiveNamespace(s)` live on `/loader`.** Activating a
  namespace only means anything when something loads namespaces. The base host activates
  implicitly instead: `addTranslations` self-activates the namespaces it carries.
  `removeActiveNamespace(ns)` is the deactivation. `clearTranslations()` drops CONTENT in
  every form and never changes which namespaces are active.
- **`onLoadError` lives on `/loader`.** Only the loader capability can emit `loadError`,
  so subscribing to it without a loader would be a no-op by construction.
- **Discovery lives on `/devtools`.** `instanceId` and the `window.__COMVI__` handshake
  exist for browser extensions; an app that ships no extension integration should not
  carry a `window` protocol. `.use(devtools({ instanceId, exposeGlobal }))` takes
  the two options the 0.4 root read off `createI18n`.
- **Nested-catalog flattening is NOT on `/loader`**, and not on any subpath. It is
  base-host behaviour: turning `{ nav: { home } }` into `"nav.home"` happens at the one
  place a catalog enters, whether or not anything is composed. See “Nested or flat, on
  every host” below.

The `postProcess` and `onMissingKey` **constructor options** stay universal: they work on
the base host. Only the runtime _registration_ APIs are part of the plugin-host capability.

### An option whose capability never arrived says so

Two options are accepted by the base host and then do nothing there, because the code that
reads them belongs to a capability. `init()` reports each one ONCE, in development only:

- **`ns`** (initial namespaces) with no loader composed: `init()` has nothing to load with,
  so the warning names `.use(loader(map))`.
- **`instanceId`, or `exposeGlobal: true`**, with no discovery composed: nothing touches
  `window.__COMVI__`, so the warning names `.use(devtools({ instanceId }))`.

The report is at `init()` rather than in the constructor, because both capabilities are
legally composed after construction and before `init()`. Production stays silent: a missing
capability is not a boundary violation, so the fail-soft rule applies.

**`exposeGlobal: false` is deliberately silent.** It asks for the absence a base host
already delivers, so there is nothing to report — and 0.4 boilerplate that carries it is not
worth a warning.

### Tags-less graphs: markup stays literal

In any graph without a tag extension (the base host, with or without `/icu`), `<tag>…</tag>`
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
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { legal: "a &lt;b&gt; &amp; c" } },
});

i18n.t("legal"); // "a &lt;b&gt; &amp; c"  — with a tag extension: "a <b> & c"
```

ICU apostrophe quoting is **not** part of that: `'{literal}'` and `''` are core grammar and
work on every graph, the bare base host included.

Tag parsing comes back the moment a tag extension is in the graph:
`import "@comvi/core/tags"` for ambient registration, or
`tagInterpolation.extensions` per call. Until then, development warns once per
template that the markup is rendering literally.

Non-primitive **parameter values** are a separate axis and behave identically on
every graph: `t()` always returns a string (parts are coerced), `tRaw()`
preserves them as a parts array.

```ts
import { createI18n } from "@comvi/core";
import type { VirtualNode } from "@comvi/core";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi, {who}!" } } });

const someVNode: VirtualNode = { type: "text", text: "Alice" };

i18n.t("hi", { who: someVNode }); // string — coerced
i18n.tRaw("hi", { who: someVNode }); // ["Hi, ", someVNode, "!"]
```

### Nested or flat, on every host

`addTranslations` (and `translation` in the constructor) takes catalogs keyed by
locale or `"locale:namespace"`. The values may be **flat** — dot-notation keys
and string values — or **nested**, and the two are the same catalog:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.addTranslations({
  en: { "nav.home": "Home" },
  "en:admin": { nav: { home: "Admin home" } }, // -> "nav.home"
});
```

Flattening happens in the BASE host, unconditionally, at the one place a catalog enters, so
`createI18n({ translation: { en: { nav: { home: "Home" } } } })` resolves `t("nav.home")`
with nothing composed. A loader result, an `addTranslations` call and the constructor all go
through it, and an object mixing both shapes works too. The cache stores a prototype-less
catalog, so a catalog key can never resolve to an `Object.prototype` member.

Two leaf shapes are not strings, and both behave the same way everywhere:

- a non-string leaf (number, boolean, array) is **coerced with `String()`**;
- a `null` or `undefined` leaf is **dropped**, so the key is simply missing.

Each reports one development warning naming the key; production is silent, per the
fail-soft rule. This is what 0.4 did as well; only the unreleased 0.5 pre-releases stored these
verbatim on a base host, which made a `null` leaf resolve as an empty template.

`flattenCatalog` is the same function, exported from the `@comvi/core` ROOT for
pre-flattening data by hand — inspecting the keys a nested object will produce, or merging
several sources before handing one object over. It is **not** an escape hatch any more, and
it is not on `@comvi/core/loader`:

```ts
import { createI18n, flattenCatalog } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

flattenCatalog({ nav: { home: "Home" } }); // { "nav.home": "Home" }
i18n.addTranslations({ en: { nav: { home: "Home" } } }); // the same result, no call needed
```

### What it costs

Measured min+gz through the published exports map, from the landed run
(`node scripts/size-check.mjs`; the committed anchors live in
`scripts/size-budgets.json`):

| Graph                                    | min+gz  |
| ---------------------------------------- | ------- |
| `@comvi/core` (the base host)            | 5,016 B |
| `+ /icu`                                 | 5,890 B |
| `+ /tags`                                | 5,976 B |
| `+ /loader + /plugins`                   | 6,549 B |
| `+ /icu + /tags`                         | 6,803 B |
| everything composed (0.4 root semantics) | 8,600 B |

`@comvi/core/devtools` shows up in a graph only when you compose it; the last row
composes all five capabilities plus a tag extension, the same set a 0.4 composed root had.

## ICU MessageFormat

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales, which have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them, and it is the syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

### Plurals across languages

```json title="src/locales/messages.json"
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
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import translation from "./locales/messages.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

i18n.t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
i18n.t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
i18n.t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
i18n.t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count, which is grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json title="src/locales/rank.json"
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import en from "./locales/rank.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation: { en } });

i18n.t("rank", { place: 1 }); // "1st"
i18n.t("rank", { place: 22 }); // "22nd"
i18n.t("rank", { place: 113 }); // "113th"
```

### Select (gender, role, status)

```json title="src/locales/salutation.json"
{ "salutation": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import en from "./locales/salutation.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation: { en } });

i18n.t("salutation", { gender: "female" }); // "Welcome, madam"
i18n.t("salutation", { gender: "male" }); // "Welcome, sir"
i18n.t("salutation", { gender: "other" }); // "Welcome"
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl`:

They are free functions that take the host rather than members of it. Nothing is
bolted onto the instance, so a graph that never formats never pays for it:

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

await i18n.setLocaleAsync("de"); // or the synchronous setter: i18n.locale = "de"

formatNumber(i18n, 1234.5); // "1.234,5"
formatCurrency(i18n, 99.99, "USD"); // "99,99 $"
formatDate(i18n, new Date(), { dateStyle: "long" }); // "15. Januar 2025"
formatRelativeTime(i18n, -2, "hour"); // "vor 2 Stunden"

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

## Type-safe translation keys

Declaration merging on `TranslationKeys` provides autocomplete and parameter validation per key. Generated automatically via [`@comvi/cli`](../cli) (TMS) or [`@comvi/vite-plugin`](../vite-plugin) (local JSON).

```typescript check=group=typed-keys
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    hello: never;
    "errors:NOT_FOUND": never;
  }
}
```

```ts check=group=typed-keys
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// ✓ Compiles — params shape matches the declaration
i18n.t("welcome", { name: "Alice" });

// ✓ No params needed
i18n.t("hello");

// ✓ Namespaced keys use the ns option
i18n.t("NOT_FOUND", { ns: "errors" });
```

**What TypeScript catches:**

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
i18n.t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2769
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
i18n.t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
i18n.t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
i18n.t("typo", { name: "Alice" });
```

## Plugins

Translation loading, locale detection, and editing are opt-in plugins. Each
first-party package exports two names for the same plugin: a lowercase
**installer** for `.use(…)`, which composes the capabilities that plugin needs
and then registers it, and the uppercase **factory** for `registerPlugin(…)` on
a host you composed yourself.

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
  .use(
    cdnLoader({
      cdnUrl: "https://cdn.comvi.io/your-distribution-id",
    }),
  );

await i18n.init();
```

The distribution id in `cdnUrl` comes from the Comvi platform: open your project
and read it off the **Distributions** page.

The explicit form spells out the same thing, and it is what you want when you
compose capabilities yourself or register plugins from a list:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { CdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(attachLoader).use(plugins());

i18n.registerPlugin(CdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

Swapping the two slots is a type error, and both halves are caught at runtime as
well. `registerPlugin(cdnLoader(…))` throws `E_INSTALLER_AS_PLUGIN` at `init()`,
on the installer's first ensure-step, before any capability is attached.
`.use(CdnLoader(…))` throws `E_USE_NOT_INSTALLER`: `.use` is a pipe and nothing
more — it never inspects, orders or brands the function you hand it — but it
does check the one thing that makes a function an installer. An installer widens
the host in place and hands that same host back, so `.use` refuses any other
return value, whatever its shape. It calls the function before it checks,
so this plugin runs outside `init()`'s drain loop and, being async, hands back a
promise nobody awaits. Register it with `registerPlugin` instead, where the
queue gives it `required`, `timeout`, `onError` and cleanup.

Plugins run sequentially during `.init()`, with timeout protection (10s default)
and error recovery for non-required plugins. A plugin may return **nothing or a
cleanup function**, which is called on `.destroy()` in LIFO order. Any other
return value throws at `init()`: write a statement body
(`() => { ready = true; }`), never an expression-bodied arrow
(`() => (ready = true)`, which returns `true`).

For the full API, including namespaces, fallback chains, missing-key handling, RTL detection, lifecycle events, and writing your own plugins, see the [documentation](https://comvi.io/docs/i18n/vanilla/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
