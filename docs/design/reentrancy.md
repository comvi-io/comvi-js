# Re-entrancy: what may call `setLocale()`, and what the instance guarantees when it does

Status: accepted · Date: 2026-10-31 · Moved here 2026-11-25 from the release notes file the tests
cited. A queue of nested operations was built and then removed by decision of 31.10: it cost about
100 B for cases outside what a loader is for.

## Context

Subscribers react to a published change, and a subscriber may want to switch the language (a
redirect after a locale is detected, say). A loader or an abort listener could also call back into
the instance while it is in the middle of a load or a switch. Each of those calls arrives while the
instance's own bookkeeping is half done.

## Decision

- **The loader only fetches a catalog.** A synchronous `setLocale()` from a loader or from an abort
  listener is outside the contract: no timers, statuses or runtime diagnostics guard it.
- **`setLocale()` from a subscriber is supported.** The last call wins, decided at the call; no order
  of notifications is promised, and a later subscriber may read the final locale twice.
- **What the instance keeps true in any case:**
  - an old completion or abort never removes a newer request of the same pair;
  - a request is registered before its loader runs;
  - a request has left the in-flight set, `ready` and the published state before its abort listeners
    run, in a switch and in `destroy()`;
  - a superseded switch applies nothing, cancels nothing of the newer call and resolves;
  - an abort settles the wait even if the loader ignores its signal;
  - after `destroy()` nothing starts and nothing is published, so every caller settles.
- **Not built:** protection against endless switching between subscribers, or against a loader
  that awaits a switch that awaits it.

## Consequences

- An app may switch the language from a subscriber, a plugin or a router guard.
- A loader that calls `setLocale()` has undefined results; the tests that exercise it pin only the
  final state, not a promise.

## Alternatives rejected

- **A queue of nested operations** that ran re-entrant calls after the current one: correct for the
  unsupported cases too, at about 100 B in every bundle (removed 31.10).

## Where it lives

`setLocale`, `load`, `destroy` and the request bookkeeping in `packages/core/src/instance.ts`. Pinned
in `packages/core/tests/instance/reentrancy.test.ts` and `packages/core/tests/instance/locale.test.ts`.
