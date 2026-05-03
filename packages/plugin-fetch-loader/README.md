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
  <a href="https://bundlejs.com/?q=%40comvi%2Fplugin-fetch-loader"><img src="https://deno.bundlejs.com/?q=@comvi/plugin-fetch-loader&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`FetchLoader` registers a translation loader that fetches JSON over HTTP.

### CDN mode vs API mode

| Mode    | Use case                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CDN** | Static, public translations served from `https://cdn.comvi.io/<distribution-id>`. Fast, cached at the edge. Best for production.                 |
| **API** | Authenticated requests to Comvi API. Supports draft translations, private projects, and SSR fetch caching. Use for staging / auth-gated content. |

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB gzipped** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

### Why @comvi/plugin-fetch-loader?

- **Request deduplication.** Concurrent requests for the same locale/namespace are merged into a single fetch.
- **Automatic reload on locale change.** Translations re-fetch whenever the active locale changes — no manual cache invalidation.
- **Namespace-on-demand loading.** Fetch only the translation files your app actually uses.

📖 **Documentation:** https://comvi.io/docs/i18n/plugins/fetch-loader/

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core
```

## Quick start

```ts
import { createI18n } from "@comvi/core";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).use(
  FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

await i18n.init();
```

## API mode

Pass an `apiKey` on `createI18n` to switch to authenticated API mode — used for staging, draft translations, or auth-gated content:

```ts
import { createI18n } from "@comvi/core";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({
  locale: "en",
  apiKey: process.env.COMVI_API_KEY, // triggers API mode
}).use(
  FetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id", // required by the loader
    apiBaseUrl: process.env.COMVI_API_URL || "https://api.comvi.io",
  }),
);

await i18n.init();
```

API mode requests run with `Authorization: Bearer <apiKey>` and hit the platform API instead of the public CDN. Use a project API key with project read and translation read access. `cdnUrl` is still required by the loader options for CDN mode, but API-mode fallback uses the optional `fallback` import map. Concurrent requests for the same `locale:namespace` are deduplicated automatically.

## Pair with your framework

Same setup, framework-idiomatic integration. The plugin lives on the underlying `@comvi/core` instance, so it works identically across every binding:

**React**

```tsx
import { createI18n, I18nProvider } from "@comvi/react";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).use(
  FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

<I18nProvider i18n={i18n}>{/* ... */}</I18nProvider>;
```

**Vue**

```ts
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).use(
  FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

createApp(App).use(i18n).mount("#app");
```

**Next.js / Nuxt** — pair with `loadTranslations()` for SSR. See the [`@comvi/next`](../next) and [`@comvi/nuxt`](../nuxt) READMEs.

For SSR fetch-cache integration, offline fallbacks, lazy namespace loading, the full options reference, and the lower-level helpers exported for `@comvi/next` / `@comvi/nuxt`, see the [documentation](https://comvi.io/docs/i18n/plugins/fetch-loader/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
