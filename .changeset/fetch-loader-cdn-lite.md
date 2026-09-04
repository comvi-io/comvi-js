---
"@comvi/plugin-fetch-loader": minor
---

New entry point `@comvi/plugin-fetch-loader/cdn`: `cdnLoader(options)` and
`CdnLoader(options)`, the CDN half of the fetch loader on its own.

`fetchLoader()` decides between the CDN and the Comvi API at runtime, from the
host's `apiKey`, so an app that only ever reads a public distribution still
bundles the whole API request path — the project-info cache, the legacy export
chain and the retry policy. The new entry does not contain that path at all.
Composed on the base host with ICU, it measures **9138 B min+gz against 11094 B**
for the same composition through the package root: **1956 B smaller**.

Everything the CDN mode does, it still does: one request per `locale:namespace`
with concurrent callers deduplicated, a timeout that covers the response body,
the `fallback` import map, `cdnLayout`, SSR `cache` options, and the abort when
the host clears a scope that is still loading.

```ts
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en" }).with(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
```

`CdnLoaderOptions` is the CDN subset of `FetchLoaderOptions`: `baseUrl`,
`apiBaseUrl` and `retry` only describe the API request path, so naming one here
is a compile error rather than a setting that quietly does nothing.

`fetchLoader()` and `FetchLoader()` behave exactly as before — keep them wherever
the host carries an `apiKey`. They are 233 B larger: 199 B because the CDN
request path is now ONE shared implementation both entries run rather than two
copies that could drift, and 34 B for the longer error prefix below. The docs
show `cdnLoader` in the CDN quickstarts and present `fetchLoader` as the
CDN + API entry.
