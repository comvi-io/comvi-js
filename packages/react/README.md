<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/react</h1>

<p align="center">React bindings for Comvi i18n — provider, hooks, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/react"><img src="https://img.shields.io/npm/v/@comvi/react?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/react"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/react?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/react` is the whole toolkit for a React app: it bundles `@comvi/core`, so one install is
enough. Built on `useSyncExternalStore`, so it is safe with Suspense, transitions and concurrent
rendering.

Throughout this README, **the host** is the i18n instance `createI18n` returns.

📖 [Documentation](https://comvi.io/docs/i18n/react/) ·
⚖️ [Comvi vs i18next](https://comvi.io/compare/i18next/)

## 1. Install

```bash
npm install @comvi/react
# Peer: react ^18.0.0 || ^19.0.0
```

## 2. Quick start — an inline catalog

The smallest working app. Five things to know: `createI18n` builds the host, `locale` is what
renders now, `fallbackLocale` covers a missing key, `translation` is the catalog, and
`<I18nProvider>` puts the host where `useI18n()` can find it.

Runnable version: [`examples/react`](../../examples/react).

```tsx title="src/main.tsx"
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

```tsx title="src/App.tsx"
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

There is no `i18n.init()` call: `<I18nProvider>` initializes the host itself (`autoInit`, on by
default).

## 3. Connect to Comvi

Two additions to the host, and nothing else changes:

1. **`compiler: icuCompiler`.** The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production, so name it once here and it
   covers every catalog the host ever ingests.
2. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which fetches the
   catalog at runtime instead of bundling it.

The catalog is now in flight during the first paint, so pass a **`fallback`** to gate it.

```bash
npm install @comvi/plugin-fetch-loader
```

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page. Compose before `init()` — `<I18nProvider>` calls it for you, so compose in
the `createI18n` expression as above.

## 4. React API reference

### `<I18nProvider>` props

| prop                       | type                     | what it does                                                                 |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `i18n`                     | the host                 | required                                                                     |
| `children`                 | `ReactNode`              | required                                                                     |
| `autoInit`                 | `boolean`                | calls `i18n.init()` for you; default `true`                                  |
| `fallback`                 | `ReactNode`              | rendered instead of children until the host is initialized                   |
| `ssrLocale`                | `string`                 | the locale the server snapshot renders in                                    |
| `ssrInitialLocale`         | `string`                 | react's legacy name for `ssrLocale`; wins if both are passed. Removed in 0.6 |
| `ssrInitialIsInitializing` | `boolean`                | whether the server render is gated by `fallback`; default `false`            |
| `ssrInitialIsLoading`      | `boolean`                | the initial loading state for hydration                                      |
| `onError`                  | `(error: Error) => void` | initialization failures                                                      |

**`fallback` gates on `isInitialized`, not `isInitializing`.** `init()` starts from an effect, after
the first render, so a gate on "is it initializing" is open for exactly the frame the raw keys would
paint in. With `autoInit: false` the fallback stays until your app calls `i18n.init()` itself. Both
branches render inside the provider, so the fallback may use the hooks. Omit the prop and children
render throughout. For a blank gate rather than a spinner, pass `false`.

### `useI18n()`

Returns the translation bag every host can serve: `{ t, tRaw, locale, translationCache,
cacheRevision, isLoading, isInitializing, isInitialized, setLocale, ... }` plus the four `Intl`
formatters, which here follow the React-tracked locale. The same member names as `@comvi/solid`,
`@comvi/svelte` and `@comvi/vue`, so a component reads alike across bindings.

It does **not** carry the loader or plugin members — see the capability hooks below.

`useI18n("admin")` binds the namespace at the type level too: with generated keys, `t("dashboard")`
is exact for `admin:dashboard`, and a key from another namespace is rejected.

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

`t` and `tRaw` change identity on a locale flip, because they close over the current locale. If an
effect depends on their identity it re-runs on a locale change; depend on the underlying trigger
instead if that is wrong for you.

### Selector hooks

For a component that needs one slice of the state and should not re-render on the others.

| hook                       | returns                                                              | skips re-renders on                          |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `useLocale()`              | the locale string                                                    | namespace loads, loading-state changes       |
| `useIsLoading()`           | `{ isLoading, isInitializing }`                                      | translation-cache updates                    |
| `useSetLocaleTransition()` | `{ isPending, setLocale }` — wraps `setLocaleAsync` in a transition  | —                                            |
| `useFormatters()`          | `formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime` | cache updates; identity is stable per locale |

```tsx
import { useFormatters, useIsLoading, useLocale } from "@comvi/react";

function FlagIcon() {
  const locale = useLocale();
  return <img src={`/flags/${locale}.svg`} alt={locale} />;
}

function Spinner() {
  const { isLoading, isInitializing } = useIsLoading();
  return isLoading || isInitializing ? <div className="spinner" /> : null;
}

function Price({ amount }: { amount: number }) {
  const { formatCurrency } = useFormatters();
  return <p>{formatCurrency(amount, "USD")}</p>;
}
```

### `useI18nHost()`

Returns the bare host the nearest `<I18nProvider>` holds — the same name in `@comvi/solid` and
`@comvi/svelte` (vue's equivalent is `inject(I18N_INJECTION_KEY).core`). It is not reactive: read it
for an imperative call, and pair it with `useI18n()` or a selector hook when the render must follow
the host.

```tsx
import { useI18nHost } from "@comvi/react";

function Debug() {
  const host = useI18nHost();
  return <pre>{host.getLoadedLocales().join(", ")}</pre>;
}
```

`useI18nContext()` is the deprecated 0.2 spelling of the same reader; it re-renders on every axis.

### `useI18nLoader()` and `useI18nPlugins()`

Async loading and the plugin host are **capabilities**: things the host has only once you compose
them. You acquire their members explicitly rather than getting them from `useI18n()`.

```tsx
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/react";

function Namespaces() {
  const { t } = useI18n("admin");
  const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
    useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

Neither takes parameters; the namespace argument stays on `useI18n(ns)`. What they return is
referentially stable per host instance, so two components under one provider get the same function
references. On a host that never composed the capability the acquisition call throws, in development
**and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).
```

### Rich text with `<T>`

Embed components inside a translation without raw HTML and without splitting the sentence across
template fragments. Translators see clean markup; the `components` prop decides what each tag
renders to. React's shape is **elements to clone** — children are injected for you.

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

A map built outside the JSX is typed as `ComponentMap` (the same name in all four bindings). Pass
`tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you
forgot to handle before they ship.

`<T skipPostProcess>` skips post-processors for that one call — notably the in-context editor's
invisible markers. `raw` is the same prop under its old 0.4 name: it still works, warns once in
development, and is removed in 0.6; a
[codemod](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md#3-the-codemod) rewrites it.

`<T>` never changes what `t()` does with `<b>` markup — it renders through the pure
`@comvi/core/rich-text` path. Making `t()` itself parse tags is a separate opt-in:
`import "@comvi/core/tags"` once, which registers the grammar process-wide. Until then
`t("Click <b>here</b>")` hands that markup back as text and development warns once per template.

### Reference: composing by hand

`@comvi/react` re-exports core's capability installers **by name**, so an app names one package and
the ones you never call are pruned from your bundle: `createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `definePlugin`, `devtools`, and `I18n` as a type.

`loader(map)` attaches the loader capability **and** registers the map, so it needs its map; a bare
`loader()` is a compile error. For a plain loader function, compose `attachLoader` and register it
yourself, which also keeps the import-map adapter out of your bundle:

```tsx
import { attachLoader, createI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

Your own inline plugin goes in through `definePlugin`, which composes the plugin host and registers
the function in one call. Browser-extension discovery is `devtools({ instanceId })`. The low-level
`attachPlugins` / `attachDevtools` pair is not re-exported here; import it from
`@comvi/core/plugins` / `@comvi/core/devtools`.

Full reasoning: [docs/design/composition.md](../../docs/design/composition.md).

## 5. Server-side rendering

React has no SSR entry of its own, so whether the host may live at module scope is the host
framework's rule, not react's. For Next.js use [`@comvi/next`](../next), which requires a
module-scope host and passes the request locale explicitly.

What react contributes is two props that make a server render and its hydration agree:

- **`ssrLocale`** is the locale the server snapshot renders in. Pass it on both sides. It is the name
  `@comvi/vue`, `@comvi/solid` and `@comvi/nuxt` use, so one shared SSR layer passes one name to
  every binding. `ssrInitialLocale` is react's legacy alias for it.
- **`ssrInitialIsInitializing`** decides whether the server render is gated by `fallback`, and is
  `false` by default — so a server render that already produced real text is never gated, and the
  hydration render matches it. For a server render with no catalog yet, whose markup would ship raw
  keys, pass `ssrInitialIsInitializing={true}` alongside `fallback`.

```tsx
import type { ReactNode } from "react";
import { I18nProvider } from "@comvi/react";
import { i18n } from "./i18n";

export function Document({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n} ssrLocale={locale}>
      {children}
    </I18nProvider>
  );
}
```

The four frameworks' module-scope rules side by side, including the one that inverts:
[docs/design/ssr.md](../../docs/design/ssr.md). The cross-framework SSR guide on the site is at
[comvi.io/docs/i18n/guides/ssr/](https://comvi.io/docs/i18n/guides/ssr/).

## 6. Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key. One
augmentation serves every binding, generated by [`@comvi/cli`](../cli) from the platform or
[`@comvi/vite-plugin`](../vite-plugin) from local JSON. The declaration, the examples and what
TypeScript catches are in the
[root README](https://github.com/comvi-io/comvi-js#typed-translation-keys).

## 7. What it weighs

Measured min+gz through the published exports map, `react` externalized, and gated in
[`scripts/size-budgets.json`](../../scripts/size-budgets.json) at the recorded baseline + 5 %. Each
row is also sentinel-checked against the emitted module graph, so "an unused re-export costs
nothing" is a gate rather than a sentence.

| app shape                             | fixture                   | min+gz  |
| ------------------------------------- | ------------------------- | ------- |
| base host + bindings, no `<T>`        | `fw-react-default`        | 6902 B  |
| every capability composed, with `<T>` | `fw-react-full-composite` | 11571 B |
| base host + ICU + the CDN loader      | `platform-path-react`     | 10793 B |

## 8. Where to go next

- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** `pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, then
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
- **Full API:** [comvi.io/docs/i18n/react/](https://comvi.io/docs/i18n/react/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
