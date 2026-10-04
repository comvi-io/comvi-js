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
  locale next moves. `@comvi/next`'s provider adds the handed-over catalog during render and
  passes its `locale` as `targetLocale`. The translated text now commits in the same React commit
  as the new `<html lang>`, and the browser no longer re-fetches the catalog the server sent.
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

## Where it lives

- step r, `classify`, `stateProblem` and the observer: `scripts/examples-e2e/scenario.spec.ts`
- the mock CDN's hold mode and the `cdn-r` phase: `startMockCdn` in
  `scripts/examples-e2e/lib.mjs`, `PHASES` and `CDN_STEERED` in `scripts/examples-e2e/run.mjs`
- `targetLocale`: `I18nProvider` in `packages/react/src/I18nProvider.tsx`
- the Next handover: `I18nProvider` in `packages/next/src/client/I18nProvider.tsx`
- the Svelte gate: `autoInitPending` in `packages/svelte/src/stores.ts`, `setI18nContext` in
  `packages/svelte/src/context.ts`
