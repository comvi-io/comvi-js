<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/core</h1>

<p align="center">The framework-agnostic runtime behind Comvi i18n — the host, <code>t()</code>, and the capability pipe.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/core` is the runtime every Comvi i18n binding is built on. If you use
[`@comvi/vue`](../vue), [`@comvi/react`](../react), [`@comvi/solid`](../solid),
[`@comvi/svelte`](../svelte), [`@comvi/next`](../next) or [`@comvi/nuxt`](../nuxt), you already have
it — install this package directly for vanilla JS, Node, a worker, or a custom integration. Pair it
with the [Comvi platform](https://comvi.io) and the catalogs are fetched from the CDN at runtime
instead of bundled.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

Zero runtime dependencies, and no `eval` or `new Function` anywhere, so it runs under a strict CSP
without `unsafe-eval`.

📖 [Documentation](https://comvi.io/docs/i18n/vanilla) · ⚖️ [Comvi vs i18next](https://comvi.io/compare/i18next)

## 1. Install

```bash
npm install @comvi/core
# Node 20 or newer. No peer dependencies.
```

## 2. Quick start — an inline catalog

The smallest working script: `createI18n` builds the host, `locale` is what renders now,
`fallbackLocale` covers a missing key, `translation` is the catalog, and `init()` readies the host
before the first `t()`. Runnable: [`examples/vanilla`](../../examples/vanilla).

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"

i18n.locale = "uk";
i18n.t("greeting", { name: "Аліса" }); // "Привіт, Аліса!"
```

A parameter you leave out renders as its own placeholder — `t("greeting")` gives
`"Hello, {name}!"` — plus one development warning per template and parameter. Pass
`missingParam: "drop"` to render an empty string instead.

## 3. Connect to Comvi

Three questions, and the third needs no line here at all.

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
3. **What to paint meanwhile?** Nothing, on this host. `await init()` is where the first fetch
   happens, so a vanilla script simply awaits it and there is no gate to write.

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items" — from "{count, plural, one {# item} other {# items}}"
```

`cdnUrl` is the whole URL the platform hands you: open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved). Compose before `init()`: composing after it warns once per host in
development.

## 4. What is specific to core

`@comvi/core` is the base host: text and `{param}` interpolation, the translation cache, events,
default params and the `.use(installer)` pipe. Everything else is a subpath you import.

| you want                              | you import                                             | you write                   |
| ------------------------------------- | ------------------------------------------------------ | --------------------------- |
| ICU `plural`/`select`/`selectordinal` | `icuCompiler` from `@comvi/core/icu`                   | `compiler: icuCompiler`     |
| async / remote loading                | `loader` or `attachLoader` from `@comvi/core/loader`   | `.use(loader(map))`         |
| the plugin host, post-processors      | `plugins` or `definePlugin` from `@comvi/core/plugins` | `.use(plugins())`           |
| browser-extension discovery           | `devtools` from `@comvi/core/devtools`                 | `.use(devtools())`          |
| `<tag>` markup inside `t()`           | `@comvi/core/tags`                                     | `import "@comvi/core/tags"` |
| the pure rich-text toolbox            | `@comvi/core/rich-text`                                | `prepareTranslation(…)`     |

A capability you never import never enters your module graph, and calling its member on a host that
never composed it is a **compile error**. Two consequences worth knowing: `@comvi/core/tags`
registers the grammar **per bundle**, so an SSR app imports it in the server graph too, and the
unpkg/jsdelivr global build starts fully composed because a `<script src>` consumer has no import
graph to extend.

## 5. Where to go next

- **A framework:** [react](../react) · [next](../next) · [vue](../vue) · [nuxt](../nuxt) ·
  [svelte](../svelte) · [solid](../solid)
- **Reference:** [@comvi/core API](https://comvi.io/docs/i18n/api/core) ·
  [/loader](https://comvi.io/docs/i18n/api/core-loader) ·
  [/plugins](https://comvi.io/docs/i18n/api/core-plugins) ·
  [vanilla guide](https://comvi.io/docs/i18n/vanilla)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) ·
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) ·
  [`docs/design/`](../../docs/design)

Measured min+gz through the published exports map, gated in CI. Every fixture and the 0.4.1
comparison: [bundle size](https://comvi.io/docs/i18n/bundle-size).

| graph                                 | measured as | min+gz |
| ------------------------------------- | ----------- | ------ |
| `@comvi/core` alone, nothing composed | `core-base` | 5270 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
