<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/react</h1>

<p align="center">React binding for Comvi i18n — provider, hook, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/react"><img src="https://img.shields.io/npm/v/@comvi/react?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/react"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/react?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/react` wraps [`@comvi/core`](../core) for React. `<I18nProvider>` mounts an instance and auto-initializes it; `useI18n()` reads from it via `useSyncExternalStore`, so re-renders are precise and concurrent-mode safe. Requires React 18+.

Same `t()` and `<T>` API as the [Vue](../vue), [SolidJS](../solid), and [Svelte](../svelte) bindings — switch frameworks without relearning your i18n layer.

For Next.js App Router, use [`@comvi/next`](../next) — it adds SSR, middleware, and locale routing on top of this package.

📖 **Documentation:** https://comvi.io/docs/i18n/react/

⚖️ **Comparison:** [Comvi vs i18next](https://comvi.io/compare/i18next/)

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~6.6 kB minified + gzipped for a default app graph (measured, `react` externalized), zero runtime dependencies.** That is the base host plus the react bindings; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor` — one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/react?

- **Concurrent rendering safe.** Built on native `useSyncExternalStore` — no tearing, safe with Suspense, Time Slicing, and Transitions.
- **Efficient re-renders.** Selector hooks (`useLocale()`, `useIsLoading()`) let you skip updates on axes you don't need.
- **Provider auto-init.** Wrap your app in `<I18nProvider>` and it handles initialization automatically — no manual `i18n.init()` calls.

## Install

```bash
npm install @comvi/react
# Peer: react ^18.0.0 || ^19.0.0
```

Upgrading from v0.2.x? See the [CHANGELOG](./CHANGELOG.md).

## Quick start

```tsx
// main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

```tsx
// App.tsx
import { useI18n } from "@comvi/react";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

For `<T>` rich-text components, type-safe keys, fetch-loader integration, and the full hook API, see the [documentation](https://comvi.io/docs/i18n/react/).

## Error Boundaries

Wrap `<I18nProvider>` in an Error Boundary to handle initialization failures gracefully:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    /* ... */
  },
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div>Failed to load translations. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </ErrorBoundary>,
);
```

Alternatively, use a third-party Error Boundary library like [react-error-boundary](https://github.com/bvaughn/react-error-boundary).

## Selector hooks (new in v0.3)

For components that only need a slice of the i18n state, use these selector hooks to skip unnecessary re-renders.

### `useLocale()` — locale only

For routing, locale-aware UI, or anything that doesn't translate:

```tsx
import { useLocale } from "@comvi/react";

function FlagIcon() {
  const locale = useLocale();
  return <img src={`/flags/${locale}.svg`} alt={locale} />;
}
```

This hook skips re-renders on namespace loads and loading-state changes — only locale changes trigger updates.

### `useIsLoading()` — loading state only

For loading indicators and spinners:

```tsx
import { useIsLoading } from "@comvi/react";

function LoadingIndicator() {
  const { isLoading, isInitializing } = useIsLoading();
  if (!isLoading && !isInitializing) return null;
  return <div className="spinner" />;
}
```

Skips re-renders on translation cache updates.

### `useSetLocaleTransition()` — non-blocking locale switch

Wraps `setLocaleAsync()` in a React `useTransition`, so the current UI stays interactive while the new locale's translations load:

```tsx
import { useSetLocaleTransition } from "@comvi/react";

function LangSwitcher() {
  const { isPending, setLocale } = useSetLocaleTransition();
  return (
    <button onClick={() => setLocale("fr")} disabled={isPending}>
      {isPending ? "Loading…" : "Français"}
    </button>
  );
}
```

Returns `{ isPending, setLocale }` — `isPending` is `true` while the transition resolves.

### `useFormatters()` — locale-aware Intl formatters

Number/date/currency/relative-time formatters bound to the React-tracked locale (output updates automatically on locale change; identity is stable per `(i18n, locale)`):

```tsx
import { useFormatters } from "@comvi/react";

function Price({ amount }: { amount: number }) {
  const { formatCurrency } = useFormatters();
  return <p>{formatCurrency(amount, "USD")}</p>;
}
```

Provides `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime`.

## Using `useI18n()`

`useI18n()` returns the translation bag every host can serve: `{ i18n, locale, translationCache, isLoading, isInitializing, setLocale, t, tRaw, ... }`. It does **not** carry the loader/plugin members — see [Capability hooks](#capability-hooks-usei18nloader--usei18nplugins) below.

```tsx
import { useI18n } from "@comvi/react";

function MyComponent() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("hello")}</h1>
      <p>Current: {locale}</p>
      <button onClick={() => setLocale("uk")}>Українська</button>
    </>
  );
}
```

**Identity note:** In v0.3, `t` and `tRaw` identity changes on locale flip (intentional — the function now closes over the current locale). If you depend on their identity in `useEffect` dependencies, the effect will re-run when locale changes. For most code this is correct; if your effect should only run once, depend on the actual trigger instead.

**Deprecation note:** `useI18nContext()` was the v0.2 hook for the same purpose. It still works through v0.3 but will be removed in v0.4 — use `useI18n()` instead.

## Capability hooks: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities**, not part
of the translation core. Since 0.5.0 their members are acquired explicitly
rather than being handed out by `useI18n()`:

```tsx
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

function Namespaces() {
  const { t } = useI18n("admin");
  const { addActiveNamespace, reloadTranslations, onLoadError } = useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

Neither takes parameters — the namespace argument stays on `useI18n(ns)`. The
bag they return is referentially stable per host instance: two components under
one `<I18nProvider>` receive the same function references, and they survive
re-renders.

On a host that lacks the capability the acquisition call throws — in
development **and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
```

Migrating from 0.4.x: `pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`,
or the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Supported hosts and what they cost

`<I18nProvider i18n={…}>` accepts any `WrapperI18nHost` — `createI18n` from
`@comvi/react` (core's own base-host constructor, re-exported by name), with or
without `.with(loader())` / `.with(plugins())` composed on. The base host is the
cheap one: ICU, tag syntax, async loading, the plugin host and devtools
discovery are each something you compose, never something you carry by default.

Whole-app comvi graph, min+gz, `react` externalized (`node scripts/size-check.mjs`):

| app shape                         | size fixture              | min+gz      |
| --------------------------------- | ------------------------- | ----------- |
| base host, no `<T>`               | `fw-react-default`        | **6622 B**  |
| base host + `<T>`                 | `fw-react-default-t`      | **8501 B**  |
| base host + inline ICU            | `fw-react-icu`            | **7506 B**  |
| full explicit composition + `<T>` | `fw-react-full-composite` | **11156 B** |

All four rows are live in `scripts/size-budgets.json`, gated at measured +2%,
and sentinel-checked from the emitted module graph. The default is +90 B
(+1.38%) over the pre-convergence single-package anchor and 3432 B (34.1%)
below the historical 0.4 composed root. `<T>` adds the pure
`@comvi/core/rich-text` path; it does not register ambient string-API tags, and
its graph still excludes the tag-registration pair and unused capabilities.

## One package, one entry

`@comvi/react` is the whole toolkit: core's base host constructor and class, the
react bindings, and core's capability installers as **named** re-exports. One
entry, one build pass, one React context — a react app names one package and
nothing else, and no sibling entry exists whose `<I18nProvider>` could be
invisible to this one's `useI18n()`.

| export                                     | what it is                                      |
| ------------------------------------------ | ----------------------------------------------- |
| `createI18n`, `I18n`                       | core's base host — constructor and class        |
| `icuCompiler`, `icu`                       | from `@comvi/core/icu` — compiler and installer |
| `loader`, `attachLoader`, `flattenCatalog` | from `@comvi/core/loader`                       |
| `plugins`, `attachPlugins`                 | from `@comvi/core/plugins`                      |
| `devtools`, `attachDevtools`               | from `@comvi/core/devtools`                     |
| every hook, `I18nProvider`, `T`, the types | the react bindings                              |

`I18n` is the class `createI18n` instantiates — core's base one, not a react
subclass. Reach for it to type a host you compose yourself, or to call
`new I18n(options)` directly; the factory is the recommended form and takes the
same single options object.

`.with(installer)` is core's composition pipe — `i18n.with(f)` is `f(i18n)`.
`loader(map)` attaches the capability **and** registers the map; for a plain
`LoaderFn`, compose `.with(attachLoader)` and call `registerLoader(fn)`
yourself (it keeps the import-map adapter out of your bundle).

### Default — text and `{param}` interpolation

```tsx
import { createI18n, I18nProvider } from "@comvi/react";

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
import { createI18n, icuCompiler } from "@comvi/react";

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
import { createI18n, icu, loader } from "@comvi/react";

const i18n = createI18n({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any
catalog reaches the host — a constructor `translation`, an `addTranslations`
call, or a loader merge — and a later `icu()` throws with own
`code === "E_COMPILER_LOCKED"`. So `createI18n({ translation }).with(icu())` is
invalid by construction: pass `compiler: icuCompiler` there instead.

### Async loading — `loader()`

```tsx
import { createI18n, I18nProvider, loader, useI18nLoader } from "@comvi/react";

const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
// inside a component: const { reloadTranslations } = useI18nLoader();
```

### Plugins — one `.with(installer)`

The three first-party plugin packages ship a lowercase **installer** beside the
uppercase factory. The installer composes the capabilities that plugin needs —
`fetchLoader` attaches `/loader`, then `/plugins` — and registers it, in one
call:

```tsx
import { createI18n } from "@comvi/react";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
```

The explicit form is that composition spelled out, and it is what you want when
you register plugins from a list. `loader()` goes on first when a plugin
registers a loader: plugins run at `init()`, and `registerLoader` has to exist by
then.

```tsx
import { createI18n, loader, plugins } from "@comvi/react";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en", defaultNs: "common" }).with(loader()).with(plugins());

i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

Swapping the two slots is a type error and loud at runtime:
`.use(fetchLoader(…))` throws at `init()` before any capability is attached.

### Devtools — `devtools()`

Browser-extension discovery (`instanceId`, the `window.__COMVI__` queue) is
opt-in too:

```tsx
import { createI18n, devtools } from "@comvi/react";

const i18n = createI18n({ locale: "en" }).with(devtools({ instanceId: "storefront" }));
```

These are **named** re-exports of core's own bindings, so the ones you do not
call are pruned. Two bundler-matrix cases hold that line, on webpack and vite,
in development and production: `react-default` calls no capability and asserts
all four subpath entries — icu, loader, plugins, devtools — out of the module
graph, while `react-icu` calls `icuCompiler`, formats a real plural from the
built bundle, and asserts the other three out.

`@comvi/core/tags` is deliberately not re-exported: importing it registers tag
syntax ambiently. `<T>` uses the pure `@comvi/core/rich-text` seam in its own
dist chunk and does not change string-API tag behavior.

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
  `@comvi/react` will not hand you by re-exporting it.

## Rich text with `<T>`

Embed components inside translation strings without raw HTML, without unsafe DOM injection. Translators see clean markup; you control the rendering via the `components` prop.

```json
{ "help": "Click <link>here</link> for support, or <bold>read the docs</bold>." }
```

```tsx
import { T } from "@comvi/react";

export default function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        link: <a href="/help" />,
        bold: <strong />,
      }}
    />
  );
}
```

The `link` and `bold` elements are cloned with children injected automatically. Pass `tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you forgot to handle before they ship.

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales — those languages have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them — the same syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

ICU is opt-in on the base host: pass `compiler: icuCompiler` for the inline
catalogs below, or `.with(icu())` before a loader ingests a remote one. Both
names are re-exported from `@comvi/react` — see
[One package, one entry](#one-package-one-entry). Without a compiler the default
one never renders these templates as grammar: development throws
`E_ICU_SYNTAX` at ingestion, and production renders the braced segment
literally and reports `E_ICU_SYNTAX` through `onError` (or `console.error`) on
the compilation that hit it — best-effort, per process, never on cached
renders.

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

```tsx
import { useI18n } from "@comvi/react";

function Stats() {
  const { t, formatNumber, formatCurrency, formatRelativeTime } = useI18n();

  // Locale-aware plurals
  const items = t("items", { count: 5 });

  return (
    <div>
      <p>{items}</p>
      <p>Total: {formatCurrency(1234.56, "USD")}</p>
      <p>Growth: {formatNumber(1.25, { style: "percent" })}</p>
      <p>Posted {formatRelativeTime(-2, "hour")}</p>
    </div>
  );
}
```

Switching locale via `setLocale()` triggers re-renders through `useSyncExternalStore` — formatters always reflect the current language.

## Type-safe translation keys

Declaration merging on `TranslationKeys` provides autocomplete and parameter validation per key. Generated automatically via `@comvi/cli` (TMS) or `@comvi/vite-plugin` (local JSON).

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

```tsx
import { useI18n } from "@comvi/react";

function Welcome() {
  const { t } = useI18n();

  // ✓ Autocomplete works, params required
  const msg = t("welcome", { name: "Alice" });

  // ✓ No params needed
  const greeting = t("greeting");

  // ✓ Namespaced keys use the ns option
  const notFound = t("NOT_FOUND", { ns: "errors" });

  return <h1>{msg}</h1>;
}
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
t("typo", { name: "Alice" });
```

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import { fetchLoader } from "@comvi/plugin-fetch-loader";
import App from "./App";

// CDN for production, API for dev/staging
const i18n = createI18n({
  locale: "en",
  defaultNs: "common",
}).with(
  fetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
  }),
);

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
