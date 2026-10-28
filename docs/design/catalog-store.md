# One catalog store per server process, and none by default

Status: accepted · Date: 2026-10-28 · Owner decision(s): design §2.3 item 6 and R4-13 of the 0.8
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
per process on a server. Measured on the lot-2c tree, that default costs about 110 B min+gz in every
browser bundle that loads from the CDN, and `core-icu-cdn` had 9 B left under its R3-13 ceiling
after the loader and the parent-chain fix; the ceilings are not raised.

## Decision

- **`createCatalogStore({ ttl })`** (default 60 s) keeps, per URL, the catalog, its ETag and when
  it was fetched. Concurrent requests share one fetch, and no caller's abort reaches it (the fetch
  has its own timeout; an instance stops waiting on its own signal). A catalog younger than `ttl` is
  answered without a request; an older one is answered at once while one conditional GET runs behind
  it. A 304 keeps the same object, so its compiled messages survive; a 200 replaces it; a failure
  keeps the last good catalog. A 304 and a failure both restart the `ttl` clock, so a failing CDN is
  asked again once per `ttl`, not once per request. A failed fetch with nothing stored is not
  remembered: the instance remembers its failed pairs.
- **No default store.** `cdn(base)` without `store` is the lot-1b loader: each load is its own
  request and the caller's abort cancels it; the browser's HTTP cache revalidates (R4-10). A server
  passes ONE store to every instance's loader. The SSR bindings (lots 6 and 7) create that store for
  the app.
- **`fetch` is injected** (`cdn(base, { fetch })`, R4-13d).
- **`api(base, { key })`** reads `GET <base>/v1/translations?locales=<locale>&namespaces=<ns>` with
  `Authorization: Bearer <key>`, the platform's public route for runtime loaders, and answers
  `namespaces[ns][locale]` of the body. The key is part of the store key, so two projects behind
  one URL never share a catalog. It is for servers and scripts: a key in a browser bundle is
  readable by anyone.
- **The store is opaque.** Its one method is the loaders' seam; application code only creates one
  and passes it on.

## Consequences

- An instance per request costs no fetch and no compile on a warm store: S8 (`node scripts/perf.mjs
--ssr`) counts 0 fetches and 2 catalog objects (two locales) across 20,000 requests, and with
  `ttl: 0` one 304 per catalog behind the requests, the same two objects. The unit suite gates the
  counts (`tests/cdn/store.test.ts`); req/s are informational.
- A browser app that wants instances in one tab to share fetches passes a store too; in a browser
  it never sends `If-None-Match` (the ETag is not readable cross-origin), so no request leaves the
  CORS-safelisted set.
- A direct call of a `cdn()` loader with a signal that is already aborted is not refused at once:
  the instance never passes one, and refusing it cost bytes the ceiling did not have.

## Alternatives rejected

- **A module-wide store in every bundle** (the design text): over the R3-13 ceiling, for a browser
  that gains little from it (one instance per tab, HTTP cache revalidation).
- **A server-only default through a `node` export condition**: the same specifier would behave
  differently by bundler conditions, and the dev and production builds would need a third variant.
- **Revalidating before answering**: a request would wait on the CDN whenever `ttl` expired;
  S8 measured the coalesced, non-blocking form within 16 % of the warm rate sequentially and
  within 1 % at 16 concurrent requests (one machine, informational).

## Where it lives

`createCatalogStore`, `cdn`, `api` and the internal `mk` in `packages/core/src/cdn.ts`;
`buildSsrScenarios` and `runSsr` in `scripts/perf.mjs`; `packages/core/tests/cdn/store.test.ts`.
