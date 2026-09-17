<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS bindings for Comvi i18n — provider, reactive primitives, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/solid"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/solid?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/solid` is the whole toolkit for a SolidJS app: it bundles `@comvi/core`, so one install is
enough. Translations are signals, so a locale change updates only what read it. Pair it with the
[Comvi platform](https://comvi.io) and the catalogs are fetched from the CDN at runtime instead of
bundled.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

📖 [Documentation](https://comvi.io/docs/i18n/solid)

## 1. Install

```bash
npm install @comvi/solid
# Peer: solid-js ^1.8.0
```

## 2. Quick start — an inline catalog

The smallest working app: `createI18n` builds the host, `locale` is what renders now,
`fallbackLocale` covers a missing key, `translation` is the catalog, and `<I18nProvider>` puts the
host where `useI18n()` can find it. Runnable: [`examples/solid`](../../examples/solid).

```tsx title="src/index.tsx"
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

```tsx title="src/App.tsx"
import { useI18n } from "@comvi/solid";

export default function App() {
  const { t } = useI18n();
  return <h1>{t("greeting", { name: "Alice" })}</h1>;
}
```

There is no `i18n.init()` call: `<I18nProvider>` initializes the host itself (`autoInit`, default on).

## 3. Connect to Comvi

Three questions, and the answers are the lines below. One limit first: server-side **loading** is
not supported yet — `<I18nProvider>` starts `init()` from a `createEffect`, which a server render
never runs, so a CDN catalog is absent from it. Keep the catalog inline for the server render, or
load on the client and gate with `fallback` ([limitations](https://comvi.io/docs/i18n/limitations)).

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

```tsx title="src/index.tsx"
import { render } from "solid-js/web";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

render(
  () => (
    <I18nProvider i18n={i18n} fallback={<div class="spinner" />}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

The URL in the snippet above is an example. `cdnUrl` is the whole URL the platform hands you:
open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved). Compose before `init()` — `<I18nProvider>` calls it for you, so compose in
the `createI18n` expression as above.

## 4. What is specific to Solid

- **Call `t()` inside a tracking scope.** `t()` and `tRaw()` read the locale and cache signals at
  call time, so they stay reactive only when invoked inside JSX, a `createMemo` or a
  `createEffect`. Reading the value once into a plain variable captures it forever.
- **`useI18n(ns?)`** hands back accessors, not values: `locale()`, `isLoading()`,
  `isInitializing()`, and `getTranslationCache()` where react and vue have a direct member. It does
  **not** carry the loader or plugin members: `useI18nLoader()` and `useI18nPlugins()` acquire
  those, and throw on a host that never composed them.
- **Per-axis primitives** subscribe a component to one signal; `useI18nHost()` reads the bare host.
- **`<T components={{ link: ({ children }) => <a href="/docs">{children}</a> }} />`** — Solid's
  shape is a function per tag, which avoids Solid's conditional branch caching pitfall. A plain tag
  name works too: `components={{ policy: "a" }}`.

## 5. Where to go next

- **This binding:** [guide](https://comvi.io/docs/i18n/solid) ·
  [API reference](https://comvi.io/docs/i18n/api/solid)
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
| base host + bindings, no `<T>` | `fw-solid-default` | 6591 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
