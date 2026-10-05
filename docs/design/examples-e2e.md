# Examples e2e: what a locale switch may show, and how the suite observes it

Status: accepted · Date: 2026-10-04 · Owner decision(s): step r is a strict contract with no
sub-frame exemption, the paint counter is diagnostics only, 04.10.2026; the unit of observation is
one delivered batch of DOM mutations, no `EXPECTED_FAILURES` entry for a mixed state, 04.10.2026

## Context

`pnpm examples:e2e` runs one Playwright scenario against the seven built examples
(`scripts/examples-e2e`). Step r watches the DOM through a locale switch, en → uk → de. Until this
record it judged only states that survived an animation frame: a mixed-language or raw-key state
replaced before the next paint was written to the report as a "sub-frame finding" and did not fail
the run. Two such states were recorded on every run and left standing:

- next: `<html lang>` committed in one batch and the translated text in a later one, so for one
  batch the page said `lang="uk"` over English text;
- svelte: the first render showed the raw keys before the documented `{#if $isInitializing}` gate
  closed.

Whether a state was painted depends on the machine, the load and the renderer. A verdict that
depends on them is not a contract.

## Decision

**Every observed state during a locale switch must be an allowed state, and anything else fails the
step.** The allowed states are:

1. the old locale in full: every watched text is the old locale's, and `<html lang>` (and `dir`)
   agree;
2. the new locale in full, the same way;
3. the documented loading state: the watched elements are not rendered.

A mixed-language state, a text under another locale's `lang`, and a raw key are failures, however
briefly they last.

**The unit of observation is one delivered batch of DOM mutations**: one `MutationObserver`
callback, at one microtask checkpoint. Operations made synchronously inside one batch are not
separate states and are not judged.

**The race is made deterministic, not sampled.** Under `--cdn` each switch's catalog is held at the
mock CDN until the barrier sees it in flight, and step r runs on a fresh server, so the state while
the catalog is outstanding is observed on every run.

**The paint counter stays, as diagnostics only.** Each failing state is written to the report with
whether a paint ran before the next state. It never affects the verdict.

**A mixed state is a defect in the adapter.** It is fixed there, with a red unit test, and never
listed in `EXPECTED_FAILURES`.

## Consequences

The two recorded states became failures and were fixed in their adapters:

- `@comvi/react` gained `<I18nProvider targetLocale>`: the tree renders in the locale a caller is
  switching the i18n instance to, from the render in which it changes until the i18n instance's
  locale next moves. Any move of the i18n instance's locale ends the handover. The instance counts
  its own moves (`localeRevision`), so a move no render or listener of the provider saw still ends it. `@comvi/next`'s
  provider passes the handed-over catalog as `messages` and its `locale` as `targetLocale`. The
  translated text now commits in the same React commit as the new `<html lang>`, and the browser
  no longer re-fetches the catalog the server sent.
- Until it commits, `messages` reaches the children through core's `withMessages` read view: only
  `t`, `tRaw` and `hasTranslation`. The view never writes catalogs, the locale or the active
  namespaces, and never emits `namespaceLoaded` or `localeChanged`. Translation diagnostics still
  fire as for any `t()` call: a missing key emits `missingKey`, and a throwing post-processor
  reaches `onError`.
- `@comvi/svelte`'s `isInitializing` reads `true` while the auto-init that `setI18nContext`
  scheduled has not started, so the documented gate is closed from the first render.

A new adapter behaviour that commits locale-dependent markup in two batches fails step r on its
first run, on every machine.

## Alternatives rejected

- **Judging painted states only.** The verdict depended on timing, and it let two real defects stand
  as "findings" for a release.
- **Judging every synchronous DOM operation.** Inside one batch the browser has not reached a
  checkpoint where anything observes the DOM, so an intermediate state there is not a state of the
  page.
- **An `EXPECTED_FAILURES` entry per adapter until a later lot.** A release would have shipped a
  known mixed state behind a green run.
- **Pinning Next's render locale to the route parameter outright.** `localePrefix: "never"` apps
  switch with `setLocale()` and no navigation, which a pinned render locale would ignore. The
  handover ends as soon as the i18n instance's locale moves.
- **Starting the Svelte auto-init synchronously.** It would run `init()` before anything composed
  later in the same component setup, and the documented manual `init()` right after
  `setI18nContext` would no longer be the one that starts it. Core's `init()` is single-flight, so
  this is about ordering, not about a double init.

## Addendum, 2026-10-05: a second namespace

The examples' second page renders a namespace of its own, `account`, that no `ns` list names. Four
steps cover it, on the packed tarballs:

- **w** counts requests. The first page makes none for the namespace, and opening the second page
  makes one. A prefetch hint the page declares (Nuxt's `<link rel="prefetch">`, the route prefetch
  of Next's `<Link>`) is not a load, as in step j. On Next the browser never fetches a catalog, so
  the request counted is the route's RSC payload, and the first page's HTML is also checked to
  hold none of the namespace's text.
- **x** is step r's contract on the second page. The watched set is the page's default-namespace
  text together with the three `account` rows, so "the locale applied before the namespace
  arrived" is a mixed state and fails. The en-only key's row must show the en value in every
  locale; a text every locale expects names no language.
- **y** reads the server HTML of `/uk/about` (next, nuxt), then runs the same observer from the
  parser's first insertion through hydration and checks that the browser fetches neither uk's
  nor en's `account` catalog.
- **z** runs in the dead-CDN build beside k2: the namespace has no `locale` shorthand, so the
  loader's `fallback` must hold the exact `locale:account` key.

**The mock CDN's modes are keyed by catalog, not by locale.** `uk` is the default namespace's uk
file and `uk:account` the namespace's, the names an import map uses. Under `--cdn` step x holds
both, releases the default namespace's first, and asserts the page is still the old locale in full
before it releases the namespace's. That forces the one state the step exists for. It applies where
the browser fetches catalogs (the five Vite examples and Nuxt). Next's second page is prerendered
and its browser fetches nothing, so there the switch is observed unheld.

**The activation lives in the component that needs it, and the rows wait for it to settle.** The
five client-rendered examples call `addActiveNamespace("account")` when the second view mounts and
render its rows only afterwards. Activating from an effect while rendering the scoped `t()` at once
commits one state of raw keys before `isLoading` turns true, which step x fails.

One limit is documented, not tested as a failure: in the browser, core loads a namespace for the
active locale only. The en-only row shows English when `account/en.json` is already cached (the
path x takes: open in en, then switch) and the key when the second page is first opened in another
locale. Next and Nuxt load the fallback chain on the server, which y asserts.

## Where it lives

- steps r and x, `observeStates`, `classify`, `stateProblem` and `judgeStates`:
  `scripts/examples-e2e/scenario.spec.ts`
- the mock CDN's hold mode, `catalogKey`, and the `cdn-r` and `cdn-x` phases: `startMockCdn` in
  `scripts/examples-e2e/lib.mjs`, `PHASES` and `CDN_STEERED` in `scripts/examples-e2e/run.mjs`
- the `account` namespace: `examples/locales/account/`, `Account.*` in the five client-rendered
  examples, `about/` in `examples/next`, `pages/about.vue` in `examples/nuxt`
- `targetLocale`: `I18nProvider` in `packages/react/src/I18nProvider.tsx`
- the Next handover: `I18nProvider` in `packages/next/src/client/I18nProvider.tsx`
- the Svelte gate: `autoInitPending` in `packages/svelte/src/stores.ts`, `setI18nContext` in
  `packages/svelte/src/context.ts`
