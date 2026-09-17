<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-fetch-loader</h1>

<p align="center">Load Comvi i18n translations over HTTP — from the CDN, or from the platform API.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/npm/v/@comvi/plugin-fetch-loader?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-fetch-loader?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

This package registers a translation loader that fetches JSON over HTTP. It is **step 2** of every
framework quickstart: the piece that turns a bundled catalog into one the Comvi platform serves.
Start from your framework's README — [react](../react) · [next](../next) · [vue](../vue) ·
[nuxt](../nuxt) · [svelte](../svelte) · [solid](../solid) · [core](../core) — and come here for the
options.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

Concurrent requests for the same locale and namespace are deduplicated, translations re-fetch on a
locale change with no manual cache invalidation, and namespaces load on demand.

📖 [Documentation](https://comvi.io/docs/i18n/plugins/fetch-loader)

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core (which every framework package already brings)
```

## Which entry point

| Mode    | Entry point                                    | Use case                                                                                                                                  |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **CDN** | `@comvi/plugin-fetch-loader/cdn`               | Static, public translations served from your project's CDN endpoint on `cdn.comvi.io`. Fast, cached at the edge. Best for production.     |
| **API** | `@comvi/plugin-fetch-loader` (CDN **and** API) | Authenticated requests to the Comvi API. Draft translations, private projects, SSR fetch caching. Use for staging and auth-gated content. |

`cdnLoader()` from the `/cdn` subpath is the CDN half on its own, and it is what a quickstart uses.
`fetchLoader()` from the package root serves both: it reads the CDN, and switches to the API when
the host carries an `apiKey`. That choice is made at runtime, so the API request path is in the
bundle either way — which is why the CDN-only subpath exists, and why it is the lighter row below.

## Connect to Comvi

Two additions to the host, and they are the same two in every framework:

1. **`compiler: icuCompiler`.** The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production, so name it once and it covers
   every catalog the host ever ingests.
2. **`.use(cdnLoader({ cdnUrl }))`**, which sets up loading and registers the CDN plugin, in one
   call.

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", fallbackLocale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }),
);

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items" — from "{count, plural, one {# item} other {# items}}"
```

`cdnUrl` is the whole URL the platform hands you: open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved).

In a framework, the host goes to that framework's provider or plugin instead of `await init()`, and
the first paint needs a gate because the catalog is in flight. Each framework README shows its own:
`fallback` in [react](../react#3-connect-to-comvi) and [solid](../solid#3-connect-to-comvi), three
lines of markup in [vue](../vue#3-connect-to-comvi) and [svelte](../svelte#3-connect-to-comvi),
`loadTranslations()` server-side in [next](../next#3-connect-to-comvi) and
[nuxt](../nuxt#3-connect-to-comvi).

## Installer or plugin factory

Each entry point exports one name for each way in: `cdnLoader` / `cdnLoaderPlugin` on `/cdn`,
`fetchLoader` / `fetchLoaderPlugin` at the root. The bare name is the **installer** — it composes
the loader and plugin capabilities itself, idempotently, so it works on a bare `createI18n(…)` and
is what you want while setting up the host. The `*Plugin` name only registers, so it needs a host
that already has both capabilities.

**Swapping the two is a type error, and each half is caught at runtime too.**
`registerPlugin(cdnLoader(…))` fails at `init()` with `E_INSTALLER_AS_PLUGIN`. `.use(cdnLoaderPlugin(…))`
throws `E_USE_NOT_INSTALLER`: a plugin is not an installer, so what it hands back is not the host.
Register it with `registerPlugin`, where `required`, `timeout`, `onError` and cleanup apply to it.

## Where to go next

- **Your framework's two-step quickstart:** [react](../react) · [next](../next) · [vue](../vue) ·
  [nuxt](../nuxt) · [svelte](../svelte) · [solid](../solid) · [core](../core)
- **This package:** the full options reference, CDN namespace layout and `cdnLayout`, API mode and
  its `Authorization: Bearer` requirements, SSR fetch caching, offline fallbacks, lazy namespaces
  and the lower-level helpers: [fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader)
- **Guides:** [loading & caching](https://comvi.io/docs/i18n/loading-translations) ·
  [namespaces](https://comvi.io/docs/i18n/namespaces) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) ·
  [`docs/design/`](../../docs/design)

Measured min+gz through the published exports map, gated in CI. The root entry's row, which carries
the API request path a CDN-only app never ships, is on the
[bundle size](https://comvi.io/docs/i18n/bundle-size) page beside this one.

| graph                                  | measured as                    | min+gz |
| -------------------------------------- | ------------------------------ | ------ |
| base host, ICU, and the `/cdn` subpath | `plugin-fetch-loader-cdn-lite` | 9173 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
