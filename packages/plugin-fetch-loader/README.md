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

This package registers a translation loader that fetches JSON over HTTP. It
publishes two entry points, one per delivery mode.

### CDN mode vs API mode

| Mode    | Entry point                                    | Use case                                                                                                                                         |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CDN** | `@comvi/plugin-fetch-loader/cdn`               | Static, public translations served from `https://cdn.comvi.io/<distribution-id>`. Fast, cached at the edge. Best for production.                 |
| **API** | `@comvi/plugin-fetch-loader` (CDN **and** API) | Authenticated requests to Comvi API. Supports draft translations, private projects, and SSR fetch caching. Use for staging / auth-gated content. |

`fetchLoader()` from the package root serves both: it reads the CDN, and it
switches to the API when the host carries an `apiKey`. That choice is made at
runtime, so the API request path is in the bundle either way. `cdnLoader()` from
`@comvi/plugin-fetch-loader/cdn` is the CDN half on its own: same CDN
behaviour, about **1.9 kB min+gz smaller**, and an `apiKey` on the host changes
nothing. Use the root entry only when the app talks to the API.

## About Comvi i18n

Comvi i18n is a framework-agnostic internationalization library. You get ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~5 kB minified + gzipped for the base host, ~8.5 kB with every capability composed (as bundled by your app)**, with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **ICU `plural`, `selectordinal` & `select`:** locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS. One explicit import: `compiler: icuCompiler` from `@comvi/core/icu`. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Type-safe translation keys** via TypeScript declaration merging, for autocomplete and parameter validation everywhere.
- **Pluggable:** translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

### Why @comvi/plugin-fetch-loader?

- **Request deduplication.** Concurrent requests for the same locale/namespace are merged into a single fetch.
- **Automatic reload on locale change.** Translations re-fetch whenever the active locale changes, with no manual cache invalidation.
- **Namespace-on-demand loading.** Fetch only the translation files your app uses.

📖 **Documentation:** https://comvi.io/docs/i18n/plugins/fetch-loader/

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core
```

## Quick start

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

await i18n.init();
```

`compiler: icuCompiler` enables ICU for a loaded catalog exactly as it does for
an inline one; drop it only if the project uses no plural/select. See
[MIGRATION.md §0.1](../../MIGRATION.md#01-the-compiler-is-a-constructor-option).

The distribution id in `cdnUrl` comes from the Comvi platform: open your project
and read it off the **Distributions** page.

## Two ways in

`@comvi/core` is the BASE host. Async loading and the plugin host are imports
you add, so an app that uses neither never pays for them. Each entry point
exports one name for each way of adding them: `cdnLoader` / `CdnLoader` on
`/cdn`, `fetchLoader` / `FetchLoader` at the root. The table below uses the
`/cdn` pair; the root pair behaves identically.

|                   | `.use(cdnLoader(options))`                                      | `registerPlugin(CdnLoader(options))`                                             |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| what it is        | the **installer**, lowercase                                    | the **plugin factory**, uppercase                                                |
| the host it needs | any host, including a bare `createI18n(…)`                      | one that already has `@comvi/core/loader` **and** `@comvi/core/plugins`          |
| what it composes  | both capabilities, idempotently, loader first                   | nothing; it only registers                                                       |
| lifecycle         | the host's own: it ends in `registerPlugin(CdnLoader(options))` | the host's own                                                                   |
| use it when       | you are setting up the host                                     | you already compose capabilities explicitly, or you register plugins from a list |

Both end in the same place. The installer is the one-call form of this:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { CdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en" }).use(attachLoader).use(attachPlugins);
i18n.registerPlugin(CdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

**Swapping the two is a type error, and each half is caught at runtime too.**
Nothing is branded: an installer and a plugin are both "a function of the host",
and `.use` is a pipe and nothing more, so it never inspects, orders or brands
what you hand it. What it does check is identity: an installer widens the host
in place and hands that same host back, and `.use` refuses any other return
value, whatever its shape.

- `registerPlugin(cdnLoader(…))` fails at `init()` with
  `E_INSTALLER_AS_PLUGIN`, on the installer's first ensure-step, **before** the
  loader or plugin capability is attached and before a second plugin reaches the
  queue. The message names `cdnLoader` and the `.use` form.
- `.use(CdnLoader(…))` throws `E_USE_NOT_INSTALLER`: the plugin is not an
  installer, so what it hands back is not the host. `.use` calls it before it
  checks, so the plugin runs outside `init()`'s drain loop, and this plugin is
  async — the promise it returns is never awaited, and on a bare host the
  missing `setPluginData` rejects into nothing. That is the reason to put a
  plugin in the queue with `registerPlugin`, where `required`, `timeout`,
  `onError` and cleanup registration apply to it.

## CDN namespace layout

By default, both loaders keep the same URL convention: the i18n instance's
`defaultNs` loads from `{cdnUrl}/{locale}.json`, and every other namespace loads
from `{cdnUrl}/{namespace}/{locale}.json`.

If the namespace stored at the CDN root differs from the namespace your app uses
as `defaultNs`, configure that storage identity explicitly:

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

This maps `storefront` to `storefront/en.json` and `default` to `en.json`.
For a custom CDN where every namespace has its own folder, use
`cdnLayout: { rootNamespace: false }`.

`cdnLayout` affects CDN mode only. When `createI18n({ apiKey })` enables API
mode on the root entry, namespaces are sent explicitly in the API request.

## API mode

API mode lives on the root entry. Pass an `apiKey` on `createI18n` and use `fetchLoader`. The loader then talks to the platform API instead of the public CDN. Staging, draft translations and auth-gated content need that:

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({
  locale: "en",
  apiKey: process.env.COMVI_API_KEY, // triggers API mode
}).use(
  fetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id", // required by the loader
    apiBaseUrl: process.env.COMVI_API_URL || "https://api.comvi.io",
  }),
);

await i18n.init();
```

API mode requests run with `Authorization: Bearer <apiKey>` and hit the platform API instead of the public CDN. Use a project API key with project read and translation read access. `cdnUrl` is still required by the loader options for CDN mode, but API-mode fallback uses the optional `fallback` import map. Concurrent requests for the same `locale:namespace` are deduplicated automatically.

## Pair with your framework

The setup is the same in every binding. The plugin lives on the underlying `@comvi/core` instance, so it works identically:

**React**

```tsx
import { createI18n, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en" }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

<I18nProvider i18n={i18n}>…</I18nProvider>;
```

**Vue**

```ts
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App.vue";

// `VueI18n` has its own `.use(installer)`: it runs the installer on the host
// it wraps and widens the type of `i18n.core` by what was composed.
const i18n = createI18n({ locale: "en" }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

createApp(App).use(i18n).mount("#app");
```

**Next.js / Nuxt:** pair with `loadTranslations()` for SSR. See the [`@comvi/next`](../next) and [`@comvi/nuxt`](../nuxt) READMEs.

For SSR fetch-cache integration, offline fallbacks, lazy namespace loading, the full options reference, and the lower-level helpers exported for `@comvi/next` / `@comvi/nuxt`, see the [documentation](https://comvi.io/docs/i18n/plugins/fetch-loader/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
