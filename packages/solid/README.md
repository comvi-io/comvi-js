<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS binding for Comvi i18n — provider, reactive signals, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/solid"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/solid?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/solid` wraps [`@comvi/core`](../core) for SolidJS. `<I18nProvider>` mounts an instance; `useI18n()` returns reactive signals that integrate with Solid's fine-grained reactivity. Signals are functions, so call `locale()` to read the value.

Same `t()` and `<T>` API as the [Vue](../vue), [React](../react), and [Svelte](../svelte) bindings, so switching frameworks doesn't mean relearning your i18n layer.

📖 **Documentation:** https://comvi.io/docs/i18n/solid/

## Why Comvi i18n?

Comvi i18n is a framework-agnostic internationalization library with type-safe translations, real ICU MessageFormat, and a small bundle that stays safe under a strict CSP.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`). Translators see clean markup, and you decide what each tag renders to. No raw HTML, no unsafe DOM injection, and no splitting a sentence across template fragments.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar via `Intl.PluralRules`, including Polish, Ukrainian, Arabic, Welsh and the rest. It is the same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~6.3 kB minified + gzipped for a default app graph (measured, `solid-js` externalized), zero runtime dependencies.** That is the base host plus the solid bindings; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere, so it runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`, one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt), so switching frameworks doesn't mean relearning your i18n layer.

## Why @comvi/solid?

- **Fine-grained reactivity.** `useI18n()` returns signals and reactive primitives, so only components that read a specific value re-run. No prop drilling.
- **Function-based `<T>` component.** Avoids Solid's conditional branch caching pitfalls by using functions for tag rendering instead of components.
- **Direct signal access.** Export utility functions like `createLocaleSignal()` and `createLoadingSignal()` for advanced patterns that need lower-level reactivity primitives.

## Install

```bash
npm install @comvi/solid
# Peer: solid-js ^1.8.0
```

## Quick start

```tsx
// index.tsx
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

render(
  () => (
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

```tsx
// App.tsx
import { useI18n } from "@comvi/solid";
import { createSignal } from "solid-js";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale()} onChange={(e) => setLocale(e.currentTarget.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

For `<T>` rich-text components, type-safe keys, and the full reactive primitives, see the [documentation](https://comvi.io/docs/i18n/solid/).

## From the Comvi CDN

Translations served by the Comvi platform, fetched at runtime instead of bundled:

```tsx
// index.tsx
import { render } from "solid-js/web";
import { createI18n, icu, I18nProvider } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" })
  .with(icu())
  .with(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

render(
  () => (
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

`icu()` must be composed before the first catalog reaches the host, so it comes
ahead of the loader. That is the library's only ordering rule; drop
`icu()` if the project uses no plural/select.

There is no `i18n.init()` call here because `<I18nProvider>` initializes the
host itself (`autoInit`, on by default). The first paint therefore happens while
the catalog is still in flight, so gate it on the `isLoading()` signal from
`useI18n()`.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project
and read it off the **Distributions** page.

### Reactivity caveat — call `t()` inside a tracking scope

`t()` and `tRaw()` read the locale and cache signals **at call time**, so they only stay reactive when invoked inside a tracking scope (JSX, `createMemo`, or `createEffect`). Reading the value once into a plain variable captures it forever:

```tsx
import { useI18n } from "@comvi/solid";

// ✗ WRONG — frozen. `greeting` is computed once and never updates on locale change.
function Greeting() {
  const { t } = useI18n();
  const greeting = t("greeting", { name: "Alice" });
  return <h1>{greeting}</h1>;
}
```

```tsx
import { useI18n } from "@comvi/solid";

// ✓ RIGHT — call t() inline so it re-runs when the locale or translations change.
function Greeting() {
  const { t } = useI18n();
  return <h1>{t("greeting", { name: "Alice" })}</h1>;
}
```

If you need a derived value, wrap it in a memo: `const greeting = createMemo(() => t("greeting", { name: "Alice" }))`, then read `greeting()`. (Coming from React/Vue, where `const g = t(...)` works because the whole component re-renders: Solid does not re-render, so the call must stay in a tracked position.)

## Capability APIs: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities** rather than
part of the translation core. Since 0.5.0 you acquire their members explicitly
instead of getting them from `useI18n()`:

```tsx
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/solid";

function Namespaces() {
  const { t } = useI18n("admin");
  const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
    useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

They are plain accessors under the provider, **not signals**. A capability
action is an imperative operation, not a reactive value. Neither takes
parameters; the namespace argument stays on `useI18n(ns)`. The bag is
referentially stable per host instance, so two components under one
`<I18nProvider>` receive the same function references.

On a host that lacks the capability the acquisition call throws, in
development **and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
```

Migrating from 0.4.x: `pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`,
or the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Supported hosts and what they cost

`<I18nProvider i18n={…}>`, `useI18nContext()` and all six reactive primitives
accept any `WrapperI18nHost`: `createI18n` from `@comvi/solid` (core's own
base-host constructor, re-exported by name), with or without `.with(loader())` /
`.with(plugins())` composed on. The base host is the cheap one. ICU, tag syntax,
async loading, the plugin host and devtools discovery are each something you
compose, and you carry none of them by default.

Whole-app comvi graph, min+gz, `solid-js` externalized (`node scripts/size-check.mjs`):

| app shape                         | size fixture              | min+gz      |
| --------------------------------- | ------------------------- | ----------- |
| base host, no `<T>`               | `fw-solid-default`        | **6336 B**  |
| base host + `<T>`                 | `fw-solid-default-t`      | **8131 B**  |
| base host + inline ICU            | `fw-solid-icu`            | **7222 B**  |
| full explicit composition + `<T>` | `fw-solid-full-composite` | **10791 B** |

All four rows are live in `scripts/size-budgets.json`, gated at measured +2%,
and sentinel-checked from the emitted module graph. The default is +100 B
(+1.60%) over the pre-convergence single-package anchor and 3437 B (35.2%)
below the historical 0.4 composed root, which measured 9773 B. `<T>` adds the
pure `@comvi/core/rich-text` path; it does not register ambient string-API tags,
and its graph still excludes the tag-registration pair and unused capabilities.

## One package, one entry

`@comvi/solid` is the whole toolkit: core's base host constructor and class, the
solid bindings, and core's capability installers as **named** re-exports. One
entry, one build pass, one solid context. A solid app names one package and
nothing else, and no sibling entry exists whose `<I18nProvider>` could be
invisible to this one's `useI18n()`.

| export                                          | what it is                                     |
| ----------------------------------------------- | ---------------------------------------------- |
| `createI18n`, `I18n`                            | core's base host: constructor and class        |
| `icuCompiler`, `icu`                            | from `@comvi/core/icu`: compiler and installer |
| `loader`, `attachLoader`, `flattenCatalog`      | from `@comvi/core/loader`                      |
| `plugins`, `attachPlugins`                      | from `@comvi/core/plugins`                     |
| `devtools`, `attachDevtools`                    | from `@comvi/core/devtools`                    |
| every primitive, `I18nProvider`, `T`, the types | the solid bindings                             |

`I18n` is the class `createI18n` instantiates: core's base one, not a solid
subclass. Reach for it to type a host you compose yourself, or to call
`new I18n(options)` directly; the factory is the recommended form and takes the
same single options object.

`.with(installer)` is core's composition pipe: `i18n.with(f)` is `f(i18n)`.
`loader(map)` attaches the capability **and** registers the map; for a plain
`LoaderFn`, compose `.with(attachLoader)` and call `registerLoader(fn)`
yourself (it keeps the import-map adapter out of your bundle).

### Default — text and `{param}` interpolation

```tsx
import { createI18n, I18nProvider } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { hello: "Hello, {name}!" } },
});

<I18nProvider i18n={i18n}>…</I18nProvider>;
```

### Inline catalogs with ICU — the `compiler` option

The constructor ingests `translation`, so the compiler has to be chosen in the
same call:

```tsx
import { createI18n, icuCompiler } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  compiler: icuCompiler,
  translation: {
    en: { messages: "{count, plural, one {# message} other {# messages}}" },
  },
});
```

### Remote catalogs with ICU — `.with(icu())` before ingestion

When the catalog arrives from a loader there is nothing to compile at
construction time, so install the compiler first. `icu()` is the installer half
of `@comvi/core/icu` and is re-exported here beside `icuCompiler`, so the whole
recipe stays inside the one import:

```tsx
import { createI18n, icu, loader } from "@comvi/solid";

const i18n = createI18n({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any
catalog reaches the host: a constructor `translation`, an `addTranslations`
call, or a loader merge. A later `icu()` throws with own
`code === "E_COMPILER_LOCKED"`. So `createI18n({ translation }).with(icu())` is
invalid by construction: pass `compiler: icuCompiler` there instead.

### Async loading — `loader()`

```tsx
import { createI18n, I18nProvider, loader, useI18nLoader } from "@comvi/solid";

const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
// inside a component: const { reloadTranslations } = useI18nLoader();
```

### Plugins — one `.with(installer)`

The three first-party plugin packages ship a lowercase **installer** beside the
uppercase factory. The installer composes the capabilities that plugin needs
(`cdnLoader` attaches `/loader`, then `/plugins`) and registers it, in one
call:

```tsx
import { createI18n } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
```

The explicit form is that composition spelled out, and it is what you want when
you register plugins from a list. Compose `loader()` as well when a plugin
registers one. The order of `loader()`, `plugins()` and `devtools()` among
themselves is free, because plugins run at `init()` and every capability
composed before `init()` is attached by then.

```tsx
import { createI18n, loader, plugins } from "@comvi/solid";
import { CdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(loader()).with(plugins());

i18n.use(CdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

Swapping the two slots is a type error and loud at runtime:
`.use(cdnLoader(…))` throws at `init()` before any capability is attached.

### Devtools — `devtools()`

Browser-extension discovery (`instanceId`, the `window.__COMVI__` queue) is
opt-in too:

```tsx
import { createI18n, devtools } from "@comvi/solid";

const i18n = createI18n({ locale: "en" }).with(devtools({ instanceId: "storefront" }));
```

These are **named** re-exports of core's own bindings, so the ones you do not
call are pruned. Two bundler-matrix cases hold that line, on webpack and vite,
in development and production: `solid-default` calls no capability and asserts
all four subpath entries (icu, loader, plugins, devtools) out of the module
graph, while `solid-icu` calls `icuCompiler`, formats a real plural from the
built bundle, and asserts the other three out.

`@comvi/core/tags` is not re-exported, because importing it registers tag
syntax ambiently. `<T>` uses the pure `@comvi/core/rich-text` seam in its own
dist chunk and does not change string-API tag behavior.

### String-API tags render literally — the one residual

`t("Click <b>here</b>")` hands back that markup as text on the base host: tag
syntax is a grammar the host has to be taught, and no entry teaches it
ambiently. Development warns the first time; production stays literal and never
throws, because a literal `<b>` is visibly broken in review while a wrong plural
is not. Two ways out:

- render `<T>`, which passes the tag extension per call and needs no ambient
  registration at all (see [Rich text with `<T>`](#rich-text-with-t));
- `import "@comvi/core/tags";` once at your entry, if you want tag
  interpolation through `t()` itself. That import is the side effect
  `@comvi/solid` will not hand you by re-exporting it.

## Rich text with `<T>`

Tag interpolation lets translators write readable markup like `"Click <link>here</link> for help"` without raw HTML or XSS risk. You decide what each tag renders to: a function that receives the tag's content as children JSX.

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "privacy": "We take privacy seriously. <policy>Read our policy</policy>."
}
```

```tsx
import { T } from "@comvi/solid";

function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        // Each component is a function, not a Solid component.
        // This avoids Solid's conditional branch caching pitfall.
        link: ({ children }) => <a href="/docs">{children}</a>,
        bold: ({ children }) => <strong>{children}</strong>,
      }}
    />
  );
}

// Renders: "For support, <a href="/docs">visit our docs</a> or <strong>email us</strong>."
```

You can also map to plain HTML tags:

```tsx
import { T } from "@comvi/solid";

const privacy = <T i18nKey="privacy" components={{ policy: "a" }} />;
// Renders: <a>Read our policy</a>
```

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales, which have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them, and it is the syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

ICU is opt-in on the base host: pass `compiler: icuCompiler` for the inline
catalogs below, or `.with(icu())` before the first remote catalog reaches the
host. Both names are re-exported from `@comvi/solid`; see
[One package, one entry](#one-package-one-entry). Without a compiler the default
one never renders these templates as grammar: development throws
`E_ICU_SYNTAX` at ingestion, and production renders the braced segment
literally and reports `E_ICU_SYNTAX` through `onError` (or `console.error`) on
the compilation that hit it. That report is best-effort, once per process, and
never fires on cached renders.

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

```tsx
import { useI18n } from "@comvi/solid";

function Inbox() {
  const { t } = useI18n();

  t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
  t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
  t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
  t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
}
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count, which is grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```tsx
import { useI18n } from "@comvi/solid";

function Leaderboard() {
  const { t } = useI18n();

  t("rank", { place: 1 }); // "1st"
  t("rank", { place: 22 }); // "22nd"
  t("rank", { place: 113 }); // "113th"
}
```

### Select (gender, role, status)

```json
{ "salutation": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```tsx
import { useI18n } from "@comvi/solid";

function Greeter() {
  const { t } = useI18n();

  t("salutation", { gender: "female" }); // "Welcome, madam"
  t("salutation", { gender: "male" }); // "Welcome, sir"
  t("salutation", { gender: "other" }); // "Welcome"
}
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl`, and are reactive in your framework binding:

```tsx
import { createSignal } from "solid-js";
import { useI18n } from "@comvi/solid";

function Dashboard() {
  const { t, formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();
  const [itemCount, setItemCount] = createSignal(5);

  return (
    <>
      {/* Plurals automatically match locale */}
      <p>{t("items", { count: itemCount() })}</p>

      {/* Locale-aware formatting — switches when locale changes */}
      <p>Users: {formatNumber(1234.5)}</p>
      <p>Total: {formatCurrency(99.99, "USD")}</p>
      <p>Updated: {formatDate(new Date())}</p>
      <p>Posted: {formatRelativeTime(-2, "hour")}</p>
    </>
  );
}
```

With translation: `"items": "{count, plural, one {# item} other {# items}}"`, locale `"en"`, and `itemCount = 5`, renders: `"5 items"`.

## Type-safe translation keys

Declare translation keys once, get autocomplete and parameter validation everywhere:

```typescript check=group=typed-keys
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string }; // name param required
    greeting: { name: string };
    salutation: { gender: string };
    help: never;
    privacy: never;
    items: { count: number };
    messages: { count: number };
    rank: { place: number };
    "errors:NOT_FOUND": never; // no params
  }
}
```

```tsx check=group=typed-keys
import { useI18n } from "@comvi/solid";

function App() {
  const { t } = useI18n();

  // ✓ Compiles — params shape matches the declaration
  return <h1>{t("welcome", { name: "Alice" })}</h1>;
}
```

**What TypeScript catches:**

```ts check=group=typed-keys check=expect-error=TS2345
import { useI18n } from "@comvi/solid";
const { t } = useI18n();

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2769
import { useI18n } from "@comvi/solid";
const { t } = useI18n();

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
t("typo", { name: "Alice" });
```

Auto-generate these types from the Comvi platform via `@comvi/cli` or from local JSON with `@comvi/vite-plugin`.

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from the platform, with no redeploy needed to ship a translation. `cdnLoader` from `@comvi/plugin-fetch-loader/cdn` reads a public distribution; swap it for `fetchLoader` from the package root, and pass `apiKey` as a host option, when the app also reads the authenticated API:

```tsx
import { createI18n, I18nProvider } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({
  locale: "en",
  defaultNs: "common",
}).with(
  cdnLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
  }),
);

export default function App() {
  return <I18nProvider i18n={i18n}>…</I18nProvider>;
}
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## Server-Side Rendering

`@comvi/solid` is **client-side rendering (CSR) only** today. `<I18nProvider>` auto-initializes the instance from a `createEffect`, which does not run during Solid's server render (`renderToString`), so translations are not initialized on the server. The reactive primitives populate on the client once the component mounts.

If you render with SolidStart or another SSR setup, initialize and load translations on the client and gate UI on `isInitialized()` / `isLoading()` from `useI18n()` to avoid a flash of untranslated keys. Server-side translation resolution and hydration are not yet supported. Track progress in the [issues](https://github.com/comvi-io/comvi-js/issues).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
