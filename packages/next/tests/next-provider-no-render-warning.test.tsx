/**
 * Regression tests: React "Cannot update a component while rendering a different component" warning.
 *
 * Root cause (verified in packages/core/src/core/i18n.ts:438-448):
 *   render → addTranslations() → _emit("configChanged") [synchronous]
 *   → subscribe handler callback() [synchronous, inside React render]
 *   → scheduleUpdateOnFiber(SiblingFiber) while isRendering=true
 *   → console.error("Cannot update a component...")
 *
 * React only fires this warning when BOTH conditions hold:
 *   1. isRendering === true (we are inside a component's render body)
 *   2. root === workInProgressRoot (both components share the same React root)
 *
 * The tests here reproduce condition 1 by having a component call
 * addTranslations() from its useState lazy initializer (same pattern as the
 * Next I18nProvider), while condition 2 is satisfied by having the subscribed
 * sibling in the same React root.
 *
 * Test A MUST fail on develop (before the queueMicrotask fix) and pass after.
 * Failure output is saved to .omc/handoffs/task1-failure.txt.
 *
 * NOTE: vitest.config.ts aliases @comvi/react → ../react/src/index.ts so
 * all hooks and context objects share the same module instance.
 */

import React, { StrictMode, useState as useReactState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import { useI18n, useLocale, useIsLoading, I18nProvider as ReactI18nProvider } from "@comvi/react";
import { useStoreRevision } from "../../react/src/I18nProvider";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

// ---------------------------------------------------------------------------
// Translation fixtures
// ---------------------------------------------------------------------------

const DE = { default: { greeting: "Hallo" } };
const EN = { default: { greeting: "Hello" } };
const FR = { default: { greeting: "Bonjour" } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSharedI18n() {
  const fake = new FakeI18n();
  fake.isInitialized = true;
  return fake;
}

// Triggers the same render-time-mutation chain as the Next I18nProvider's
// useState(() => { i18n.addTranslations(messages) }). Used to reproduce the
// warning independently of the full Next provider tree.
function MutatingProvider({
  fake,
  messages,
  children,
}: {
  fake: FakeI18n;
  messages: Record<string, Record<string, string>>;
  children?: React.ReactNode;
}) {
  // Lazy initializer: runs synchronously during render on FIRST mount.
  // Calling addTranslations here emits configChanged synchronously,
  // which (without the fix) calls scheduleUpdateOnFiber on any committed
  // sibling fiber that subscribed via useStoreRevision or useSubscribe.
  useReactState(() => {
    fake.addTranslations(messages);
    return null;
  });
  return (
    <ReactI18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </ReactI18nProvider>
  );
}

// ===========================================================================
// TEST A — cross-fiber sibling subscriber under StrictMode (load-bearing)
//
// A Sibling is mounted and committed (with its useStoreRevision subscription
// active). Then MutatingProvider mounts in the same React root — its
// useState initializer calls addTranslations() during render, emitting
// configChanged synchronously, which without the fix causes
// scheduleUpdateOnFiber(SiblingFiber) while isRendering=true.
// ===========================================================================

describe("Test A — cross-fiber render-time mutation warning (useI18n sibling)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("mounting a mutating provider while a sibling subscriber is committed does not fire 'Cannot update a component'", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function Sibling() {
      const { t } = useI18n();
      return <span data-testid="sibling">{t("greeting" as never)}</span>;
    }

    // Host renders a permanent Sibling (always committed) plus a conditionally
    // mounted MutatingProvider controlled by showMutator.
    function Host({ showMutator }: { showMutator: boolean }) {
      return (
        <StrictMode>
          <ReactI18nProvider i18n={i18n} autoInit={false}>
            <Sibling />
          </ReactI18nProvider>
          {showMutator && (
            <MutatingProvider fake={fake} messages={EN}>
              <span data-testid="mutator-child">child</span>
            </MutatingProvider>
          )}
        </StrictMode>
      );
    }

    // Phase 1: Mount with Sibling only — it subscribes to configChanged via
    // useStoreRevision inside useI18n.
    const { rerender } = render(<Host showMutator={false} />);
    expect(errorSpy).not.toHaveBeenCalled();

    // Phase 2: Mount the MutatingProvider in the same React root. Its
    // useState initializer calls addTranslations(EN) during render, emitting
    // configChanged synchronously while the renderer is still mid-render.
    // Without the fix, Sibling's subscribe callback fires synchronously →
    // scheduleUpdateOnFiber(SiblingFiber) → warning.
    await act(async () => {
      rerender(<Host showMutator={true} />);
      await Promise.resolve();
    });

    const renderWarnings = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(renderWarnings).toHaveLength(0);
  });
});

// ===========================================================================
// TEST A2 — useLocale() sibling (exercises useSubscribe → subLang path)
// ===========================================================================

describe("Test A2 — cross-fiber warning via useLocale() sibling", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("useLocale() sibling: no 'Cannot update a component' when mutating provider mounts", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function LocaleSibling() {
      const locale = useLocale();
      return <span data-testid="locale">{locale}</span>;
    }

    function Host({ showMutator }: { showMutator: boolean }) {
      return (
        <StrictMode>
          <ReactI18nProvider i18n={i18n} autoInit={false}>
            <LocaleSibling />
          </ReactI18nProvider>
          {showMutator && (
            <MutatingProvider fake={fake} messages={EN}>
              <span>child</span>
            </MutatingProvider>
          )}
        </StrictMode>
      );
    }

    const { rerender } = render(<Host showMutator={false} />);
    expect(errorSpy).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<Host showMutator={true} />);
      await Promise.resolve();
    });

    const renderWarnings = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(renderWarnings).toHaveLength(0);
  });
});

// ===========================================================================
// TEST A3 — useIsLoading() sibling (exercises useSubscribe → subLoading path)
// ===========================================================================

describe("Test A3 — cross-fiber warning via useIsLoading() sibling", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("useIsLoading() sibling: no 'Cannot update a component' when mutating provider mounts", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function LoadingSibling() {
      const { isLoading } = useIsLoading();
      return <span data-testid="loading">{String(isLoading)}</span>;
    }

    function Host({ showMutator }: { showMutator: boolean }) {
      return (
        <StrictMode>
          <ReactI18nProvider i18n={i18n} autoInit={false}>
            <LoadingSibling />
          </ReactI18nProvider>
          {showMutator && (
            <MutatingProvider fake={fake} messages={EN}>
              <span>child</span>
            </MutatingProvider>
          )}
        </StrictMode>
      );
    }

    const { rerender } = render(<Host showMutator={false} />);
    expect(errorSpy).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<Host showMutator={true} />);
      await Promise.resolve();
    });

    const renderWarnings = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(renderWarnings).toHaveLength(0);
  });
});

// ===========================================================================
// TEST B — locale round-trip: mount/unmount MutatingProvider 3 times with
// new messages while sibling remains committed
// ===========================================================================

describe("Test B — locale round-trip: mutating provider mounts 3 times (de→en→fr→de)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("no render warning fires across 3 mount cycles (StrictMode)", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function Sibling() {
      const { t } = useI18n();
      return <span data-testid="sibling">{t("greeting" as never)}</span>;
    }

    // Use a unique key to force remount of MutatingProvider each cycle,
    // re-triggering the useState initializer with new messages.
    function Host({
      cycleKey,
      messages,
    }: {
      cycleKey: number;
      messages: Record<string, Record<string, string>>;
    }) {
      return (
        <StrictMode>
          <ReactI18nProvider i18n={i18n} autoInit={false}>
            <Sibling />
          </ReactI18nProvider>
          <MutatingProvider key={cycleKey} fake={fake} messages={messages}>
            <span>child</span>
          </MutatingProvider>
        </StrictMode>
      );
    }

    const { rerender } = render(<Host cycleKey={0} messages={DE} />);

    const trips: Array<[number, Record<string, Record<string, string>>]> = [
      [1, EN],
      [2, FR],
      [3, DE],
    ];

    for (const [cycleKey, messages] of trips) {
      await act(async () => {
        rerender(<Host cycleKey={cycleKey} messages={messages} />);
        await Promise.resolve();
      });

      const warnings = errorSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
      );
      expect(warnings).toHaveLength(0);
    }
  });
});

// ===========================================================================
// TEST C — events still drive updates after the microtask fix (behavior check)
// ===========================================================================

describe("Test C — out-of-render events still drive consumer re-renders", () => {
  it("addTranslations outside a render triggers consumer re-render within one microtask tick", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    let renderCount = 0;

    function Consumer() {
      const { t } = useI18n();
      renderCount += 1;
      return <span data-testid="consumer">{t("greeting" as never)}</span>;
    }

    const { getByTestId } = render(
      <I18nProvider i18n={i18n} locale="en" messages={EN} autoInit={false}>
        <Consumer />
      </I18nProvider>,
    );

    const countAfterMount = renderCount;

    await act(async () => {
      fake.addTranslations({ en: { greeting: "Updated" } });
      await Promise.resolve();
    });

    expect(renderCount).toBeGreaterThan(countAfterMount);
    expect(getByTestId("consumer").textContent).toBe("Updated");
  });
});

// ===========================================================================
// TEST D — useStoreRevision content-addressed snapshot (canonical event set)
// ===========================================================================

describe("Test D — useStoreRevision re-renders on canonical events with real state changes", () => {
  it("re-renders for events that change state; not for a no-op emit", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    let renders = 0;
    function Subscriber() {
      // Subscribes to the canonical 7-event revision set (core subscribeToRevision).
      useStoreRevision(i18n);
      renders++;
      return <span data-testid="sub" />;
    }

    render(
      <I18nProvider i18n={i18n} locale="en" messages={EN} autoInit={false}>
        <Subscriber />
      </I18nProvider>,
    );
    const afterMount = renders;

    // real config change → re-render
    await act(async () => {
      fake.setFallbackLocale("de");
      fake.emit("configChanged", { source: "fallbackLocale" });
      await Promise.resolve();
    });
    expect(renders).toBeGreaterThan(afterMount);
    const afterConfig = renders;

    // no-op emit (nothing changed) → no re-render
    await act(async () => {
      fake.emit("configChanged", { source: "fallbackLocale" });
      await Promise.resolve();
    });
    expect(renders).toBe(afterConfig);

    // namespaceLoaded that bumps the cache revision → re-render (7-of-7 coverage,
    // plan 6.4: previously this depended on the caller's hand-picked event list)
    await act(async () => {
      fake.translationCache.set("en", "default", { extra: "v" });
      fake.emit("namespaceLoaded", { locale: "en", namespace: "default" });
      await Promise.resolve();
    });
    expect(renders).toBeGreaterThan(afterConfig);
  });
});
