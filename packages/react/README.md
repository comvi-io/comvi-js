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
rendering. Pair it with the [Comvi platform](https://comvi.io) and the catalogs are fetched from the
CDN at runtime instead of bundled.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

📖 [Documentation](https://comvi.io/docs/i18n/react) · ⚖️ [Comvi vs i18next](https://comvi.io/compare/i18next)

## 1. Install

```bash
npm install @comvi/react
# Peer: react ^18.0.0 || ^19.0.0
```

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

## 2. Quick start — an inline catalog

The smallest working app: `createI18n` builds the host, `locale` is what renders now,
`fallbackLocale` covers a missing key, `translation` is the catalog, and `<I18nProvider>` puts the
host where `useI18n()` can find it. Runnable: [`examples/react`](../../examples/react).

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
  const { t } = useI18n();
  return <h1>{t("greeting", { name: "Alice" })}</h1>;
}
```

There is no `i18n.init()` call: `<I18nProvider>` initializes the host itself (`autoInit`, default on).

## 3. Connect to Comvi

Three questions, and the answers are the lines below.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) fails in development at ingestion, before anything renders. Inline, it
   throws `E_ICU_SYNTAX` at the call that carries the catalog; over a loader it fails that
   namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and
   `init()` rejects with `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when
   that was the only namespace. In production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn` (a second
   install), which fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** A **`fallback`** on `<I18nProvider>`. The catalog is in flight
   during the first paint now, and the provider gates its children until the host is initialized.

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

`cdnUrl` is the whole URL the platform hands you: open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved). Compose before `init()` — `<I18nProvider>` calls it for you, so compose in
the `createI18n` expression as above.

## 4. What is specific to React

- **`<I18nProvider>`** takes `i18n`, `fallback`, `autoInit` and `ssrLocale`. `fallback` gates on
  `isInitialized`, not `isInitializing`, so the frame that would paint raw keys is covered.
- **`useI18n(ns?)`** returns the translation bag plus the four `Intl` formatters, which follow the
  React-tracked locale. It does **not** carry the loader or plugin members: `useI18nLoader()` and
  `useI18nPlugins()` acquire those, and throw on a host that never composed them.
- **Selector hooks** for one slice of the state: `useLocale()`, `useIsLoading()`,
  `useSetLocaleTransition()`, `useFormatters()`, `useI18nHost()` for the bare host.
- **`<T components={{ link: <a href="/help" /> }} />`** — React's shape is elements to clone, and
  children are injected for you.

## 5. Where to go next

- **This binding:** [guide](https://comvi.io/docs/i18n/react) ·
  [API reference](https://comvi.io/docs/i18n/api/react)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) ·
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) ·
  [`docs/design/`](../../docs/design)

Measured min+gz through the published entry, gated in CI. Every fixture and the 0.4.1 comparison:
[bundle size](https://comvi.io/docs/i18n/bundle-size).

| app shape                      | measured as        | min+gz |
| ------------------------------ | ------------------ | ------ |
| base host + bindings, no `<T>` | `fw-react-default` | 6902 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
