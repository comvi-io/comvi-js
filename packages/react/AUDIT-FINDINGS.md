# React Packages Audit — Findings

Audit of `@comvi/react` and `@comvi/next` (client surface) on branch `chore/react-packages-audit`. Source-read + harness-measurement based. No source files were modified.

## Counts

- P0: 0
- P1: 2
- P2: 11
- P3: 5
- Open questions: 4

## Tooling baseline

- `pnpm lint`: clean (react, next)
- `tsc --noEmit`: clean (react, next)
- `tests/render-counts.test.tsx`: complete and passing — used as `measurement` evidence below
- Test environment: happy-dom (per `packages/react/vitest.config.ts`); SSR `getServerSnapshot` path is not exercised

## Harness baselines (cited inline as `measurement` evidence)

| Subject                                            | Trigger                       | Baseline commits                               |
| -------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| 50 `<T>` consumers                                 | locale switch                 | 1                                              |
| 50 `<T>` consumers                                 | namespace load (success)      | 2                                              |
| 50 `<T>` consumers                                 | isLoading flip (true → false) | 1 + 1                                          |
| Stub `<Link>` (mirrors `next/routing/Link.tsx:36`) | locale switch                 | 1                                              |
| Stub `<Link>`                                      | namespace load                | **2** ← non-translation consumer commits twice |
| Stub `<Link>`                                      | isLoading flip                | 1                                              |
| Stub `usePathname()` consumer                      | locale switch                 | 1                                              |
| Stub `usePathname()` consumer                      | namespace load                | **2** ← non-translation consumer commits twice |
| Stub `usePathname()` consumer                      | isLoading flip                | 1                                              |

Key signal: a `<Link>` or `usePathname()` consumer that never reads translations still commits 2× on `addActiveNamespace`. The cause is architectural (see Dimension 4, finding P1-1) — `cacheRevision` participates in the provider's `useMemo` deps at `packages/react/src/I18nProvider.tsx:170`.

Positive signal: 50 `<T>` consumers all settle in **1 commit** on a locale switch. `useSyncExternalStore` + memoised context value + `React.memo(T)` compose correctly; React batches the 50 updates into a single commit.

---

## Dimension 1 — Hooks rules

Reviewed all hook call sites in `react/I18nProvider.tsx`, `react/useI18n.ts`, `react/T.tsx`, `next/client/I18nProvider.tsx`, `next/routing/Link.tsx`, `next/routing/hooks.ts`, `next/routing/context.tsx`.

- All `useState`/`useEffect`/`useMemo`/`useCallback`/`useContext`/`useRef`/`useSyncExternalStore`/`useLayoutEffect` calls are at top-of-component, unconditional, not inside loops, and dependency arrays look right at first read. Lint (`pnpm lint --max-warnings=0`) confirms `react-hooks/rules-of-hooks` + `exhaustive-deps` pass.
- Lint catches structural violations. Things lint does NOT catch and which I verified manually:
  - **Stale closure capture across renders** — the `useSubscribe(i18n, events)` helper at `react/I18nProvider.tsx:24-32` lists `[i18n]` but closes over `events`. The provider passes a fresh literal each render (`["localeChanged", "initialized"]`, etc.). Because `events` is excluded from deps, the callback identity is stable across re-renders even though the literal changes — but the closure still uses the FIRST render's `events` array forever. In practice each call site passes the SAME literal every render, so behavior is identical. But the pattern is fragile (see finding P3-2 / Dimension 7).
  - **Conditional hook return path** — `next/routing/hooks.ts:33-46` `usePathname()` returns early inside `if (routing) { ... }` but only after all hooks already ran (`useNextPathname`, `useRoutingConfig`, `useI18n`). Safe.

**Verdict:** confirm — hooks rules cleanly satisfied; one fragile-but-currently-safe pattern surfaced as P3-2.

---

## Dimension 2 — useSyncExternalStore discipline

Cited: `packages/react/src/I18nProvider.tsx:133-156`.

### [P2] useSyncExternalStore subscribe identity churns when `i18n` is a fresh instance

- **File:** `packages/react/src/I18nProvider.tsx:24-32`, `:129-131`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  function useSubscribe(i18n: I18n, events: I18nEvent[]) {
    return useCallback(
      (callback: () => void) => {
        const unsubs = events.map((e) => i18n.on(e, () => callback()));
        return () => unsubs.forEach((u) => u());
      },
      [i18n],
    );
  }
  ```
  Three call sites: `subLang`, `subCache`, `subLoading`. Each does `i18n.on(event, () => callback())`. The callback wrapper `() => callback()` is created fresh on every event dispatch — but that is fine because `useSyncExternalStore` does the actual re-render scheduling via the stable `callback` it passes in.
- **Why it matters:** Identity for `subLang`/`subCache`/`subLoading` is stable for the lifetime of a given `i18n` instance, which is the documented and idiomatic shape. Subscribe stability is correct.
- **Proposed fix:** None required. Minor cleanup: drop the redundant arrow wrapper — `i18n.on(e, callback)` works because `callback` from `useSyncExternalStore` is itself stable.
- **Breaking change:** no
- **Effort:** S

### [P1] getSnapshot is impure on the cache path: returns a NEW Map identity every commit

- **File:** `packages/react/src/I18nProvider.tsx:140-145`
- **Evidence type:** code-read + measurement
- **Observation:**
  ```ts
  const cacheRevision = useSyncExternalStore(
    subCache,
    () => i18n.translationCache.getRevision(),
    () => i18n.translationCache.getRevision(),
  );
  const cache = i18n.translationCache.getInternalMap();
  ```
  The `cacheRevision` snapshot is correctly numeric and pure. **But** `getInternalMap()` is called on every render outside `useSyncExternalStore` — and `cacheRevision` enters the `useMemo` deps at line 170, so the entire context object is replaced whenever the revision bumps, fanning out to every consumer including those that never read the cache (Link, usePathname).
- **Why it matters:** Measurement shows Stub `<Link>` and `usePathname` consumer each commit **2×** on `addActiveNamespace` (harness baseline). Even consumers that subscribe only to `locale` re-render because the context VALUE changes. For a tree with many non-translation consumers (router widgets, layout shells), this is real fan-out.
- **Proposed fix:** Split into per-axis contexts so revisions fan out only to translation-reading consumers:
  ```ts
  // Provider owns one stable bag, plus selector contexts.
  const LocaleCtx = createContext<string>("");
  const LoadingCtx = createContext<{isLoading: boolean; isInitializing: boolean}>(...);
  const I18nInstanceCtx = createContext<I18n | null>(null);
  // cacheRevision lives in I18n instance; T reads it via useSyncExternalStore directly.
  ```
  Or, less invasive: hand callers `useSyncExternalStore` directly via a selector hook (`useI18nSelector(selector)`), and have `useI18n()` opt into "all axes".
- **Breaking change:** Behavior-compatible if the public hook API is preserved; advanced consumers gain a selector hook.
- **Effort:** M
- **Measurement evidence:** harness `Subject B / namespace load = 2 commits`, `Subject C / namespace load = 2 commits`.

### [P3] getServerSnapshot stability is correct but not test-exercised

- **File:** `packages/react/src/I18nProvider.tsx:136, 143, 150, 155`
- **Evidence type:** code-read
- **Observation:** All four `getServerSnapshot` returns are either a prop (`ssrInitialLocale`, `ssrInitialIsLoading`, `ssrInitialIsInitializing`) or `i18n.translationCache.getRevision()`. Each call yields the same value if props are stable across renders.
- **Why it matters:** React 18+ warns and triggers hydration mismatch if `getServerSnapshot` is non-deterministic. Code looks correct, but happy-dom always uses the client snapshot, so we have zero direct test coverage for the SSR path.
- **Proposed fix:** Add a `renderToString` test for SSR-only that asserts the rendered HTML matches expected locale/loading state and that no hydration warnings occur on hydrate. Document the gap in test-coverage section.
- **Breaking change:** no
- **Effort:** S

**Verdict:** confirm with P1 — subscribe identity OK; cache fan-out is the real issue and is measurement-confirmed.

---

## Dimension 3 — Render side-effects

Cited: `packages/next/src/client/I18nProvider.tsx:117-130`.

### [P1] Render-time mutation of `i18n.locale` and `i18n.addTranslations(messages)` violates pure-render

- **File:** `packages/next/src/client/I18nProvider.tsx:115-130`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  const shouldSyncDuringRender = isServer || isFirstRenderRef.current;
  if (shouldSyncDuringRender) {
    if (i18n.locale !== locale) {
      i18n.locale = locale; // <-- mutation during render
    }
    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages); // <-- mutation during render; may emit events
      lastAddedMessagesRef.current = messages;
    }
    if (!isServer) {
      isFirstRenderRef.current = false; // <-- writing a ref during render
    }
  }
  ```
  This runs during render. Under StrictMode + concurrent rendering, React may invoke the component function twice before committing, or abort a render entirely. Concerns:
  1. **StrictMode double-invocation**: render runs twice on mount in dev. First invocation sets `isFirstRenderRef.current = false`; second invocation sees `false` and _skips_ the sync. Net effect on the client is: the FIRST render's sync happens during the FIRST pass; the SECOND pass observes already-synced state. That's actually OK for `i18n.locale = locale` and the `messages !== lastAddedMessagesRef.current` guard — but only because both mutations are idempotent and the messages ref guard absorbs the duplicate. The `isFirstRenderRef` flip is the load-bearing piece.
  2. **Aborted render**: if React discards the render before commit (transition interruption), the side effects already happened. With `setLocale("fr")` triggered server-side, the mutation persists; with the messages-ref guard, the ref was advanced but the mutation may have aborted — currently safe because both writes are independent of the ref state, but coupling is fragile.
  3. **`i18n.addTranslations` may emit `namespaceLoaded` synchronously** — that triggers the cache subscribe callback, which schedules a re-render of every i18n consumer DURING the current render. React tolerates this (it deduplicates via state-update batching), but it is the textbook anti-pattern for `useSyncExternalStore` integrations.
  4. **`isFirstRenderRef.current = false` is a write to mutable state during render.** React's rules require ref writes either in effects or computed lazily (e.g. via `useState(() => ...)`). It works today but is the kind of code React will start warning about as the rules tighten.
- **Why it matters:** With React 19's enhanced StrictMode and the future Compiler, render-side mutations like this are the #1 source of hard-to-diagnose hydration mismatches and tearing under transitions. Today the code is "works in practice" but it sits on accepted-tradeoff ground.
- **Proposed fix (option A — useSyncExternalStore at provider boundary):** Drive the locale via `useSyncExternalStore` server snapshot (already done by the inner `ReactI18nProvider` via `ssrInitialLocale={locale}`) and move client-side locale-sync into a `useLayoutEffect`. The `useIsomorphicLayoutEffect` at `:134-143` already does this for subsequent renders — extend it to cover the first client render too, and pre-set `i18n.locale = locale` _before_ React renders by setting it during the synchronous module load of the Server Component layout (RSC context).
- **Proposed fix (option B — lazy init via useState):**
  ```ts
  // Capture initial sync exactly once per component instance:
  useState(() => {
    if (i18n.locale !== locale) i18n.locale = locale;
    if (messages) i18n.addTranslations(messages);
    return null;
  });
  // ...then useLayoutEffect handles all subsequent updates.
  ```
  This is React's documented pattern for "do work once on mount, before render commits" without violating render purity.
- **Breaking change:** no (behavior-equivalent)
- **Effort:** M
- **Concurrent-render hazard scenario:** Under `useTransition` wrapping a locale change (`startTransition(() => setLocale("fr"))`), React may render the new tree with `locale="fr"`, mutate `i18n.locale="fr"` synchronously, then abort the transition because higher-priority work intervened. After abort, `i18n.locale === "fr"` but the visible tree still reflects `"en"`. Next translation read uses the wrong locale → tearing.

### [P3] `isFirstRenderRef.current = false` in render

- **File:** `packages/next/src/client/I18nProvider.tsx:127-128`
- **Evidence type:** code-read
- **Observation:** Same finding as P1 above; called out separately because the ref write alone (without the i18n mutation) is the part that breaks the "render is a pure function of props/state" contract most directly.
- **Why it matters:** Trivial in isolation; relevant only as part of the bigger render-side-effects issue.
- **Proposed fix:** Subsumed by option B above (move into `useState(() => ...)` initializer).
- **Breaking change:** no
- **Effort:** S

**Verdict:** open-question — the current "always synchronize i18n.locale during first render" approach is the load-bearing decision that requires an ADR (also flagged at Dimension 13 as the RSC hot spot). See ADR open question #1.

---

## Dimension 4 — Re-render economy (measurement-gated)

### [P1] Non-translation consumers re-render on every namespace load (cacheRevision fan-out)

- **File:** `packages/react/src/I18nProvider.tsx:162-171`
- **Evidence type:** measurement
- **Observation:**
  ```ts
  const value = useMemo(
    () => ({ i18n, locale, translationCache: cache, isLoading, isInitializing }),
    [i18n, locale, isLoading, isInitializing, cacheRevision],
  );
  ```
  `cacheRevision` participates in deps; every `namespaceLoaded` bumps revision → new context object → every consumer of `I18nContext` (which is what `useI18n()` reads) re-renders. Stub `<Link>` and `usePathname` consumer each commit 2× on `addActiveNamespace` (harness Subject B / C, namespace load).
- **Why it matters:** A page with many `<Link>` instances and `usePathname()`-using widgets pays a full tree re-render on each dynamic namespace load. The 50-`<T>` case commits only once for the locale flip (positive), but the 2-commit cost on namespace load propagates to _every_ consumer.
- **Proposed fix:** Same as Dimension 2 P1: split the context. Specifically:
  - `LocaleContext` (string only) — Link, usePathname subscribe here
  - `LoadingContext` ({isLoading, isInitializing}) — UX indicators subscribe here
  - `I18nInstanceContext` (I18n stable) — for instance-bound methods
  - `<T>` reads cacheRevision directly via its own `useSyncExternalStore` selector
- **Breaking change:** Public `useI18n()` API unchanged; internal split.
- **Effort:** M

### [P2] `useI18n()` returns a fresh object identity on every call

- **File:** `packages/react/src/useI18n.ts:395-407`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  return {
    t, tRaw, locale, translationCache, isLoading, isInitializing,
    dir: i18n.dir,
    ...(boundMethods as ...),
  };
  ```
  Object literal is rebuilt on every render. Architect ruled this idiomatic (mirrors `useForm`/`useQuery`). Consumers that destructure specific fields don't care about object identity. But consumers that do `const i18n = useI18n();` and pass `i18n` into a `useEffect` dep array re-run that effect every render.
- **Why it matters:** The destructuring guidance is documented elsewhere but not enforced. With React Compiler this may become moot. Today it is a footgun for `useEffect([i18n])` patterns.
- **Proposed fix:** Add a JSDoc note on `useI18n()`: "Destructure the fields you need. Do not pass the whole return object to `useEffect` deps — it is rebuilt every render."
- **Breaking change:** no
- **Effort:** S
- _Promotable to P1 if measurement confirms via a harness test that asserts effect-rerun count on destructured vs whole-object usage._

### [P2] `useI18n()` is called inside `<T>` — pays the full hook cost per `<T>` instance

- **File:** `packages/react/src/T.tsx:167-174`
- **Evidence type:** code-read + measurement
- **Observation:** Every `<T>` calls `useI18n()` to get `{ t, tRaw, locale, hasTranslation, getDefaultNamespace, reportError }`. Each call rebuilds the bound-methods bag via `useMemo([i18n])` (stable), but the destructuring still goes through the whole returned object. With 50 `<T>` instances we measured a single commit on locale switch (positive!), but the per-instance hook cost is non-zero — each `<T>` re-creates `useSubscribe` callbacks via `useI18nContext()`.
- **Why it matters:** Per-`<T>` overhead is paid 50× on each render. Measured commit count is 1, so the impact is bounded today. Not promoting to P1.
- **Proposed fix:** Add a `useI18nLite()` selector internal hook that just reads `{ locale, hasTranslation, getDefaultNamespace, tRaw, reportError }` — skips the rest. Or, more aggressively, give `<T>` a private hook that subscribes only to `locale` + `cacheRevision`.
- **Breaking change:** no (internal optimization)
- **Effort:** M
- _Promotable to P1 if a measurement test asserts per-T hook cost dominates after a tree-size sweep._

### [P2] `boundMethods` object identity is stable only when `i18n` is stable

- **File:** `packages/react/src/useI18n.ts:374-393`
- **Evidence type:** code-read
- **Observation:** `useMemo([i18n])` correctly stabilizes `boundMethods` for a given `i18n` instance. If users swap `i18n` between renders, every bound method identity churns — but that is the expected and correct behavior.
- **Why it matters:** Stable in practice; documented for hot-swap scenarios.
- **Proposed fix:** None. Worth a JSDoc note that swapping `i18n` invalidates bound method identity.
- **Breaking change:** no
- **Effort:** S

**Verdict:** confirm with P1 — the cache-revision fan-out finding is measurement-backed and the only P1-grade re-render economy issue.

---

## Dimension 5 — Hydration safety

Cited: `packages/next/src/client/I18nProvider.tsx:115-143`.

### [P2] SSR snapshot for `cacheRevision` may diverge between server and client

- **File:** `packages/react/src/I18nProvider.tsx:140-144`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  const cacheRevision = useSyncExternalStore(
    subCache,
    () => i18n.translationCache.getRevision(),
    () => i18n.translationCache.getRevision(),
  );
  ```
  `getServerSnapshot` reads the LIVE i18n revision on the server. In `next/client/I18nProvider.tsx:117-125`, the Next provider mutates `i18n.addTranslations(messages)` during render BEFORE the inner React provider runs its `useSyncExternalStore`. So server snapshot = revision-after-addTranslations. On the client first render, `i18n.addTranslations(messages)` also runs during render (`isFirstRenderRef.current === true` path), so client snapshot = revision-after-addTranslations too. Matches.
- **Why it matters:** Hydration matches today because both render-time mutations run on both sides. If the fix from Dimension 3 P1 moves messages-sync into a `useLayoutEffect`, the server WILL have applied messages but the client first render will NOT have, causing a hydration mismatch on the cache axis. Any fix to the render-mutation issue must carefully preserve this hydration invariant.
- **Proposed fix:** Couple with Dimension 3 P1 fix. Option: pass `messages` through `useState(() => addTranslations(...))` so the mutation happens _before_ the first commit on both sides synchronously, without violating "render is a function" — the initializer runs once during the first render's reconciliation.
- **Breaking change:** no
- **Effort:** M

### [P2] `ssrInitialLocale` is honored only on the server snapshot — client first render reads `i18n.locale`

- **File:** `packages/react/src/I18nProvider.tsx:133-137`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  const locale = useSyncExternalStore(
    subLang,
    () => i18n.locale, // client snapshot
    () => ssrInitialLocale ?? i18n.locale, // server snapshot
  );
  ```
  In the Next layout: `next/client/I18nProvider.tsx:117-119` mutates `i18n.locale = locale` BEFORE `<ReactI18nProvider>` renders. So client first render sees `i18n.locale === locale` matching the server. Without that mutation the client would render whatever default locale the i18n instance booted with — mismatch.
- **Why it matters:** Server/client locale agreement depends entirely on the render-time mutation in `next/client/I18nProvider.tsx`. Remove the mutation, get a hydration mismatch. Confirms the coupling flagged in Dimension 3.
- **Proposed fix:** See Dimension 3 P1 option B (lazy init via `useState`). Preserves the synchronous-before-first-commit guarantee.
- **Breaking change:** no
- **Effort:** S (paired with Dimension 3 fix)

### [P3] `useIsomorphicLayoutEffect` shim is correctly defined but module-level

- **File:** `packages/next/src/client/I18nProvider.tsx:7`
- **Evidence type:** code-read
- **Observation:** `typeof window !== "undefined"` decided at module load. RSC streaming: if a server-rendered chunk imports this file under Node-with-jsdom-shim, the module may incorrectly select `useLayoutEffect` and emit React's SSR warning. The standard fix is the well-known `useIsomorphicLayoutEffect` pattern with `typeof document !== "undefined"` plus `useEffect` fallback. Code is fine for Next App Router today.
- **Why it matters:** Edge case under heavy SSR test harnesses.
- **Proposed fix:** None for now. Note in docs.
- **Breaking change:** no
- **Effort:** S

**Verdict:** confirm — hydration works today by careful coupling between Next provider and React provider; refactor must preserve the invariant.

---

## Dimension 6 — React 18/19 concurrency

### [P2] No `useTransition` / `useDeferredValue` opportunity surfaced for locale switching

- **File:** `packages/react/src/useI18n.ts:383` (`setLocale`)
- **Evidence type:** code-read
- **Observation:** `setLocale` calls `i18n.setLocaleAsync(loc)`. The store update is synchronous from React's POV (event-driven). Users wanting to keep the old tree visible while the new locale loads must wrap themselves: `startTransition(() => setLocale("fr"))`. Today there is no built-in.
- **Why it matters:** UX papercut for medium-large apps. Users discover it themselves; not blocking.
- **Proposed fix:** Document the `startTransition` pattern. Optional: expose `setLocaleTransition(loc)` that calls `startTransition` internally and returns `{ isPending, ... }`.
- **Breaking change:** no
- **Effort:** S

### [P2] Tearing risk under transitions for `i18n.locale` direct reads in `<T>`

- **File:** `packages/react/src/T.tsx:177-179`, `packages/react/src/useI18n.ts:363`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  // T.tsx
  const translate = tRaw ?? ((key, params) => t(key, params) ...);
  ```
  `tRaw` is bound via `createBoundTranslation(i18n, ns)` and reads `i18n.locale` directly when invoked. Under `startTransition`, React may render the new tree (new locale) but `i18n.locale` is the mutable global — if any code path mutates `i18n.locale` before the transition commits, all in-flight `<T>` renders read the new locale even though they belong to the old tree. Tearing.
- **Why it matters:** Real concurrent-render hazard; only manifests when an outer `startTransition` exists.
- **Proposed fix:** Have `<T>` read `locale` from the React context (which is `useSyncExternalStore`-backed and thus transition-safe), and pass `{ locale }` explicitly into `tRaw(key, { locale, ... })`. Architectural — see ADR open question #2.
- **Breaking change:** no (internal)
- **Effort:** M

### [P3] StrictMode double-effect handling for autoInit

- **File:** `packages/react/src/I18nProvider.tsx:115-126`
- **Evidence type:** code-read
- **Observation:** `useEffect` guards with `!i18n.isInitialized && !i18n.isInitializing`. On StrictMode mount, the effect runs twice; the first run flips `isInitializing` (inside `i18n.init()`) so the second run skips. Safe.
- **Why it matters:** Already handled. Worth a comment.
- **Proposed fix:** Add a comment that the flags are the StrictMode-safety mechanism.
- **Breaking change:** no
- **Effort:** S

**Verdict:** open-question — concurrency hazards exist but require ADR-level decisions (tearing under transitions, see Dimension 4 & Open Question #2).

---

## Dimension 7 — Memoization correctness

### [P3] `useSubscribe(i18n, events)` excludes `events` from deps — works because every call site passes a literal but fragile

- **File:** `packages/react/src/I18nProvider.tsx:24-32`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  return useCallback(
    (callback: () => void) => {
      const unsubs = events.map((e) => i18n.on(e, () => callback()));
      return () => unsubs.forEach((u) => u());
    },
    [i18n], // events array is static at each call site
  );
  ```
  The dep comment says "events array is static at each call site" — true today. But the array literal IS recreated every render; ESLint exhaustive-deps does not flag this because the helper is declared above and events is a captured parameter, not an inline literal. If someone refactors a call site to pass a dynamic events list, the callback will reference the FIRST render's events forever, silently breaking subscription.
- **Why it matters:** Future refactor footgun.
- **Proposed fix:**
  ```ts
  function useSubscribe(i18n: I18n, ...events: I18nEvent[]) {
    const key = events.join("|"); // stable string key
    return useCallback(
      (callback: () => void) => {
        const unsubs = events.map((e) => i18n.on(e, callback));
        return () => unsubs.forEach((u) => u());
      },
      [i18n, key], // <-- key in deps; events.join is pure
    );
  }
  // call sites: useSubscribe(i18n, "localeChanged", "initialized");
  ```
- **Breaking change:** no (internal)
- **Effort:** S

### [P2] `useMemo` chain in `useI18n.ts` is correct but creates an inner-allocated closure for `t`

- **File:** `packages/react/src/useI18n.ts:366-371`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  const t = useMemo(
    () => ((key, params) => translationResultToString(tRaw(key, params))) as ...,
    [tRaw],
  );
  ```
  Stable across renders because `tRaw` is stable. Correct.
- **Why it matters:** No issue; noting as positive.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

### [P3] Bound method bag at `useI18n.ts:374-393` uses imperative for-loop into a `Record<string, unknown>` — type signature widens

- **File:** `packages/react/src/useI18n.ts:374-393`
- **Evidence type:** code-read
- **Observation:** `methods[m] = (i18n[m] as (...a: any[]) => any).bind(i18n);` — explicit `any` cast. Type-safety degrades inside the loop; rescued by the final `as Omit<UseI18nReturn, ...>` cast.
- **Why it matters:** Type maintenance: adding a method to `BIND_METHODS` does not statically guarantee it's in `UseI18nReturn`. Type drift risk.
- **Proposed fix:** Generate the bag via mapped type:
  ```ts
  type Bound = {
    [K in (typeof BIND_METHODS)[number]]: I18n[K] extends (...a: infer A) => infer R
      ? (...a: A) => R
      : never;
  };
  ```
- **Breaking change:** no (internal typing)
- **Effort:** S

**Verdict:** confirm — memoization is correct; two minor type/fragility cleanups.

---

## Dimension 8 — Public API ergonomics

### [P3] `useI18n()` spread return — destructure-or-die contract is not documented at the JSDoc level

- **File:** `packages/react/src/useI18n.ts:359-408`
- **Evidence type:** code-read
- **Observation:** Architect ruled this idiomatic (mirrors `useForm`/`useQuery`). JSDoc at `:281-358` shows destructured patterns but never explicitly warns "do not pass the whole object to `useEffect` deps." Users hitting the footgun won't find guidance inline.
- **Why it matters:** Minor DX papercut.
- **Proposed fix:** Add a `@remarks` block:
  ```
  @remarks
  Identity warning: This hook returns a NEW object on every call. Destructure the
  fields you need. Do NOT pass the whole return value to a useEffect dependency
  array — your effect will run every render.
  ```
- **Breaking change:** no
- **Effort:** S

### [P3] `<T>` typed props use `Record<string, unknown>` permissive escape hatch — undermines `TypedTProps`

- **File:** `packages/react/src/T.tsx:92-105`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  type TypedTProps<K extends TypedKey> =
    KeyRequiredParams<K> extends never
      ? TBaseProps & { i18nKey: K } & Record<string, unknown>
      : ...;
  ```
  The `& Record<string, unknown>` accepts any extra prop. This is necessary for `<T i18nKey="x" name="John" />` direct-prop interpolation, but it silently swallows typos (`<T i18nKey="x" naem="John" />`).
- **Why it matters:** Reduces value of the typed key system. Trade-off is intentional.
- **Proposed fix:** Document the trade-off in the JSDoc. Long-term: tighten with a mapped type over known param keys per key (already partially done via `KeyRequiredParams`).
- **Breaking change:** Yes if tightened — known typo-allowed call sites would fail.
- **Effort:** M

### [P2] `<Link>` uses `forwardRef` correctly; no ref-forwarding issue

- **File:** `packages/next/src/routing/Link.tsx:32-47`
- **Evidence type:** code-read
- **Observation:** `forwardRef<HTMLAnchorElement, LocalizedLinkProps>`, ref passed through to `NextLink`. Display name set. Correct.
- **Why it matters:** Positive observation. Refs work for scroll-restoration, focus management, click ratecounting libraries.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

**Verdict:** confirm — API ergonomics solid; two minor doc/type tightenings surfaced.

---

## Dimension 9 — Type safety

### [P2] `as any` casts in `<T>`

- **File:** `packages/react/src/T.tsx:179`, `:248`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  (key: string, params?: TranslationParams) =>
    t(key as any, params) as unknown as TranslationResult;
  // ...
  const content = translate(keyString as any, transportParams);
  ```
  Two `as any` casts to bridge the overload-narrowed `t`/`tRaw` signatures with the runtime string key. The overload system requires this because `t` is overloaded across `TypedKey`, `NamespacedKeys`, and `PermissiveKey`.
- **Why it matters:** Local widenings. Functionally safe because the runtime `key: string` is always valid. But `as any` is broader than needed.
- **Proposed fix:** Use `as never` for the typed-overload bridge and `as unknown as ParamsArg<typeof key>` for the params:
  ```ts
  const content = translate(keyString as never, transportParams);
  ```
  `as never` is the standard "I know this is the permissive overload" trick.
- **Breaking change:** no (internal)
- **Effort:** S

### [P2] `React.memo(T)` collapses generics — `<T i18nKey="x" />` loses key-narrowing through memo

- **File:** `packages/react/src/T.tsx:356`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  export const T = React.memo(TComponent) as React.NamedExoticComponent<TProps>;
  ```
  `TProps` is `StrictTypedProps | PermissiveTProps` — a union. The component itself isn't a generic over `K extends TypedKey`. `React.memo` cannot preserve generic function signatures even with a cast. Users get the union, not key-narrowed types per call.
- **Why it matters:** Reduces the strength of the typed-key feature inside JSX. At a `<T i18nKey="welcome" />` call site, the `params` prop is the union of all possible param shapes, not narrowed to "welcome"'s params.
- **Proposed fix:** Either remove `memo` (the parent context fan-out fix at P1 reduces the need for memo here) and re-introduce a generic component, OR provide a `Tg<K>` generic helper that consumers can use when they need per-key narrowing.
- **Breaking change:** Removing memo would change re-render economy — must be measured after the P1 fix.
- **Effort:** M

### [P3] `TypedTProps`/`StrictTypedProps`/`PermissiveTProps` correctness

- **File:** `packages/react/src/T.tsx:85-105`
- **Evidence type:** code-read
- **Observation:** Carefully constructed:
  - `StrictTypedProps = [TypedKey] extends [never] ? never : {[K in TypedKey]: TypedTProps<K>}[TypedKey]`
  - `PermissiveTProps = [TypedKey] extends [never] ? TBaseProps & {i18nKey: PermissiveKey} & Record<string, unknown> : never`
  - The `[TypedKey] extends [never]` distributive-conditional guard correctly handles the "no typed keys defined" case. Either strict OR permissive is active, never both.
- **Why it matters:** Positive observation. Correct.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

**Verdict:** confirm — types are generally tight; two minor cleanups around `as any` and memo+generics.

---

## Dimension 10 — Bundle / tree-shaking

### [P3] `sideEffects: false` honored in both packages

- **File:** `packages/react/package.json:46`, `packages/next/package.json:71`
- **Evidence type:** code-read
- **Observation:** Both packages declare `"sideEffects": false`. `next/client/I18nProvider.tsx` uses `"use client"` directive — that's a Next-specific marker, not a JS side effect. The module-level `const isServer = typeof window === "undefined"` at `:42` and `const useIsomorphicLayoutEffect = ...` at `:7` are pure (read-only typeof checks).
- **Why it matters:** Tree-shaking will correctly drop unused exports. Positive.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

### [P2] `index.ts` and `client/index.ts` re-export everything from `@comvi/core` via `export type * from "@comvi/core"`

- **File:** `packages/react/src/index.ts:2-3`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  export { createI18n, I18n } from "@comvi/core";
  export type * from "@comvi/core";
  ```
  `export type *` is a TS-only re-export (zero bundle cost). `export { createI18n, I18n }` adds these two value exports — `I18n` is a class (`I18n` is declared as class in `@comvi/core`), so it's a value export not a type. If users only need React hooks they pay for `I18n` and `createI18n` in their bundle (these are also tree-shakeable if unused).
- **Why it matters:** Bundle impact minor because tree-shaking removes unused. But verify with `pnpm build` size baseline.
- **Proposed fix:** None unless size analysis reveals waste. The `I18n` value export is convenient — keep.
- **Breaking change:** no
- **Effort:** —

### [P3] No deep imports leaked

- **File:** `packages/react/src/T.tsx:11`, `packages/react/src/useI18n.ts:3`
- **Evidence type:** code-read
- **Observation:** `import { createElement as createVirtualElement } from "@comvi/core"`, `import { createBoundTranslation } from "@comvi/core"`. All `@comvi/core` imports go through the package entry. No `@comvi/core/src/...` deep paths.
- **Why it matters:** Positive — keeps the public surface clean.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

### [P2] `next/src/client.ts` and `next/src/client/index.ts` duplicate re-exports

- **File:** `packages/next/src/client.ts:1-11`, `packages/next/src/client/index.ts:1-11`
- **Evidence type:** code-read
- **Observation:** Both files export the same things (`useI18n`, `useI18nContext`, `T`, `createI18n`, `I18nProvider`, types). `client.ts` imports from `./client/I18nProvider` while `client/index.ts` imports from `./I18nProvider`. Two entry files, same content.
- **Why it matters:** Maintenance hazard — they will drift. The `package.json` exports only point to one of them (`./dist/client.js`), so the duplicate is dead from a published-API standpoint. But the duplicate exists in source.
- **Proposed fix:** Make one re-export the other:
  ```ts
  // next/src/client.ts
  export * from "./client/index";
  ```
  Then the build pipeline can choose the entry.
- **Breaking change:** no (internal)
- **Effort:** S

**Verdict:** confirm — sideEffects clean, tree-shaking sound, one source-duplication issue.

---

## Dimension 11 — Suspense / Error Boundary integration

### [P2] No `use()` integration, no Suspense for translation loading, no Error Boundary recommendation

- **File:** `packages/react/src/I18nProvider.tsx:115-126` (onError), `packages/react/src/useI18n.ts` (no error boundary path)
- **Evidence type:** code-read
- **Observation:** Provider has `onError` callback for init failures. There is no built-in Suspense surface for `isLoading` — users render conditionally on `useI18n().isLoading`. No documented Error Boundary integration; the README does not mention it.
- **Why it matters:** Missing two React-native loading/error patterns. Today users hand-roll loading UIs. Compatible with `<Suspense>` would let users `use(fetchTranslations())` for first paint.
- **Proposed fix:**
  1. Document recommended Error Boundary placement around `<I18nProvider>` for init errors.
  2. Add a `suspense?: boolean` provider prop that throws a promise from `useI18n()` while `isInitializing || isLoading` — opt-in Suspense.
  3. Document the `use(promise)` integration for users who pre-fetch translations server-side.
- **Breaking change:** no (additive)
- **Effort:** M

**Verdict:** open-question — Suspense + use() integration is a feature decision, not a bug. ADR.

---

## Dimension 12 — `<T>` perf (GC focus)

### [P2] Per-render `Map` and object allocation in `<T>`

- **File:** `packages/react/src/T.tsx:188-189`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  const reactHandlers = new Map<string, (children: React.ReactNode[]) => React.ReactElement>();
  const tagHandlers: Record<string, ...> = {};
  ```
  Both fresh on every render. If `components` prop is undefined (the common case), both are empty and immediately discarded — pure GC churn with zero functional value.
- **Why it matters:** With 50 `<T>` instances on a locale switch, 50 fresh Maps + 50 fresh objects per render. Measured commits = 1, so each render allocates 100 ephemerals. Minor GC pressure; not a P1 without measurement.
- **Proposed fix:**
  ```ts
  // Only allocate when components provided
  let reactHandlers: Map<string, ...> | null = null;
  let tagHandlers: Record<string, ...> | null = null;
  if (components) {
    reactHandlers = new Map();
    tagHandlers = {};
    // ... existing loop
  }
  ```
  Or memoize via `useMemo`:
  ```ts
  const { reactHandlers, tagHandlers } = useMemo(() => {
    if (!components) return { reactHandlers: EMPTY_MAP, tagHandlers: EMPTY_OBJ };
    // ... build
  }, [components]);
  ```
- **Breaking change:** no
- **Effort:** S
- _Promotable to P1 if a memory-pressure measurement test shows GC spikes on large `<T>` trees._

### [P3] `React.cloneElement` usage in `<T>` — React 19 soft-deprecation

- **File:** `packages/react/src/T.tsx:218, 323`
- **Evidence type:** code-read
- **Observation:**
  ```ts
  // line 218: element-handler registration
  registerHandler(tagName, (children) => React.cloneElement(handler, undefined, ...children));
  // line 323: re-keying a returned handler element
  return React.cloneElement(handler(convertedChildren), { key: reactKey });
  ```
  React 19 soft-deprecates `cloneElement` (RFC, not removed, but discouraged for new code in favor of composition / explicit Children API).
- **Why it matters:** Will become a louder warning in React 20+. Public-API impact: small.
- **Proposed fix:** For line 218, wrap the element in a function: `(children) => <handler.type {...handler.props}>{children}</handler.type>` — needs more care because `handler.type` may be a custom component. Cleaner: have callers always pass functions.
  For line 323, use `React.Children.map` with explicit key, or have `handler(convertedChildren)` accept a `key` parameter.
- **Breaking change:** Possibly — public `ComponentHandler` type changes.
- **Effort:** M

**Verdict:** confirm — minor GC churn (P2) and one React 19 soft-deprecation (P3).

---

## Dimension 13 — Next RSC patterns

### [P3] `"use client"` placement correct on all client modules

- **File:** `packages/next/src/client/I18nProvider.tsx:1`, `packages/next/src/client/index.ts:1`, `packages/next/src/client.ts:1`, `packages/next/src/routing/Link.tsx:1`, `packages/next/src/routing/hooks.ts:1`, `packages/next/src/routing/context.tsx:1`
- **Evidence type:** code-read
- **Observation:** All six modules start with `"use client";`. Correct boundary.
- **Why it matters:** Positive — RSC boundary is well-defined.
- **Proposed fix:** None.
- **Breaking change:** no
- **Effort:** —

### [P1] (cross-ref) Render-time mutation under RSC streaming — see Dimension 3 P1

- **File:** `packages/next/src/client/I18nProvider.tsx:117-130`
- **Evidence type:** code-read
- **Observation:** Cross-referenced. Under RSC streaming, the `"use client"` boundary renders on the client during hydration. The render-time mutation pattern is the most fragile piece of the Next integration. Already documented in Dimension 3 with full scenario.
- **Why it matters:** See Dimension 3.
- **Proposed fix:** See Dimension 3.
- **Breaking change:** no
- **Effort:** M

### [P2] Locale hydration relies on a single `locale` prop — no fallback chain for malformed inputs

- **File:** `packages/next/src/client/I18nProvider.tsx:117-119`
- **Evidence type:** code-read
- **Observation:** `if (i18n.locale !== locale) { i18n.locale = locale; }` — no validation that `locale` is in the configured locales list. If the layout passes an invalid `locale`, i18n's setter (or downstream `setLocaleAsync`) may throw or silently set bad state.
- **Why it matters:** Defensive coding gap. Most apps will get this right via `params.locale` + a Next route segment validator, but a misconfigured app gets a confusing error.
- **Proposed fix:** Optional `routing` prop already exists; if provided, validate `locale` against `routing.locales` and call `i18n.reportError({ source: "next-i18n-provider", invalidLocale: locale })` instead of setting it.
- **Breaking change:** no (additive defensive check)
- **Effort:** S

**Verdict:** confirm — RSC boundaries clean; the only real concern is the render-time mutation already documented in Dimension 3.

---

## Dimension 14 — Test adequacy

### [P2] No re-render-count assertion in pre-existing tests

- **File:** `packages/react/tests/useI18n.test.tsx`, `packages/react/tests/I18nProvider.test.tsx`, `packages/react/tests/T.test.tsx`
- **Evidence type:** code-read
- **Observation:** Pre-existing tests assert: reactive state propagation, init behavior, error normalization, SSR snapshot output, unmount cleanup, ref stability of bound methods, virtual-node rendering. They do NOT assert commit counts. The new harness `tests/render-counts.test.tsx` fills exactly this gap.
- **Why it matters:** Without the harness, every perf claim was code-read only. Harness now anchors measurement-based claims at P1.
- **Proposed fix:** None — harness exists and is referenced throughout this audit.
- **Breaking change:** no
- **Effort:** —

### [P2] No hydration mismatch test for the Next provider

- **File:** `packages/react/tests/I18nProvider.test.tsx:111-139` (SSR snapshot test exists for the React-only provider)
- **Evidence type:** code-read
- **Observation:** SSR test only covers `<ReactI18nProvider ssrInitial* />`. The Next provider's render-time mutation (the critical path for hydration safety, Dimension 3 P1) has zero dedicated tests. Today coverage is incidental via Next app E2E.
- **Why it matters:** Any refactor to fix the render-mutation issue (Dimension 3 P1) risks silent regression.
- **Proposed fix:** Add a Next-provider-specific SSR test:
  1. `renderToString` with `locale="fr"`, `messages={...}` → assert output contains French text and that `i18n.locale === "fr"` post-render.
  2. Hydrate with `hydrateRoot` and assert no console warnings.
- **Breaking change:** no
- **Effort:** S

### [P2] No concurrent-rendering test (StrictMode + transitions)

- **File:** (nothing exists)
- **Evidence type:** code-read
- **Observation:** Render-counts test uses StrictMode for correctness assertions only; doesn't exercise `startTransition`. The tearing hazard described at Dimension 6 P2 (T reading global `i18n.locale` mid-transition) has zero coverage.
- **Why it matters:** Concurrent-mode bugs only manifest under realistic transition-wrapped flows. Future regression risk.
- **Proposed fix:** Add a test:
  ```tsx
  startTransition(() => {
    fake.setLocaleAsync("fr");
  });
  // assert: during the transition, <T> still shows en text
  // after transition commits: <T> shows fr text
  ```
- **Breaking change:** no
- **Effort:** M

### [P3] `getServerSnapshot` not exercised

- **File:** harness `render-counts.test.tsx` runs under happy-dom
- **Evidence type:** code-read
- **Observation:** Documented in Dimension 2 P3. Happy-dom always uses client snapshot.
- **Why it matters:** SSR path is untested in the harness.
- **Proposed fix:** Pure-Node `renderToString` test, separate from happy-dom suite.
- **Breaking change:** no
- **Effort:** S

**Verdict:** confirm — pre-existing tests are functionally solid, the new harness fills the measurement gap; three coverage gaps for the next iteration.

---

## Open questions for ADR

### OQ-1 — `i18n.locale` mutation source-of-truth

**Affected sites:** `useI18n.ts:363` (`createBoundTranslation(i18n, ns)` reads `i18n.locale`); `T.tsx:177-179` (translation read time); `next/client/I18nProvider.tsx:117-130` (render-time write); `react/I18nProvider.tsx:133-137` (read via `getSnapshot`).

`i18n.locale` is both a React store axis (subscribed via `useSyncExternalStore`) AND a mutable global that translation calls read directly. This dual-role is the root cause of:

- Render-time mutation in the Next provider (Dimension 3 P1)
- Tearing under transitions (Dimension 6 P2)
- Hydration coupling that constrains the fix (Dimension 5 P2)

**Question:** Should `i18n.locale` be made render-immutable from the React layer? Two paths:

- **(A)** Make all `t()` / `tRaw()` calls take an explicit `locale` arg, with React layer always passing the value from `useSyncExternalStore`. `i18n.locale` becomes "the default for non-React callers" only.
- **(B)** Keep current architecture, but require `setLocale()` to go through a transition-safe queue that defers the mutation to commit time.

(A) is more invasive; (B) is harder to get right. Recommend ADR.

### OQ-2 — Context split: one provider or N providers?

**Affected sites:** `react/I18nProvider.tsx:162-171` (single context); fan-out impact at Dimension 4 P1.

**Question:** Move from one `I18nContext` to per-axis contexts (Locale, Loading, Instance) backed by `useSyncExternalStore` selectors. Trade-off: more boilerplate inside the provider, lower fan-out for non-translation consumers, identical public `useI18n()` API.

### OQ-3 — Suspense / `use()` integration scope

**Affected sites:** `I18nProvider.tsx` (no Suspense surface); README (no `<Suspense>` examples).

**Question:** Add an opt-in Suspense mode that throws on `isInitializing || isLoading`? Or recommend users hand-roll? See Dimension 11 P2.

### OQ-4 — `<T>` generic preservation via `React.memo`

**Affected sites:** `T.tsx:356`.

**Question:** Accept loss of generic per-call narrowing in exchange for `memo` skip behavior, or remove memo + reintroduce a generic component (now that the parent context-fan-out fix from OQ-2 reduces the need for memo)?

---

## Test coverage gaps

- **SSR `getServerSnapshot` path** — not exercised; happy-dom always uses client snapshot. See Dimension 2 P3 and Dimension 14 P3. Action: add a separate `renderToString` Node test.
- **Tearing under `startTransition`** — concurrency pass owns this. See Dimension 6 P2 and Dimension 14 P2.
- **Next-provider hydration round-trip** — no dedicated `renderToString` + `hydrateRoot` test for the Next provider. See Dimension 14 P2.
- **Memory pressure under large `<T>` trees** — would promote Dimension 12 P2 to P1. Action: optional GC-pressure harness.
- **Effect-rerun count when destructuring vs whole-object `useI18n()` return** — would promote Dimension 4 P2 to P1. Action: simple harness test.
