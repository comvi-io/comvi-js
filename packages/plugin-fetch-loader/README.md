<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-fetch-loader</h1>

<p align="center">Load Comvi i18n translations over HTTP: from the CDN, or from the platform API.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/npm/v/@comvi/plugin-fetch-loader?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/plugin-fetch-loader"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-fetch-loader?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/plugin-fetch-loader` fetches each locale's JSON over HTTP. The package root reads the
public CDN and is the smaller entry; `@comvi/plugin-fetch-loader/api` also talks to the platform API. The full guide is
[Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader) on the docs site.

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core, which every framework package already brings
```

## Load from the CDN

```tsx title="src/main.tsx" check=group=fetch-loader-1
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<p>Loading…</p>}>
    <App />
  </I18nProvider>,
);
```

`.use(cdnLoader())` adds HTTP loading to the instance; nothing else is needed. `fallback` paints
until the first catalog is in. Omitting `cdnUrl` throws at composition time with
`[@comvi/plugin-fetch-loader] cdnUrl is required`. On Vue the same `.use()` goes on the wrapper
`createI18n` returns; on Nuxt it goes in the `comvi.host.ts` factory. The CDN URL comes from
**Settings → Content Deploy** in the Comvi project; see
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent, and either works without the other.

## Bundled fallback

```ts title="src/i18n.ts" check=group=fetch-loader-2
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

export const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(
  cdnLoader({
    cdnUrl: "https://cdn.comvi.io/<project-token>",
    fallback: {
      en: () => import("./locales/en.json"),
      de: () => import("./locales/de.json"),
      "en:admin": () => import("./locales/en/admin.json"),
    },
  }),
);

await i18n.init();
```

When a network load fails, the loader serves the matching import: the exact `'locale:namespace'`
key first, then the `'locale'` shorthand for the default namespace.

## CDN mode vs API mode

```ts title="src/i18n.server.ts" check=group=fetch-loader-3
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader/api";

export const i18n = createI18n({
  locale: "en",
  apiKey: process.env.COMVI_API_KEY,
}).use(
  fetchLoader({
    cdnUrl: "https://cdn.comvi.io/<project-token>",
    baseUrl: process.env.COMVI_API_URL,
  }),
);

await i18n.init();
```

`fetchLoader()` from `/api` reads the CDN, and switches to the platform API when the i18n instance
carries an `apiKey`: draft translations and private projects are reachable. The key needs project
read and translation read access. `cdnLoader()` never builds an API URL. API mode is server-side
only: the `apiKey` is a credential, so compose `fetchLoader` with a key only in a server render, a
prerender, a CLI or a script; in the browser use `cdnLoader`.

## Options

| Option          | Default                        | Entry | Behaviour                                                                              |
| --------------- | ------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| `cdnUrl`        | required                       | both  | The CDN base URL from **Settings → Content Deploy**.                                   |
| `baseUrl`       | `https://api.comvi.io`         | api   | The API host.                                                                          |
| `fallback`      | none                           | both  | Import map served when a network load fails.                                           |
| `onLoadError`   | none                           | both  | `(locale, namespace, error)` when a pair fails and no fallback produced data.          |
| `onLoadSuccess` | none                           | both  | `(locale, namespace)` when a pair loads, including from `fallback`.                    |
| `timeout`       | `10000`                        | both  | Per-request budget in milliseconds, covering the body.                                 |
| `retry`         | `true`                         | api   | Retries the project-info request after a 429, 5xx or transport failure, twice at most. |
| `loadOnInit`    | `true`                         | both  | Whether the plugin loads at install time.                                              |
| `cdnLayout`     | `{ rootNamespace: defaultNs }` | both  | Which namespace lives at `{cdnUrl}/{locale}.json`.                                     |
| `cache`         | none                           | both  | `{ revalidate, tags }` forwarded to `fetch()` on Next.js and Nuxt.                     |

Naming an `/api`-only option on `cdnLoader` is a compile error. Concurrent requests for one
`locale:namespace` are deduplicated, and `destroy()` aborts everything in flight.

## Next steps

- [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader): the CDN layout, every option in full, `baseUrl`.
- [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi): the CDN URL, the status filter and the first plural.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): import maps, custom loaders and namespaces.
- [Loader API](https://comvi.io/docs/i18n/api/core-loader): every member the loader capability adds.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
