<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 5 binding for Comvi i18n — stores, context, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/svelte"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/svelte?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/svelte` wraps [`@comvi/core`](../core) for Svelte. `setI18nContext()` registers the instance for descendants; `useI18n()` returns reactive stores that work with `$store` syntax in templates.

Same `t()` and `<T>` API as the [Vue](../vue), [React](../react), and [SolidJS](../solid) bindings — switch frameworks without relearning your i18n layer.

📖 **Documentation:** https://comvi.io/docs/i18n/svelte/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~6.4 kB minified + gzipped for a default app graph (measured, `svelte` externalized), zero runtime dependencies.** That is the base host plus the svelte bindings; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor` — one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/svelte?

- **Native stores with `$` syntax.** `useI18n()` returns proper Svelte stores — `$locale`, `$isLoading`, `$t()` work seamlessly with auto-subscription in templates.
- **Single context setup.** Call `setI18nContext()` once in a parent component; descendants automatically access stores via `useI18n()` without prop drilling.
- **Svelte 5 only.** Built on Svelte 5's runes-compatible API with native event handler syntax (`onclick`, `onchange`).

## Install

```bash
npm install @comvi/svelte
# Peer: svelte ^5.0.0
```

## Quick start

```svelte
<!-- src/routes/+layout.svelte (or App.svelte) -->
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    translation: {
      en: { greeting: "Hello, {name}!" },
      uk: { greeting: "Привіт, {name}!" },
    },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

```svelte
<!-- A child component -->
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const { t, locale, setLocale } = useI18n();
</script>

<h1>{$t("greeting", { name: "Alice" })}</h1>
<select value={$locale} onchange={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

For strict typed key overloads in Svelte, use `tRaw` from `useI18n()`. The `$t` store is a string-key convenience wrapper for template ergonomics.

For `<T>` rich-text components, type-safe keys, and the full store API, see the [documentation](https://comvi.io/docs/i18n/svelte/).

## Capability APIs: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities**, not part
of the translation core. Since 0.5.0 their members are acquired explicitly
rather than being handed out by `useI18n()`:

```svelte
<script lang="ts">
  import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/svelte";

  const { t } = useI18n("admin");
  const { addActiveNamespace, reloadTranslations, onLoadError } = useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
</script>
```

They are **context readers, not stores**: like `useI18n()` they call
`getI18nContext()`, so they are callable during component initialisation only,
and what they return is a plain object of bound functions. Do not `$`-prefix a
member. The asymmetry with `createLocaleStore()` & friends is deliberate — a
capability action is an imperative operation, not a value that changes over
time. Neither takes parameters; the namespace argument stays on `useI18n(ns)`.

On a host that lacks the capability the acquisition call throws — in
development **and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
```

Migrating from 0.4.x: `pnpm codemod:framework-slim "src/**/*.{ts,js,svelte}"`,
or the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Supported hosts and what they cost

`setI18nContext(i18n)`, `getI18nContext()` and all six store factories accept
any `WrapperI18nHost` — `createI18n` from `@comvi/svelte` (core's own base-host
constructor, re-exported by name), with or without `.with(loader())` /
`.with(plugins())` composed on. Before 0.5.0 a base host did not merely mistype
here, it **crashed**: `useI18n()` eagerly `.bind()`-ed the capability members in
the object literal it returned. The base host is also the cheap one: ICU, tag
syntax, async loading, the plugin host and devtools discovery are each something
you compose, never something you carry by default.

Whole-app comvi graph, min+gz, `svelte` externalized (`node scripts/size-check.mjs`):

| app shape                         | size fixture               | min+gz      | its sentinels assert absent                 |
| --------------------------------- | -------------------------- | ----------- | ------------------------------------------- |
| base host, no `<T>`               | `fw-svelte-default`        | **6412 B**  | ambient tags + all four capability subpaths |
| base host + `<T>`                 | `fw-svelte-default-t`      | **8603 B**  | the same six — `<T>` registers nothing      |
| base host + inline ICU            | `fw-svelte-icu`            | **7298 B**  | ambient tags, loader, plugins, devtools     |
| full explicit composition + `<T>` | `fw-svelte-full-composite` | **11266 B** | ambient tag registration                    |

All four rows are live in `scripts/size-budgets.json`, gated at measured +2%,
and checked against the emitted module graph on every run — so the "an unused
re-export costs nothing" claim is a gate rather than a sentence. The default is
+93 B (+1.47%) over the pre-convergence single-package anchor and 3424 B (34.8%)
below the historical 0.4 composed root, which measured 9836 B.

## One package, one entry

`@comvi/svelte` is the whole toolkit: core's base host constructor and class,
the svelte bindings, and core's capability installers as **named** re-exports.
A svelte app names one package and nothing else.

| export                                       | what it is                                      |
| -------------------------------------------- | ----------------------------------------------- |
| `createI18n`, `I18n`                         | core's base host — constructor and class        |
| `icuCompiler`, `icu`                         | from `@comvi/core/icu` — compiler and installer |
| `loader`, `attachLoader`, `flattenCatalog`   | from `@comvi/core/loader`                       |
| `plugins`, `attachPlugins`                   | from `@comvi/core/plugins`                      |
| `devtools`, `attachDevtools`                 | from `@comvi/core/devtools`                     |
| every store factory, the readers, `T`, types | the svelte bindings                             |

There is no svelte-side wrapper object to build — the host goes straight into
`setI18nContext(i18n)` — so the constructor IS core's own `createI18n`,
re-exported by name. `I18n` is the class it instantiates; reach for it to type a
host you compose yourself, or to call `new I18n(options)` directly.

`.with(installer)` is core's composition pipe — `i18n.with(f)` is `f(i18n)`.
`loader(map)` attaches the capability **and** registers the map; for a plain
`LoaderFn`, compose `.with(attachLoader)` and call `registerLoader(fn)`
yourself (it keeps the import-map adapter out of your bundle).

### Default — text and `{param}` interpolation

```svelte
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";

  setI18nContext(createI18n({ locale: "en", translation: { en: { hello: "Hello" } } }));
</script>
```

### Inline catalogs with ICU — the `compiler` option

The constructor ingests `translation`, so the compiler has to be chosen in the
same call:

```svelte
<script lang="ts">
  import { createI18n, icuCompiler, setI18nContext } from "@comvi/svelte";

  const i18n = createI18n({
    locale: "en",
    compiler: icuCompiler,
    translation: {
      en: { messages: "{count, plural, one {# message} other {# messages}}" },
    },
  });

  setI18nContext(i18n);
</script>
```

### Remote catalogs with ICU — `.with(icu())` before ingestion

When the catalog arrives from a loader there is nothing to compile at
construction time, so install the compiler first. `icu()` is the installer half
of `@comvi/core/icu` and is re-exported here beside `icuCompiler`, so the whole
recipe stays inside the one import:

```svelte
<script lang="ts">
  import { createI18n, icu, loader, setI18nContext } from "@comvi/svelte";

  const i18n = createI18n({ locale: "en" })
    .with(icu())
    .with(loader({ uk: () => import("./uk.json") }));

  setI18nContext(i18n);
</script>
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any
catalog reaches the host — a constructor `translation`, an `addTranslations`
call, or a loader merge — and a later `icu()` throws with own
`code === "E_COMPILER_LOCKED"`. So `createI18n({ translation }).with(icu())` is
invalid by construction: pass `compiler: icuCompiler` there instead.

### Async loading — `loader()`

```svelte
<script lang="ts">
  import { createI18n, loader, setI18nContext, useI18nLoader } from "@comvi/svelte";

  const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
  setI18nContext(i18n);

  const { reloadTranslations } = useI18nLoader();
</script>
```

### Plugins — one `.with(installer)`

The three first-party plugin packages ship a lowercase **installer** beside the
uppercase factory. The installer composes the capabilities that plugin needs —
`fetchLoader` attaches `/loader`, then `/plugins` — and registers it, in one
call:

```svelte
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import { fetchLoader } from "@comvi/plugin-fetch-loader";

  const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(
    fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
  );

  setI18nContext(i18n);
</script>
```

The explicit form is that composition spelled out, and it is what you want when
you register plugins from a list. `loader()` goes on first when a plugin
registers a loader: plugins run at `init()`, and `registerLoader` has to exist by
then.

```svelte
<script lang="ts">
  import { createI18n, loader, plugins, setI18nContext } from "@comvi/svelte";
  import { FetchLoader } from "@comvi/plugin-fetch-loader";

  const i18n = createI18n({ locale: "en", defaultNs: "common" })
    .with(loader())
    .with(plugins());

  i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
  setI18nContext(i18n);
</script>
```

Swapping the two slots is a type error and loud at runtime:
`.use(fetchLoader(…))` throws at `init()` before any capability is attached.

### Devtools — `devtools()`

Browser-extension discovery (`instanceId`, the `window.__COMVI__` queue) is
opt-in too:

```svelte
<script lang="ts">
  import { createI18n, devtools, setI18nContext } from "@comvi/svelte";

  setI18nContext(createI18n({ locale: "en" }).with(devtools({ instanceId: "storefront" })));
</script>
```

These are **named** re-exports of core's own bindings, so the ones you do not
call are pruned. Two bundler-matrix cases hold that line, on webpack and vite,
in development and production: `svelte-default` calls no capability and asserts
all four subpath entries — icu, loader, plugins, devtools — out of the module
graph, while `svelte-icu` calls `icuCompiler`, formats a real plural from the
built bundle, and asserts the other three out.

`@comvi/core/tags` is deliberately not re-exported: importing it registers tag
syntax ambiently. `<T>` uses the pure `@comvi/core/rich-text` seam and does not
change string-API tag behavior. Unlike react, solid and vue, `svelte-package`
preserves modules, so `dist/T.svelte` is its own module: an app that never
renders `<T>` drops the whole rich-text path, and the one context key
`@comvi/svelte` sets is the same object no matter which module a component
imports it from.

### String-API tags render literally — the one residual

`t("Click <b>here</b>")` hands back that markup as text on the base host: tag
syntax is a grammar the host has to be taught, and no entry teaches it
ambiently. Development warns the first time; production stays literal and never
throws, because a literal `<b>` is visibly broken in review while a wrong plural
is not. Two ways out:

- render `<T>` — it passes the tag extension per call and needs no ambient
  registration at all (see [Rich text with `<T>`](#rich-text-with-t));
- `import "@comvi/core/tags";` once at your entry, if you want tag
  interpolation through `t()` itself. That import is the side effect
  `@comvi/svelte` will not hand you by re-exporting it.

## Rich text with `<T>`

Tag interpolation lets translators write readable markup like `"Click <link>here</link> for help"` without raw HTML or XSS risk. Map tags to standard HTML elements, Svelte components, or configs with props:

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "legal": "See our <policy>privacy policy</policy>."
}
```

```svelte
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<T
  i18nKey="help"
  components={{
    link: "a",    // Map to standard HTML tag
    bold: "strong",
    policy: { tag: "a", props: { href: "/privacy" } },
    // btn: FancyButton — Svelte components work too; they receive the tag
    // content as their `children` snippet
  }}
/>

<!-- Renders: "For support, <a>visit our docs</a> or <strong>email us</strong>." -->
<!-- policy becomes: <a href="/privacy">See our privacy policy</a> -->
```

The `<T>` component renders the translation structurally — real DOM nodes built from the parsed translation tree, with no HTML-string sink. Translators can only ever produce text and the tags you map; a tag without a mapping falls back to its inner text.

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales — those languages have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them — the same syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

**ICU is an explicit capability since 0.5.0.** The default compiler handles text
and `{param}` interpolation; a template with ICU syntax throws `E_ICU_SYNTAX`
rather than rendering plausible-but-wrong text. Every catalog below therefore
needs the ICU compiler on the host: `createI18n({ compiler: icuCompiler, … })`
for inline catalogs, `.with(icu())` before the loader for remote ones. Both
names come from `@comvi/svelte` — see
[One package, one entry](#one-package-one-entry).

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
t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count — grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
t("rank", { place: 1 }); // "1st"
t("rank", { place: 22 }); // "22nd"
t("rank", { place: 113 }); // "113th"
```

### Select (gender, role, status)

```json
{ "greeting": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
t("greeting", { gender: "female" }); // "Welcome, madam"
t("greeting", { gender: "male" }); // "Welcome, sir"
t("greeting", { gender: "other" }); // "Welcome"
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl` — reactive in your framework binding:

```svelte
<script lang="ts">
  import { useI18n } from "@comvi/svelte";

  const { t, locale, setLocale, formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();
  let itemCount = $state(5);
</script>

<!-- Plurals automatically match locale -->
<p>{$t("items", { count: itemCount })}</p>

<!-- Locale-aware formatting — automatically updates when locale changes -->
<p>Users: {formatNumber(1234.5)}</p>
<p>Total: {formatCurrency(99.99, "USD")}</p>
<p>Updated: {formatDate(new Date())}</p>
<p>Posted: {formatRelativeTime(-2, "hour")}</p>

<select value={$locale} onchange={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

With translation: `"items": "{count, plural, one {# item} other {# items}}"` and `itemCount = 5`, renders: `"5 items"`.

## Type-safe translation keys

Declare translation keys once to type the core API and framework bindings. In Svelte, `tRaw` keeps the typed overloads from core; `$t` is the string convenience store and accepts string keys.

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string }; // name param required
    greeting: never; // no params
    items: { count: number };
    "errors:NOT_FOUND": never;
  }
}
```

```svelte
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const { tRaw } = useI18n();

  // ✓ Compiles — params shape matches the declaration
  const welcome = $tRaw("welcome", { name: "Alice" });
</script>

<h1>{welcome}</h1>
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
$tRaw("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
$tRaw("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
$tRaw("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
$tRaw("typo", { name: "Alice" });
```

Auto-generate these types from the Comvi platform via `@comvi/cli` or from local JSON with `@comvi/vite-plugin`.

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import { fetchLoader } from "@comvi/plugin-fetch-loader";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  // The installer composes the loader capability, then the plugin host, then
  // registers the plugin — the order a loader-registering plugin needs.
  // CDN for production, API for dev/staging.
  const i18n = createI18n({ locale: "en" }).with(
    fetchLoader({
      cdnUrl: "https://cdn.comvi.io/your-distribution-id",
    }),
  );

  setI18nContext(i18n);
</script>

{@render children()}
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## SSR (SvelteKit)

For server-side rendering, create a **per-request** i18n instance — never share a module-level singleton across requests, or one user's locale will bleed into another's response.

Load the translations (which are serializable) in a `load` function, then construct the per-request instance in `+layout.svelte` from that data. A `load` function's return value crosses the server→client boundary and is serialized with `devalue`, so it must **not** return the i18n instance itself — a class instance can't be serialized and SvelteKit will throw. Return plain data and build the instance in the component, which runs once per request on the server and once on the client.

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch }) => {
  const locale = "en";
  // Fetch translations on the server — plain JSON, safe to serialize to the client
  const messages = await fetch(`https://cdn.comvi.io/your-distribution-id/${locale}.json`).then(
    (r) => r.json(),
  );
  return { locale, messages };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import type { Snippet } from "svelte";

  let { data, children }: {
    data: { locale: string; messages: Record<string, unknown> };
    children: Snippet;
  } = $props();

  // Per-request instance built from serializable load data — never a module singleton.
  // Seeded synchronously so translations are ready before the first render (no flash,
  // no hydration mismatch); the browser auto-init microtask would not complete in time.
  const i18n = createI18n({
    locale: data.locale,
    translation: { [data.locale]: data.messages },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

Child components call `useI18n()` as normal — the context carries the per-request instance.

> Prefer the runtime CDN/API loader (`@comvi/plugin-fetch-loader`) for client navigation? Keep the per-request `createI18n(...).with(fetchLoader(...))` in `+layout.svelte` and `await i18n.init()` inside an `$effect` / `onMount` for the client, while still seeding `translation` from `load` data for the initial server render. The rule is the same: only serializable data crosses `load`.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
