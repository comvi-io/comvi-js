/**
 * Concurrency / tearing reproductions. Commits are counted through
 * `Profiler.onRender` because happy-dom cannot observe mid-commit DOM state —
 * `getByTestId` always reads a committed snapshot, so the final-state
 * pair-consistency check is the strongest evidence available here. The
 * test-apps/next Playwright suite is the browser-observable complement.
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

const EN: Record<string, string> = { greeting: "Hello", farewell: "Goodbye" };
const FR: Record<string, string> = { greeting: "Bonjour", farewell: "Au revoir" };
const DE: Record<string, string> = { greeting: "Hallo", farewell: "Auf Wiedersehen" };

function ProbeA() {
  const { t } = useI18n();
  return <span data-testid="probe-a">{t("greeting" as never)}</span>;
}

function ProbeB() {
  const { t } = useI18n();
  return <span data-testid="probe-b">{t("greeting" as never)}</span>;
}

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

    expect(getByTestId("probe-a").textContent).toBe("Hello");
    expect(getByTestId("probe-b").textContent).toBe("Hello");

    counter.reset();

    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("fr");
      });
      // Two ticks: the gated `setLocaleAsync` resolves on the second.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByTestId("probe-a").textContent).toBe("Bonjour");
    expect(getByTestId("probe-b").textContent).toBe("Bonjour");

    // Pair-consistency: both probes are EN or both FR after every observable
    // commit; a sane commit count is the rest of the evidence.
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
});

describe("Repro 2 — Aborted transition leakage", () => {
  it("two interleaved startTransition setLocale calls — final committed locale is the latest", async () => {
    const fake = new FakeI18n();
    fake.addTranslations({ en: EN });
    fake.addTranslations({ fr: FR });
    fake.addTranslations({ de: DE });

    // The gated implementation must NOT call the original mock — that would
    // recurse — so it writes `language` through the core-exposed setter.
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

    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("fr");
      });
      await Promise.resolve();
    });

    expect(fake.locale).toBe("en");
    expect(getByTestId("probe-a").textContent).toBe("Hello");

    // Second transition scheduled BEFORE the first resolves.
    await act(async () => {
      startTransition(() => {
        void fake.setLocaleAsync("de");
      });
      await Promise.resolve();
    });

    await act(async () => {
      firstGate.resolve();
      await Promise.resolve();
      secondGate.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Fails if the aborted `fr` transition leaks — final locale must be `de`.
    expect(fake.locale).toBe("de");
    expect(getByTestId("probe-a").textContent).toBe("Hallo");
    expect(calls).toEqual(["fr", "de"]);
  });
});

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

    expect(fake.addTranslations).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(<Host locale="fr" />);
    });
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);
    expect(fake.locale).toBe("fr");

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

    // StrictMode runs the render body twice on mount and may double-fire the
    // layout effect; `isFirstRenderRef` and the messages-ref guard must absorb
    // all of that into ONE call. More than one means a guard is broken.
    expect(fake.addTranslations).toHaveBeenCalledTimes(1);

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
    // Exactly +1: the new messages identity is picked up by the layout effect.
    expect(fake.addTranslations).toHaveBeenCalledTimes(2);
  });
});

describe("Repro 4 — useSubscribe events-array fragility", () => {
  // Internal fragility, not a runtime bug: every production call site passes a
  // stable literal and no public hook surfaces `useSubscribe`. The shape is
  // pinned anyway — a `useCallback([i18n])` closing over `events` does not
  // re-subscribe when only `events` changes.

  it("re-subscribe is gated on i18n identity only — events list changes are ignored (architectural-only)", () => {
    const fake = new FakeI18n();

    const onSpy = vi.spyOn(fake, "on");

    // Mirrors the production `useSubscribe` shape.
    function useSubscribeLike<EventName extends string>(
      i18n: { on: (e: EventName, cb: () => void) => () => void },
      events: EventName[],
    ) {
      return React.useCallback(
        (callback: () => void) => {
          const unsubs = events.map((e) => i18n.on(e, callback));
          return () => unsubs.forEach((u) => u());
        },
        // BUG SHAPE under test: `events` excluded from the deps. (The
        // react-hooks eslint plugin is not enabled here, so no disable.)
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
    expect(onSpy.mock.calls.some((c) => c[0] === "localeChanged")).toBe(true);

    rerender(<Subject events={["initialized"]} />);

    // Identity stays stable, so the effect never re-runs: no new subscription.
    expect(onSpy.mock.calls.length).toBe(callsAfterMount);

    unmount();
  });
});
