<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-fetch-loader</h1>

<p align="center">HTTP translation loader for Comvi i18n — load translations from a CDN or the Comvi API.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/npm/v/@comvi/plugin-fetch-loader?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-fetch-loader?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

This package registers a translation loader that fetches JSON over HTTP. It is **step 2** of every
framework quickstart: the piece that turns a bundled catalog into one the Comvi platform serves.
Start from your framework's README — [react](../react) · [vue](../vue) · [solid](../solid) ·
[svelte](../svelte) · [next](../next) · [nuxt](../nuxt) · [core](../core) — and come here for the
options.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

Concurrent requests for the same locale and namespace are deduplicated, translations re-fetch on a
locale change with no manual cache invalidation, and namespaces load on demand.

📖 [Documentation](https://comvi.io/docs/i18n/plugins/fetch-loader/)

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core (which every framework package already brings)
```

## Which entry point

| Mode    | Entry point                                    | Use case                                                                                                                                  |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **CDN** | `@comvi/plugin-fetch-loader/cdn`               | Static, public translations served from `https://cdn.comvi.io/<distribution-id>`. Fast, cached at the edge. Best for production.          |
| **API** | `@comvi/plugin-fetch-loader` (CDN **and** API) | Authenticated requests to the Comvi API. Draft translations, private projects, SSR fetch caching. Use for staging and auth-gated content. |

`cdnLoader()` from the `/cdn` subpath is the CDN half on its own, and it is what a quickstart uses.
`fetchLoader()` from the package root serves both: it reads the CDN, and switches to the API when
the host carries an `apiKey`. That choice is made at runtime, so the API request path is in the
bundle either way — which is why the CDN-only subpath exists. Two of the measurements CI keeps in
[`scripts/size-budgets.json`](../../scripts/size-budgets.json) are exactly that difference:

| graph                                  | measured as                    | min+gz  |
| -------------------------------------- | ------------------------------ | ------- |
| base host, ICU, and the `/cdn` subpath | `plugin-fetch-loader-cdn-lite` | 9173 B  |
| base host, ICU, and the root entry     | `plugin-fetch-loader-cdn`      | 11139 B |

The gap between the two rows IS the API request path a CDN-only app does not ship.

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
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("items", { count: 5 }); // "5 items" — from "{count, plural, one {# item} other {# items}}"
```

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and copy it from
**Settings → Content Deploy → CDN Endpoint** (the URL is generated when Content Deploy is enabled and saved).

In a framework, the host goes to that framework's provider or plugin instead of `await init()`, and
the first paint needs a gate because the catalog is in flight. Each framework README shows its own:
`fallback` in [react](../react#3-connect-to-comvi) and [solid](../solid#3-connect-to-comvi), three
lines of markup in [vue](../vue#3-connect-to-comvi) and [svelte](../svelte#3-connect-to-comvi),
`loadTranslations()` server-side in [next](../next#3-connect-to-comvi) and
[nuxt](../nuxt#3-connect-to-comvi).

## CDN namespace layout

By default both loaders keep the same URL convention: the host's `defaultNs` loads from
`{cdnUrl}/{locale}.json`, and every other namespace loads from `{cdnUrl}/{namespace}/{locale}.json`.

If the namespace stored at the CDN root differs from the namespace your app uses as `defaultNs`,
configure that storage identity explicitly:

```ts
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({
  locale: "en",
  defaultNs: "storefront",
  ns: ["storefront", "default"],
}).use(
  cdnLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
    cdnLayout: { rootNamespace: "default" },
  }),
);
```

This maps `storefront` to `storefront/en.json` and `default` to `en.json`. For a custom CDN where
every namespace has its own folder, use `cdnLayout: { rootNamespace: false }`.

`cdnLayout` affects CDN mode only. When `createI18n({ apiKey })` enables API mode on the root entry,
namespaces are sent explicitly in the API request.

## API mode

API mode lives on the root entry. Pass an `apiKey` on `createI18n` and use `fetchLoader`; the loader
then talks to the platform API instead of the public CDN. Staging, draft translations and auth-gated
content need that.

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({
  locale: "en",
  apiKey: process.env.COMVI_API_KEY, // triggers API mode
}).use(
  fetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id", // required by the loader options
    apiBaseUrl: process.env.COMVI_API_URL || "https://api.comvi.io",
  }),
);

await i18n.init();
```

Requests run with `Authorization: Bearer <apiKey>`. Use a project API key with project-read and
translation-read access. `cdnUrl` is still required by the loader options for CDN mode; API-mode
fallback uses the optional `fallback` import map.

## Reference: the installer and the factory

Each entry point exports one name for each way in: `cdnLoader` / `cdnLoaderPlugin` on `/cdn`,
`fetchLoader` / `fetchLoaderPlugin` at the root. The table uses the `/cdn` pair; the root pair behaves
identically.

|                   | `.use(cdnLoader(options))`                    | `registerPlugin(cdnLoaderPlugin(options))`                                       |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| what it is        | the **installer** — the bare name             | the **plugin factory** — the `*Plugin` name                                      |
| the host it needs | any host, including a bare `createI18n(…)`    | one that already has the loader **and** plugin capabilities                      |
| what it composes  | both capabilities, idempotently, loader first | nothing; it only registers                                                       |
| use it when       | you are setting up the host                   | you already compose capabilities explicitly, or you register plugins from a list |

Both end in the same place. The installer is the one-call form of this:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { cdnLoaderPlugin } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en" }).use(attachLoader).use(attachPlugins);
i18n.registerPlugin(cdnLoaderPlugin({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

**Swapping the two is a type error, and each half is caught at runtime too.**
`registerPlugin(cdnLoader(…))` fails at `init()` with `E_INSTALLER_AS_PLUGIN`, the first thing the
installer does, before it has set anything up. `.use(cdnLoaderPlugin(…))` throws
`E_USE_NOT_INSTALLER`: a plugin is not an installer, so what it hands back is not the host. `.use`
calls it before it checks, so the plugin runs outside `init()`'s drain loop and, being async, hands
back a promise nobody awaits. Register it with `registerPlugin`, where `required`, `timeout`,
`onError` and cleanup apply to it. The full reasoning is in
[docs/design/composition.md](../../docs/design/composition.md#installer-or-plugin-swapping-the-slots-is-loud-both-ways).

The `CDN_BASE_URL` export is **deprecated and removed in 0.6**: `cdnUrl` is required, there is no
environment override for it, and nothing in this package reads the constant — the hosted default
lives on `comviPreset` instead.

## Where to go next

- **Your framework's two-step quickstart:** [react](../react) · [vue](../vue) · [solid](../solid) ·
  [svelte](../svelte) · [next](../next) · [nuxt](../nuxt) · [core](../core)
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **SSR fetch-cache integration, offline fallbacks, lazy namespace loading, the full options
  reference and the lower-level helpers** exported for `@comvi/next` and `@comvi/nuxt`:
  [comvi.io/docs/i18n/plugins/fetch-loader/](https://comvi.io/docs/i18n/plugins/fetch-loader/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
