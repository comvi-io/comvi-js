/**
 * Concurrency / tearing reproductions:
 *  1. startTransition + locale flip
 *  2. Aborted transition leakage
 *  3. Next-provider render-time mutation idempotency
 *  4. useSubscribe events-array fragility
 *
 * Commits counted via Profiler.onRender. happy-dom cannot observe
 * mid-commit DOM state; the test-apps/next Playwright suite is the
 * browser-observable complement.
 */

import React, { Profiler, StrictMode, startTransition, type ProfilerOnRenderCallback } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { I18nProvider as NextI18nProvider } from "../../next/src/client/I18nProvider";
import type { MessagesMap } from "../../next/src/client/I18nProvider";

import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import { createDeferred } from "./test-utils";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function makeCounter() {
  let count = 0;
  const onRender: ProfilerOnRenderCallback = () => {
    count += 1;
  };
  return {
    onRender,
    reset: () => {
      count = 0;
    },
    get: () => count,
  };
}

// ---------------------------------------------------------------------------
// Translation fixtures
// ---------------------------------------------------------------------------

const EN: Record<string, string> = { greeting: "Hello", farewell: "Goodbye" };
const FR: Record<string, string> = { greeting: "Bonjour", farewell: "Au revoir" };
const DE: Record<string, string> = { greeting: "Hallo", farewell: "Auf Wiedersehen" };

// ---------------------------------------------------------------------------
// Probe components used by tearing scans
// ---------------------------------------------------------------------------

function ProbeA() {
  const { t } = useI18n();
  return <span data-testid="probe-a">{t("greeting" as never)}</span>;
}

function ProbeB() {
  const { t } = useI18n();
  return <span data-testid="probe-b">{t("greeting" as never)}</span>;
}

// ===========================================================================
// REPRO 1 — startTransition + locale flip (TEARING)
// ===========================================================================

describe("Repro 1 — startTransition + locale flip", () => {
  let fake: FakeI18n;

  beforeEach(() => {
    fake = new FakeI18n();
    fake.addTranslations({ en: EN });
    fake.addTranslations({ fr: FR });
  });

  it("two <T> consumers commit pair-consistent locale under startTransition (StrictMode OFF)", async () => {
    const counter = makeCounter();

    const { getByTestId } = render(
      <Profiler id="repro-1" onRender={counter.onRender}>
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <ProbeA />
          <ProbeB />
        </I18nProvider>
      </Profiler>,
    );

    // Initial state: both should be EN.
    expect(getByTestId("probe-a").textContent).toBe("Hello");
    expect(getByTestId("probe-b").textContent).toBe("Hello");

    counter.reset();

    // Drive a locale change inside a transition.
    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("fr");
      });
      // Flush microtasks for the pending setLocaleAsync.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Final committed text: both probes must reflect FR.
    expect(getByTestId("probe-a").textContent).toBe("Bonjour");
    expect(getByTestId("probe-b").textContent).toBe("Bonjour");

    // Pair-consistency invariant: after every commit observable from the
    // outside, both probes are either both EN or both FR. happy-dom can
    // only observe the FINAL committed DOM — see harness limitation note
    // below — but the final state pair-consistency is asserted above and
    // commit count is sane.
    expect(counter.get()).toBeGreaterThan(0);
    expect(counter.get()).toBeLessThanOrEqual(3);
  });

  it("two <T> consumers commit pair-consistent locale under startTransition (StrictMode ON)", async () => {
    const { getByTestId } = render(
      <StrictMode>
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <ProbeA />
          <ProbeB />
        </I18nProvider>
      </StrictMode>,
    );

    expect(getByTestId("probe-a").textContent).toBe("Hello");
    expect(getByTestId("probe-b").textContent).toBe("Hello");

    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("fr");
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByTestId("probe-a").textContent).toBe("Bonjour");
    expect(getByTestId("probe-b").textContent).toBe("Bonjour");
  });

  // HARNESS LIMITATION: happy-dom does not expose mid-commit DOM state.
  // React commits a tree atomically into the DOM; `getByTestId` always reads
  // a committed snapshot. The architectural tearing hazard ("<T> reads
  // i18n.locale via the bound translation function while a transition is in
  // flight") would manifest only if React rendered the tree against stale
  // state but committed it as-if-new. Under happy-dom + a synchronous
  // FakeI18n, the only state we can read post-commit is the final committed
  // text.
  //
  //   The pair-consistency check is therefore strongest-available evidence.
  //   This finding remains "architectural concern only, not P1+" per the
  //   audit's attempt-then-declare rule.
});

// ===========================================================================
// REPRO 2 — Aborted-transition leakage of `i18n.locale`
// ===========================================================================

describe("Repro 2 — Aborted transition leakage", () => {
  it("two interleaved startTransition setLocale calls — final committed locale is the latest", async () => {
    const fake = new FakeI18n();
    fake.addTranslations({ en: EN });
    fake.addTranslations({ fr: FR });
    fake.addTranslations({ de: DE });

    // Wrap setLocaleAsync with a gated implementation. We DON'T call the
    // original mock (that would recurse infinitely); instead we write
    // language directly via the core-exposed setter.
    const firstGate = createDeferred<void>();
    const secondGate = createDeferred<void>();
    const calls: string[] = [];

    fake.setLocaleAsync.mockImplementation(async (loc: string) => {
      calls.push(loc);
      if (loc === "fr") await firstGate.promise;
      if (loc === "de") await secondGate.promise;
      const from = fake.language;
      fake.language = loc;
      fake.emit("localeChanged", { from, to: loc });
    });

    const { getByTestId } = render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <ProbeA />
      </I18nProvider>,
    );
    expect(getByTestId("probe-a").textContent).toBe("Hello");

    // Schedule first transition (target fr) — promise is pending.
    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("fr");
      });
      await Promise.resolve();
    });

    // Probe still EN — fr setter is gated.
    expect(fake.locale).toBe("en");
    expect(getByTestId("probe-a").textContent).toBe("Hello");

    // Schedule second transition (target de) BEFORE first resolves.
    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("de");
      });
      await Promise.resolve();
    });

    // Resolve gates in order they were scheduled.
    await act(async () => {
      firstGate.resolve();
      await Promise.resolve();
      secondGate.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Audit-finding probe: if fr "leaks" (final committed locale is fr,
    // not de), this fails and confirms the leakage. If final is de,
    // behavior is sound under this harness.
    expect(fake.locale).toBe("de");
    expect(getByTestId("probe-a").textContent).toBe("Hallo");
    expect(calls).toEqual(["fr", "de"]);
  });
});

// ===========================================================================
// REPRO 3 — Next provider render-time mutation idempotency
// ===========================================================================

describe("Repro 3 — Next provider render-time mutation idempotency", () => {
  it("addTranslations is called exactly once per stable messages prop across re-renders (StrictMode OFF)", () => {
    const fake = new FakeI18n();
    fake.locale = "en";
    fake.isInitialized = true; // skip autoInit init() path

    const messages: MessagesMap = { en: { greeting: "Hello" } };

    function Host({ locale }: { locale: string }) {
      return (
        <NextI18nProvider i18n={fake.asI18n()} locale={locale} messages={messages} autoInit={false}>
          <span data-testid="x" />
        </NextI18nProvider>
      );
    }

    const { rerender } = render(<Host locale="en" />);

    // Initial mount triggers one render-time sync — addTranslations once.
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);

    // Re-render with a new locale; messages ref unchanged — still 1.
    act(() => {
      rerender(<Host locale="fr" />);
    });
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);
    expect(fake.locale).toBe("fr");

    // Re-render flipping back to en — still 1.
    act(() => {
      rerender(<Host locale="en" />);
    });
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);
    expect(fake.locale).toBe("en");
  });

  it("addTranslations call count under StrictMode on first mount", () => {
    const fake = new FakeI18n();
    fake.locale = "en";
    fake.isInitialized = true;

    const messages: MessagesMap = { en: { greeting: "Hello" } };

    function Host({ locale }: { locale: string }) {
      return (
        <NextI18nProvider i18n={fake.asI18n()} locale={locale} messages={messages} autoInit={false}>
          <span data-testid="x" />
        </NextI18nProvider>
      );
    }

    const { rerender } = render(
      <StrictMode>
        <Host locale="en" />
      </StrictMode>,
    );

    // Under StrictMode:
    //   - The render body runs twice on mount. First pass: shouldSync=true,
    //     mutates and flips isFirstRenderRef.current to false. Second pass:
    //     shouldSync=false, so no extra addTranslations there.
    //   - useIsomorphicLayoutEffect also runs (and may double-fire under
    //     StrictMode); the messages-ref guard absorbs duplicate calls.
    //
    // Net expectation: ONE addTranslations call. If we see more, the ref
    // guard or the gating logic is broken.
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);

    // Locale flip with stable messages ref: still 1.
    act(() => {
      rerender(
        <StrictMode>
          <Host locale="fr" />
        </StrictMode>,
      );
    });
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);
  });

  it("a new messages object identity triggers exactly one additional addTranslations call", () => {
    const fake = new FakeI18n();
    fake.locale = "en";
    fake.isInitialized = true;

    const messages1: MessagesMap = { en: { greeting: "Hello" } };
    const messages2: MessagesMap = { fr: { greeting: "Bonjour" } };

    function Host({ locale, messages }: { locale: string; messages: MessagesMap }) {
      return (
        <NextI18nProvider i18n={fake.asI18n()} locale={locale} messages={messages} autoInit={false}>
          <span data-testid="x" />
        </NextI18nProvider>
      );
    }

    const { rerender } = render(<Host locale="en" messages={messages1} />);
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(<Host locale="fr" messages={messages2} />);
    });
    // Exactly +1 — the new messages identity should be picked up by the
    // useLayoutEffect (or the render-time path if isFirstRenderRef is still
    // true, which it shouldn't be here).
    expect(fake.addTranslations).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// REPRO 4 — useSubscribe events-array fragility
// ===========================================================================

describe("Repro 4 — useSubscribe events-array fragility", () => {
  // External attack surface: NONE. All three call sites in
  // src/I18nProvider.tsx:129-131 pass stable literals. There is no public
  // hook that surfaces useSubscribe to callers. So this is an internal
  // fragility, not a runtime bug.
  //
  // We still demonstrate the architectural shape: a useCallback([i18n])
  // that closes over `events` will NOT re-subscribe when events alone
  // change, because callback identity is gated on i18n.

  it("re-subscribe is gated on i18n identity only — events list changes are ignored (architectural-only)", () => {
    const fake = new FakeI18n();

    const onSpy = vi.spyOn(fake, "on");

    // Mirror src/I18nProvider.tsx:24-32 useSubscribe shape.
    function useSubscribeLike<EventName extends string>(
      i18n: { on: (e: EventName, cb: () => void) => () => void },
      events: EventName[],
    ) {
      return React.useCallback(
        (callback: () => void) => {
          const unsubs = events.map((e) => i18n.on(e, callback));
          return () => unsubs.forEach((u) => u());
        },
        // BUG SHAPE: events excluded from deps — matches production
        // useSubscribe at react/I18nProvider.tsx:24-32. react-hooks plugin
        // is not loaded in this project's eslint config so no disable needed.
        [i18n],
      );
    }

    const i18nStable = fake.asI18n() as never;

    function Subject({ events }: { events: Array<"localeChanged" | "initialized"> }) {
      const sub = useSubscribeLike(i18nStable, events);
      React.useEffect(() => {
        const unsub = sub(() => {});
        return () => unsub();
      }, [sub]);
      return null;
    }

    const { rerender, unmount } = render(<Subject events={["localeChanged"]} />);
    const callsAfterMount = onSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);
    // First subscription must have been against localeChanged.
    expect(onSpy.mock.calls.some((c) => c[0] === "localeChanged")).toBe(true);

    // Re-render with DIFFERENT events array.
    rerender(<Subject events={["initialized"]} />);

    // The buggy useCallback shape keeps identity stable; useEffect dep
    // does not change; no new subscription is created.
    expect(onSpy.mock.calls.length).toBe(callsAfterMount);

    unmount();
  });
});
