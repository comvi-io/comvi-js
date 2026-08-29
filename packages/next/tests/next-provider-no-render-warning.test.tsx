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
 * Condition 1 is reproduced by calling addTranslations() from a useState lazy
 * initializer (the Next I18nProvider's own pattern); condition 2 by keeping the
 * subscribed sibling in the same React root.
 *
 * NOTE: vitest.config.ts aliases @comvi/react → ../react/src/index.ts so
 * all hooks and context objects share the same module instance.
 */

import React, { StrictMode, useState as useReactState } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import { useI18n, useLocale, useIsLoading, I18nProvider as ReactI18nProvider } from "@comvi/react";
import { useStoreRevision } from "../../react/src/I18nProvider";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import { flushMicrotasks, renderWarnings, spyOnConsoleError } from "./helpers/consoleWarnings";

// Keyed "locale:namespace": a bare `{ default: … }` normalises to cache key
// `default:default`, which no consumer ever reads, so the fixtures would be
// inert and the locale round-trip below fictional.
const DE = { "de:default": { greeting: "Hallo" } };
const EN = { "en:default": { greeting: "Hello" } };
const FR = { "fr:default": { greeting: "Bonjour" } };

function makeSharedI18n() {
  const fake = new FakeI18n();
  fake.isInitialized = true;
  return fake;
}

// Reproduces the Next I18nProvider's render-time-mutation chain without the
// full provider tree.
function MutatingProvider({
  fake,
  messages,
  children,
}: {
  fake: FakeI18n;
  messages: Record<string, Record<string, string>>;
  children?: React.ReactNode;
}) {
  // The lazy initializer runs synchronously during the FIRST render, so the
  // configChanged it emits lands mid-render.
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

describe("Test A — cross-fiber render-time mutation warning (useI18n sibling)", () => {
  let errorSpy: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    errorSpy = spyOnConsoleError();
  });

  it("mounting a mutating provider while a sibling subscriber is committed does not fire 'Cannot update a component'", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function Sibling() {
      const { t } = useI18n();
      return <span data-testid="sibling">{t("greeting" as never)}</span>;
    }

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

    const { rerender } = render(<Host showMutator={false} />);
    expect(errorSpy).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<Host showMutator={true} />);
      await flushMicrotasks();
    });

    expect(renderWarnings(errorSpy)).toHaveLength(0);
  });
});

// A2 exercises the useSubscribe → subLang path.

describe("Test A2 — cross-fiber warning via useLocale() sibling", () => {
  let errorSpy: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    errorSpy = spyOnConsoleError();
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
      await flushMicrotasks();
    });

    expect(renderWarnings(errorSpy)).toHaveLength(0);
  });
});

// A3 exercises the useSubscribe → subLoading path.

describe("Test A3 — cross-fiber warning via useIsLoading() sibling", () => {
  let errorSpy: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    errorSpy = spyOnConsoleError();
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
      await flushMicrotasks();
    });

    expect(renderWarnings(errorSpy)).toHaveLength(0);
  });
});

describe("Test B — locale round-trip: mutating provider mounts 3 times (de→en→fr→de)", () => {
  let errorSpy: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    errorSpy = spyOnConsoleError();
  });

  it("no render warning fires across 3 mount cycles (StrictMode)", async () => {
    const fake = makeSharedI18n();
    const i18n = fake.asI18n();

    function Sibling() {
      const { t } = useI18n();
      return <span data-testid="sibling">{t("greeting" as never)}</span>;
    }

    // The unique key forces a remount each cycle, re-triggering the useState
    // initializer with new messages.
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

    const { rerender, getByTestId } = render(<Host cycleKey={0} messages={DE} />);

    await act(async () => {
      await fake.setLocaleAsync("de");
      await flushMicrotasks();
    });

    expect(getByTestId("sibling").textContent).toBe("Hallo");

    const trips: Array<[number, Record<string, Record<string, string>>, string, string]> = [
      [1, EN, "en", "Hello"],
      [2, FR, "fr", "Bonjour"],
      [3, DE, "de", "Hallo"],
    ];

    for (const [cycleKey, messages, locale, expected] of trips) {
      await act(async () => {
        rerender(<Host cycleKey={cycleKey} messages={messages} />);
        await fake.setLocaleAsync(locale);
        await flushMicrotasks();
      });

      expect(getByTestId("sibling").textContent, `cycle ${cycleKey} (${locale})`).toBe(expected);
      expect(renderWarnings(errorSpy), `cycle ${cycleKey} (${locale})`).toHaveLength(0);
    }
  });
});

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
      await flushMicrotasks();
    });

    expect(renderCount).toBeGreaterThan(countAfterMount);
    expect(getByTestId("consumer").textContent).toBe("Updated");
  });
});

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

    await act(async () => {
      fake.setFallbackLocale("de");
      fake.emit("configChanged", { source: "fallbackLocale" });
      await flushMicrotasks();
    });
    expect(renders).toBeGreaterThan(afterMount);
    const afterConfig = renders;

    await act(async () => {
      fake.emit("configChanged", { source: "fallbackLocale" });
      await flushMicrotasks();
    });
    expect(renders).toBe(afterConfig);

    // namespaceLoaded bumps the cache revision, so the 7th canonical event
    // re-renders too.
    await act(async () => {
      fake.translationCache.set("en", "default", { extra: "v" });
      fake.emit("namespaceLoaded", { locale: "en", namespace: "default" });
      await flushMicrotasks();
    });
    expect(renders).toBeGreaterThan(afterConfig);
  });
});
