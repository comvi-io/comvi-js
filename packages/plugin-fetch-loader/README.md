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
  <a href="https://bundlejs.com/?q=@comvi/plugin-fetch-loader&amp;treeshake=%5B%7BcdnLoader%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22@comvi/core%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/plugin-fetch-loader&amp;treeshake=%5B%7BcdnLoader%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22@comvi/core%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/plugin-fetch-loader` fetches each locale's catalog over HTTP from the
[Comvi platform](https://comvi.io). Use it when the translations live in a Comvi project rather than
in your repository: a wording change ships when a translator saves it, without a redeploy.

## Install

```bash
npm install @comvi/plugin-fetch-loader
# Peer: @comvi/core, which every framework package already brings
```

## Load from the CDN

In `src/main.tsx`:

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

`.use(cdnLoader({ cdnUrl }))` adds HTTP loading to the instance. `fallback` paints until the first
catalog is in. The CDN URL comes from **Settings → Content Deploy** in the Comvi project; the
walkthrough is [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

### How it works

The loader fetches `{cdnUrl}/{locale}.json` for the default namespace and
`{cdnUrl}/{namespace}/{locale}.json` for the others, inside `init()` and on every `setLocale()`
whose `locale:namespace` pairs are not in the cache yet; switching back to a loaded locale fetches
nothing. Concurrent requests for one `locale:namespace` are deduplicated, a request that exceeds `timeout`
is aborted, and `destroy()` aborts everything in flight. Omitting `cdnUrl` throws when `.use()`
runs the installer: `[@comvi/plugin-fetch-loader] cdnUrl is required`. On Vue the same `.use()`
goes on the object `createI18n` returns; on Nuxt it goes in the `comvi.i18n.ts` factory.

## Bundled fallback

In `src/i18n.ts`:

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

When a fetch fails (network error, non-2xx status, invalid JSON or timeout), the loader serves the
matching import: the exact `'locale:namespace'` key first, then the `'locale'` shorthand for the
default namespace.

## API mode

In a server-only module, `src/i18n.server.ts`:

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
carries an `apiKey`, which makes draft translations and private projects reachable. The key needs
project read and translation read access. It is a credential, so compose `fetchLoader` with a key only in a server render, a prerender, a CLI or a
script; in the browser use `cdnLoader`, which never builds an API URL and is the smaller entry.

## Options

| Option          | Default                        | Entry | Behaviour                                                                                              |
| --------------- | ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| `cdnUrl`        | required                       | both  | The CDN base URL from **Settings → Content Deploy**.                                                   |
| `baseUrl`       | `https://api.comvi.io`         | api   | The API host. `NEXT_PUBLIC_COMVI_API_URL` in `process.env` replaces the default.                       |
| `fallback`      | none                           | both  | Import map served when a fetch fails.                                                                  |
| `onLoadError`   | none                           | both  | `(locale, namespace, error)` when a pair fails and no fallback produced data.                          |
| `onLoadSuccess` | none                           | both  | `(locale, namespace)` when a pair loads, including from `fallback`.                                    |
| `timeout`       | `10000`                        | both  | Per-request budget in milliseconds, covering the body.                                                 |
| `retry`         | `true`                         | api   | Retries the project-info request after a 429, 5xx or transport failure, twice at most.                 |
| `loadOnInit`    | `true`                         | both  | Only matters when `fetchLoaderPlugin()` is called by hand outside `init()`; `init()` loads regardless. |
| `cdnLayout`     | `{ rootNamespace: defaultNs }` | both  | Which namespace lives at `{cdnUrl}/{locale}.json`.                                                     |
| `cache`         | none                           | both  | `{ revalidate, tags }` for the Next.js data cache; other runtimes ignore it.                           |

Naming an `/api`-only option on `cdnLoader` is a type error.

## Read next

- [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader): the CDN layout and every option in full.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): import maps, custom loaders and namespaces.
- [Loader API](https://comvi.io/docs/i18n/api/core-loader): every member the loader capability adds.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
