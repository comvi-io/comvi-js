# Namespaces: who loads them, what `isReady`, `isFetching` and `isLoading` mean, when `missing_key` is reported

Status: accepted · Date: 2026-10-29, scope of `useI18n()` 2026-11-10 · Moved here 2026-11-25 from the
release notes file the tests cited; the content is the contract the tests below pin.

## Context

An app reads a namespace in many places and needs it loaded in a few. If every read loaded, a list
of a hundred `<T ns>` would start a hundred requests and a typo would start one more. If nothing
tracked who needs a namespace, a language switch would not know what to load. A component also needs
to tell "loading" from "failed" from "there is no catalog at all", and the instance must not report
a missing key for text that is still on its way.

## Decision

### Who loads, who keeps a namespace active

| API                         | Reads translations | Makes sure it loads         | Keeps the namespace active |
| --------------------------- | ------------------ | --------------------------- | -------------------------- |
| `useI18n(ns)`               | yes                | yes                         | while it has a consumer    |
| `i18n.load(ns)`             | no                 | yes                         | no                         |
| `t()`, `$t()`, `<T>`        | yes                | no (never starts a request) | no                         |
| a namespace of `namespaces` | no                 | at start                    | always                     |

- `ns` among a call's params only picks the catalog: the exported `<T ns="account">` loads nothing,
  on a server neither. `useI18n("account").T` reads the namespace its `useI18n` declared.
- `load(ns)` loads `ns` for the current locale's chain, asks its failed pairs again (the explicit
  retry) and keeps nothing active. It resolves with an `Error` only when the locale's own load of
  `ns` failed and no catalog of `ns` from the locale's own chain is in place, and with `undefined`
  otherwise; it never rejects for a failed load.
- A remount after a failed load asks for nothing: the failed pair stays failed until `load(ns)` or
  a switch to its locale.
- **Active set** = the `namespaces` option (for the instance's life) + every namespace with at least
  one consumer. A hold counts a consumer and loads what the displayed locale's chain lacks; its
  release uncounts it, aborts nothing and evicts nothing. Several consumers share one catalog and
  one request per (locale, namespace). React holds in an effect and releases in its cleanup; Vue,
  Svelte and Solid hold at mount and release at unmount; Vue's `KeepAlive` deactivation releases
  and activation holds again.

### `isReady`, `isFetching` and `isLoading`, per namespace

The chain of a locale is the locale, its parents (`pt-BR` → `pt`), then the fallback locales and
their parents: what `t()` looks in.

- **`isReady`**: a catalog of the namespace for some locale of the displayed locale's chain is in
  place (inline, handed over, loaded or `add()`ed; an empty catalog counts). A catalog of a locale
  outside the chain does not count. During a switch the displayed locale is the one on screen, not
  the target.
- **`isFetching`**: a load of the namespace is in flight (for any locale, a pending switch's target
  too), or the instance has a loader and a pair of the chain is neither in place nor failed (the
  load a consumer's hold is about to make). A failed pair does not keep `isFetching` true, so no
  catalog, no flight and a failure (or no loader) is `false`/`false`, never an endless loading state.
- **`isLoading`** (a binding's `useI18n()` only): `!isReady && isFetching`, the placeholder branch.

| Situation                                       | `isReady` | `isFetching` | `isLoading` |
| ----------------------------------------------- | --------- | ------------ | ----------- |
| First load, no catalog                          | `false`   | `true`       | `true`      |
| A catalog of the chain is in place              | `true`    | `false`      | `false`     |
| A usable catalog, a load in flight              | `true`    | `true`       | `false`     |
| The load failed, a fallback catalog is in       | `true`    | `false`      | `false`     |
| No catalog; the load failed, or none is planned | `false`   | `false`      | `false`     |

**Scope of a binding's `useI18n()`.** `useI18n(ns)` describes `ns` alone. `useI18n()` with no
argument describes what its `t` reads and the app's startup set: `default` AND every namespace of the
`namespaces` option (`isReady` when each has a usable catalog, `isFetching` while one of them loads).
`namespaces: []` still describes `default`. `isReady` means a usable catalog, not every key. The hold
stays on the namespace `t` reads; the scope adds no hold and no load. React's first-paint gate
(`<I18nProvider loading | suspense>`) uses the same predicate.

**Server-render wait.** A Vue or Solid server render of a no-argument `useI18n()` waits while its
scope is loading (`default` or a namespace of the `namespaces` option), so the server HTML has the
text the browser hydrates to. React and Svelte cannot wait inside a server render: the route loads
first.

### `missing_key`

One rule for `t()`, `$t()`, the exported and the bound `<T>`. A read reports `missing_key` when the
key is not found, at least one catalog of the namespace is in place for the read's chain, and every
pair of that chain is settled: its catalog in place or its load failed, with no load of that pair in
flight. A request has priority: a catalog `add()`ed to a pair while its request runs does not settle
it, and a retry makes the pair unknown again until it finishes. With a loader, a pair never requested
is unknown and keeps the read silent; without a loader the catalogs in place are the complete set.
The check uses the namespace and the chain of the read itself, a per-call `{ locale }` and `{ ns }`
included. A failed load is `load_failed`. A namespace with no catalog of the read's chain is never a
`missing_key`: development warns, production is silent.

| Situation                                                       | Every surface            |
| --------------------------------------------------------------- | ------------------------ |
| fallback catalog without the key, main locale not requested yet | silent (unknown)         |
| main locale loading                                             | silent                   |
| main locale loaded with the key                                 | the translation          |
| every pair of the chain settled, key absent                     | `missing_key`            |
| no loader, key absent from the catalogs in place                | `missing_key`            |
| no catalog of the chain at all                                  | development warning only |

`i18n.ready` is something else: it settles when the loads in flight at the time of the read settle,
failed or aborted ones too, and says nothing about a namespace's catalog.

### `setLocale(l)`

- At the call it takes the active set; the loads it waits for are those of that set, never rebuilt
  while it is pending. The locale on screen stays until the switch applies.
- The latest valid call wins: an earlier one then never switches and resolves `undefined` once its
  loads settle or are aborted. An invalid tag resolves with a `RangeError` before that rule applies,
  so it overtakes nothing. The latest call resolves with an `Error`, keeping the old locale, only
  when `l`'s own load failed in every namespace it waited for and none of them has a catalog of
  `l`'s own chain in place (`de-AT` or `de`); otherwise it switches. It never rejects for a failed
  load.
- After the switch applies, what the new active set lacks for `l` loads (not awaited): a consumer
  that mounted while the switch was pending ends with `l`'s catalog. A switch that fails loads
  again what the active set lacks for the locale kept on screen.

### Development diagnostics

Development builds only (nothing in production): `t()`, `i18n.ns()`, `$t()` and `<T>` warn once per
instance and namespace when they read a namespace that has no catalog in the chain, no consumer, no
load in flight and no failed pair, with a loader to load it; without a loader, whenever the chain has
no catalog of it. `useI18n(ns).t` and its bound `T` read a declared need and never warn about `ns`.
A per-call `{ ns }` of another namespace is checked like any read.

## Consequences

- With a loader, a namespace nobody requests (a typo, a released namespace read against a fallback
  catalog after a switch) gets no production `missing_key`: an unconfirmed miss is not reported.
- Without a framework component nothing holds a namespace: after `setLocale()` the app calls
  `load(ns)` again for the new locale.
- A component inside a deactivated `KeepAlive` or React `<Activity mode="hidden">` holds nothing; it
  loads when it is shown again.

## Alternatives rejected

- **`<T ns>` loads its namespace.** A list of components would start a request each, and a read would
  have side effects.
- **A public hold or unload API.** The component lifecycle is the hold; the cache is never evicted.
- **Reporting `missing_key` by a prediction of what will load.** It either silenced real misses or
  reported keys that were on their way.

## Where it lives

`isReady`, `isFetching`, the hold counts and the `missing_key` rule: `packages/core/src/instance.ts`,
`packages/core/src/state.ts`; `useI18n` per binding. Pinned in
`packages/core/tests/instance/contract-4c.test.ts`, `packages/react/tests/namespaces-4c.test.tsx`,
`packages/vue/tests/namespaces-4c.test.ts`, and the scope of `useI18n()` in
`packages/{react,vue,svelte,solid}/tests/ready-scope.test.*`, `packages/vue/tests/ready-scope-ssr.test.ts`,
`packages/solid/tests/ssr/ready-scope.test.tsx`.
