---
"@comvi/plugin-fetch-loader": minor
---

`cdnLoader` is the package root; `fetchLoader` and the HTTP helpers moved from the root to
`@comvi/plugin-fetch-loader/api`.

```ts
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }),
);
```

`cdnLoader(options)` and `cdnLoaderPlugin(options)` are the CDN half of the fetch loader on its
own. `fetchLoader()` decides between the CDN and the Comvi API at runtime, from the i18n
instance's `apiKey`, so it carries the whole API request path: the project-info cache, the legacy
export chain and the retry policy. The package root does not contain that path, so the CDN path
stays the lighter entry.

Everything the CDN mode does, `cdnLoader` does: one request per `locale:namespace` with concurrent
callers deduplicated, a timeout that covers the response body, the `fallback` import map,
`cdnLayout`, SSR `cache` options, and the abort when the i18n instance clears a scope that is still
loading.

`CdnLoaderOptions` is the CDN subset of `FetchLoaderOptions`: `baseUrl` and `retry` only
describe the API request path, so naming one here is a compile error rather than a setting
that quietly does nothing.

Import `fetchLoader()` and `fetchLoaderPlugin()` (0.4's `FetchLoader()`) from
`@comvi/plugin-fetch-loader/api` wherever the i18n instance carries an `apiKey`. Both entries run
one shared CDN request path, so the two cannot drift.
