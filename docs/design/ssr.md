# Server rendering: an instance per request, and the browser starts from the server's snapshot

Status: accepted · Date: 2026-11-25 · Rewritten for 0.8. The 0.5–0.7 page compared four different
module-scope rules (Next required one shared instance, the others forbade it); 0.8 has one rule for
every framework. That version is in git history.

Each package README shows its framework's recipe. This page is the rule they share and the
contract of the snapshot a server hands the browser.

## Context

A server handles concurrent requests, and an instance holds a locale, its loads and its catalogs.
Sharing one instance between requests mixes their languages; creating one per request costs a
catalog lookup, which a shared [catalog store](catalog-store.md) makes cheap. The browser then has
to render exactly what the server rendered, without fetching those catalogs again.

## Decision

### One instance per request, everywhere

| Framework | Who creates the request's instance                                                | How the browser starts                                                        |
| --------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Next.js   | `getI18n({ locale, ns })` of `createGetI18n()`, one per request (React `cache()`) | the server `<I18nProvider i18n>` hands its snapshot to a client instance      |
| Nuxt      | the module, per request; destroyed when the request ends                          | the module writes the snapshot into the Nuxt payload and starts from it       |
| Vue       | the app's server entry                                                            | `createI18n({ ...options, ...payload })`                                      |
| Solid     | the app's server entry, under a `<Suspense>` boundary                             | `createI18n({ ...options, ...payload })`                                      |
| Svelte    | the route's server `load`                                                         | `setI18n(createI18n({ ...options, ...data }))`                                |
| React     | the app's server entry                                                            | `createI18n({ ...options, ...payload })`, or `<I18nHandover>` for a later one |

- **Match the locale first.** A locale from a route, cookie or header is checked against the
  supported locales before `createI18n()`: an invalid tag is a `RangeError` there.
- **The request waits for its catalogs before the HTML is final.** Vue's `useI18n(ns)` waits in
  `onServerPrefetch`; Solid's boundary waits through `createResource` in `renderToStringAsync`
  and in a stream; React and Svelte render synchronously, so the route awaits `i18n.ready` and
  `i18n.load(ns)` first; Nuxt and Next do it for the page.
- **A no-argument `useI18n()` waits for its whole scope** in a Vue or Solid server render: `default`
  and every namespace of the `namespaces` option ([namespaces.md](namespaces.md)).
- **Who ends the instance.** Nuxt destroys every server instance when its request ends: after the
  response, when the handler throws, or when the client goes away. Next's instances live for their
  request's React `cache()`. A Vue, Solid, Svelte or React server entry owns its instance: an
  instance that goes out of scope is collected with its catalogs, and `i18n.destroy()` also aborts
  loads still in flight and runs plugin teardowns, which collection never does.

### The snapshot: `handover(i18n)`

`handover()` (`@comvi/core/ssr`, re-exported by Vue, Svelte and Solid) is taken after the render:

- `locale`, `timeZone`, and `serverNow`, the clock the render used for relative times;
- `catalogs`: every catalog the instance holds, of every locale and namespace, inline ones
  included, by namespace then locale; a pair whose load failed is `null`.

Development throws when the instance has no `timeZone`: a server and a browser in different zones
would format one date differently.

```ts title="src/render.ts"
import { createI18n } from "@comvi/core";
import { handover, type Handover } from "@comvi/core/ssr";

const options = { fallbackLocale: "en", timeZone: "UTC", messages: { en: { hi: "Hi" } } };

const server = createI18n({ ...options, locale: "en" });
await server.ready;
// …render with `server`, then embed the snapshot in the page:
const payload: Handover = JSON.parse(JSON.stringify(handover(server)));

// In the browser: the same option values, then the snapshot.
const browser = createI18n({ ...options, ...payload });
browser.t("hi"); // "Hi", with no request for a catalog the server rendered
```

The browser's instance starts from the snapshot: the same `isReady`, `isFetching` and `isLoading` as the
server render, so a branch on them hydrates without a mismatch, and the loader is asked for nothing the
snapshot carries. A `null` slot stays failed: the browser renders the fallback the server rendered
and asks for that pair again only on `load(ns)` or a switch to its locale.

### A slot handed over owns the client's slot

One rule for the first snapshot and every later one (`<I18nHandover catalogs>` in React,
`router.refresh()` and nested providers in Next):

- a slot in the snapshot replaces the client's slot of the same namespace and locale whole: a key
  it lacks is gone, `{}` is empty, `null` is a failed server result;
- a slot absent from the snapshot is left as it is; `add()` stays a patch on top;
- a load of the same pair still running in the browser is aborted, and its late answer ignored;
  a `load(ns)` waiting on it resolves `undefined` for a catalog; for a `null` it resolves with an
  `Error` only when no catalog of the locale's own chain (`de-AT`, its parent `de`) is in place;
- with two handovers on one instance, the last one applied wins per slot;
- catalogs and snapshots are plain data, read by their own keys; inherited properties are not part
  of the contract.

### React: data, then the gate, then the content

`<I18nProvider loading | suspense>` gates the first paint while a namespace being loaded has no
usable catalog. An `<I18nHandover>` inside the gated children cannot hand anything over while the
gate is shut on a client render, so the data comes first: create the instance from the snapshot
before the provider decides. Server renders and hydrations are never gated. A gate that commits the
children first and hides them was tried and rejected: it puts a copy of the children in the DOM,
mounts them twice, or runs their effects before the gate opens.

## Consequences

- The payload grows with every catalog the server instance holds, inline ones included; the
  browser receives inline catalogs again.
- A key only the browser's inline catalog had disappears once a snapshot replaces that slot, until
  the page reloads or the app `add()`s it again.
- Nothing is tracked during a render: no hold counts, no list of used keys.

## Alternatives rejected

- **One shared server instance (Next up to 0.7).** Safe only while no request writes the locale;
  one rule for every framework is easier to keep than a table of exceptions.
- **Merging a snapshot key by key into the client's slot.** A key the server removed would stay
  on screen with no way to tell it apart from a current one.
- **Handing over only the catalogs a render read.** It needs tracking during the render, and a
  per-call `{ locale }` read would hydrate to the key.

## Where it lives

`handover`, `Handover` (`packages/core/src/ssr.ts`); the slot rule (`packages/core/src/state.ts`,
`packages/core/src/instance.ts`); `<I18nHandover>` (`packages/react/src/handover.ts`); the gate
(`packages/react/src/binding.ts`); `createGetI18n` and the server and client `<I18nProvider>`
(`packages/next/src/server`, `packages/next/src/client`); the Nuxt plugin
(`packages/nuxt/src/runtime/plugin.ts`). Pinned in `packages/core/tests/instance/handover.test.ts`, `packages/core/tests/instance/failed-slot.test.ts`,
`packages/react/tests/handover-repeat.test.tsx`, `packages/react/tests/loading-4b.test.tsx`,
`packages/vue/tests/hydration.test.ts`, `packages/solid/tests/ssr/*`.
