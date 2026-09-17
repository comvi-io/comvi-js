<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 5 bindings for Comvi i18n — context, stores, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/svelte"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/svelte?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/svelte` is the whole toolkit for a Svelte app: it bundles `@comvi/core`, so one install is
enough. There is no provider component — the host goes into Svelte's own context. Pair it with the
[Comvi platform](https://comvi.io) and the catalogs are fetched from the CDN at runtime instead of
bundled.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

📖 [Documentation](https://comvi.io/docs/i18n/svelte)

## 1. Install

```bash
npm install @comvi/svelte
# Peer: svelte ^5.3.0
```

Svelte 5 only: the bindings use runes.

## 2. Quick start — an inline catalog

The smallest working app: `createI18n` builds the host, `locale` is what renders now,
`fallbackLocale` covers a missing key, `translation` is the catalog, and `setI18nContext` puts the
host where `useI18n()` can find it. Runnable: [`examples/svelte`](../../examples/svelte).

```svelte title="src/routes/+layout.svelte"
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

```svelte title="src/routes/+page.svelte"
<script lang="ts">
  import { useI18n } from "@comvi/svelte";

  const { t } = useI18n();
</script>

<h1>{$t("greeting", { name: "Alice" })}</h1>
```

There is no `i18n.init()` call: `setI18nContext` initializes the host itself (`autoInit`, default
on). `$t` is a store, so `$`-prefix it in markup.

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
3. **What to paint meanwhile?** `isInitializing`, in the component that owns the children. The
   catalog is in flight during the first paint now, and Svelte has no provider component and no
   `fallback` prop, so the gate is `{#if $isInitializing}` and an `{:else}` beside it.

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { createI18n, icuCompiler, setI18nContext } from "@comvi/svelte";
  import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    compiler: icuCompiler,
  }).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

  setI18nContext(i18n);
</script>

{@render children()}
```

The catalogs now come from the platform, so `$t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

The URL in the snippet above is an example. `cdnUrl` is the whole URL the platform hands you:
open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved). Compose before `init()` — `setI18nContext` calls it for you, so compose in
the `createI18n` expression as above.

## 4. What is specific to Svelte

- **Everything reactive is a store**, so `$`-prefix it in markup: `$t`, `$locale`, `$isLoading`,
  `$isInitializing`. Seven store factories follow one axis each, and every setter writes through to
  the host, which stays the source of truth.
- **`setI18nContext(i18n, options?)`** takes the app-level `onError`. Init runs in a microtask, so
  nothing in the component can await it — that hook is how a failure becomes visible.
- **`useI18n(ns?)`** returns those stores plus `getTranslationCache()` where react and vue have a
  direct member. It does **not** carry the loader or plugin members: `useI18nLoader()` and
  `useI18nPlugins()` acquire those, and throw on a host that never composed them.
- **`<T components={{ link: "a" }} />`** — Svelte's shape is a tag name, a Svelte component, or a
  `{ tag, props }` config.

## 5. Where to go next

- **This binding:** [guide](https://comvi.io/docs/i18n/svelte) ·
  [API reference](https://comvi.io/docs/i18n/api/svelte)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) ·
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) ·
  [`docs/design/`](../../docs/design)

Measured min+gz through the published entry, gated in CI. Every fixture and the 0.4.1 comparison:
[bundle size](https://comvi.io/docs/i18n/bundle-size).

| app shape                      | measured as         | min+gz |
| ------------------------------ | ------------------- | ------ |
| base host + bindings, no `<T>` | `fw-svelte-default` | 6700 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
