# One catalog store per server process, and none by default

Status: accepted, except "no default store", which deviates from design §2.3 item 6 and waits for
the owner's word · Date: 2026-10-28 · Owner decision(s): design §2.3 item 6 and R4-13 of the 0.8
reference design (the store), R3-7 (the CDN layout v1 stays), R3-13 (the size ceilings), lot 2c

## Context

A server that renders an instance per request needs the catalogs of the CDN without fetching them
per request, and without a copy per request: the compile cache is keyed by the identity of the
catalog object, so a copy compiles every message again. The lot-0 spike S8 measured what such a
server needs: requests for one URL share one fetch, a request never waits for a revalidation
(stale-while-revalidate), a failed revalidation keeps the last good catalog, and the `fetch` is the
server's own (a keep-alive agent). The CDN publishes `<base>/<locale>.json` and
`<base>/<ns>/<locale>.json` with `max-age=30, must-revalidate` and an ETag; its worker answers
`OPTIONS` without `Access-Control-Allow-Headers` and exposes no header, so in a browser a
cross-origin ETag cannot be read and `If-None-Match` would need a preflight the worker refuses.

The design text put a store in every `cdn()` loader by default, one per tab in a browser and one
per process on a server. Measured in the lot-2c review fix pass, that default costs what the
`core-icu-cdn-store` size row measures over `core-icu-cdn`: +165 B min+gz (5,055 against 4,890 B),
in every browser bundle that loads from the CDN, and `core-icu-cdn` then had 5 B left under its
R3-13 ceiling of 4,895 B (since the lot 4 N-1 fix: 4,900 against 4,910 B, the owner's 28.10.2026
raise for that fix). The ceilings are not raised for the store, and only the owner can move them.

## Decision

- **`createCatalogStore({ ttl })`** (default 60 s) keeps, per URL, the catalog, its ETag and when
  it was fetched. Concurrent requests share one fetch, and no caller's abort reaches it (the fetch
  has its own timeout; an instance stops waiting on its own signal). A catalog younger than `ttl` is
  answered without a request; an older one is answered at once while one conditional GET runs behind
  it. A 304 keeps the same object, so its compiled messages survive; a 200 replaces it; a failure
  keeps the last good catalog. A 304 and a failure both restart the `ttl` clock, so a failing CDN is
  asked again once per `ttl`, not once per request. A failed fetch with nothing stored is not
  remembered: the instance remembers its failed pairs.
- **No default store (pending the owner's word).** `cdn(base)` without `store` is the lot-1b
  loader: each load is its own request and the caller's abort cancels it; the browser's HTTP cache
  revalidates (R4-10). A server passes ONE store to every instance's loader. The SSR bindings (lots
  6 and 7) create that store for the app. The owner either accepts this as an amendment to §2.3
  item 6 or moves the `core-icu-cdn` ceiling by the +165 B above; until then the code stays without
  the default.
- **`fetch` is injected** (`cdn(base, { fetch })`, R4-13d).
- **`api(base, { key })`** reads `GET <base>/v1/translations?locales=<locale>&namespaces=<ns>` with
  `Authorization: Bearer <key>`, the platform's public route for runtime loaders, and answers
  `namespaces[ns][locale]` of the body, reading own properties only; a body without the pair fails
  with its own message. In a store its catalogs are kept under the SHA-256 of the key (a counter
  per loader where Web Crypto is missing), never the key itself, so no store holds the credential
  and two projects behind one URL never share a catalog. It is for servers and scripts: a key in a
  browser bundle is readable by anyone.
- **The store is opaque.** Its one method is the loaders' seam (`@internal` in the typings);
  application code only creates one and passes it on. A failed first fetch removes its entry, so
  failed URLs do not accumulate in a process-level store.

## Consequences

- An instance per request costs no fetch and no compile on a warm store: S8 (`node scripts/perf.mjs
--ssr`) counts 0 fetches and 2 catalog objects (two locales) across 20,000 requests. With
  `ttl: 0` there is one revalidation in flight per catalog at a time: sequentially every request
  starts its own conditional GET, at 16 concurrent requests they coalesce, and S8 prints how many
  304s it took for how many requests, with the same two objects throughout. The unit suite gates
  the counts (`tests/cdn/store.test.ts`); req/s are informational.
- A browser app that wants instances in one tab to share fetches passes a store too; in a browser
  it never sends `If-None-Match` (the ETag is not readable cross-origin), so no request leaves the
  CORS-safelisted set.
- A signal that is already aborted is refused before any request, with or without a store. With a
  store, a caller that aborts later stops waiting through its instance (whose flight settles on
  its own signal); a direct caller of the loader waits for the shared fetch.

## Alternatives rejected

- **A module-wide store in every bundle** (the design text): over the R3-13 ceiling, for a browser
  that gains little from it (one instance per tab, HTTP cache revalidation).
- **A server-only default through a `node` export condition**: the same specifier would behave
  differently by bundler conditions, and the dev and production builds would need a third variant.
- **Revalidating before answering**: a request would wait on the CDN whenever `ttl` expired. S8
  prints both the warm and the revalidating rates side by side; they are informational and move
  with machine load, so no ratio is recorded here.

## Where it lives

`createCatalogStore`, `cdn`, `api` and the internal `mk` in `packages/core/src/cdn.ts`;
`buildSsrScenarios` and `runSsr` in `scripts/perf.mjs`; `packages/core/tests/cdn/store.test.ts`.
