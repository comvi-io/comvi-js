/**
 * Does queueMicrotask deferral introduce a new warning class on React 19
 * Suspense boundaries that read translations during a suspended render?
 *
 * A useI18n() child inside a <Suspense> boundary suspends; while it is
 * suspended an i18n event fires (addTranslations → configChanged), so on resume
 * the deferred microtask callback would schedule a React update.
 *
 * NOTE: vitest.config.ts aliases @comvi/react → ../react/src/index.ts.
 */

import React, { Suspense } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import { useI18n } from "@comvi/react";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import { flushMicrotasks, renderWarnings, spyOnConsoleError } from "./helpers/consoleWarnings";

// `messages` is keyed "locale:namespace": a bare `{ default: … }` would land in
// cache key `default:default` and the consumer, which reads `en:default`, would
// never see it.
const EN = { "en:default": { greeting: "Hello" } };
const EN_UPDATED = { "en:default": { greeting: "Hi there" } };
const EN_V2 = { "en:default": { greeting: "Hey" } };
const EN_V3 = { "en:default": { greeting: "Hi" } };

function makeSuspender() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  let resolved = false;
  promise.then(() => {
    resolved = true;
  });

  function Suspender({ children }: { children: React.ReactNode }) {
    if (!resolved) throw promise;
    return <>{children}</>;
  }

  return { Suspender, resolve };
}

function Consumer() {
  const { t } = useI18n();
  return <span data-testid="consumer">{t("greeting" as never)}</span>;
}

describe("OQ-A — Suspense + microtask deferral (pre-merge gate)", () => {
  let errorSpy: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    errorSpy = spyOnConsoleError();
  });

  it("cache mutation during Suspense does not fire 'Cannot update a component' after resume", async () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;
    const i18n = fake.asI18n();

    const { Suspender, resolve } = makeSuspender();

    const { queryByTestId } = render(
      <I18nProvider i18n={i18n} locale="en" messages={EN} autoInit={false}>
        <Suspense fallback={<span data-testid="fallback">loading...</span>}>
          <Suspender>
            <Consumer />
          </Suspender>
        </Suspense>
      </I18nProvider>,
    );

    expect(queryByTestId("fallback")).not.toBeNull();
    expect(queryByTestId("consumer")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();

    // The deferred callback is queued while Consumer is not yet committed.
    await act(async () => {
      fake.addTranslations(EN_UPDATED);
      await flushMicrotasks();
    });

    expect(renderWarnings(errorSpy)).toHaveLength(0);

    await act(async () => {
      resolve();
      await flushMicrotasks();
    });

    expect(queryByTestId("consumer")).not.toBeNull();
    expect(queryByTestId("consumer")?.textContent).toBe("Hi there");
    expect(renderWarnings(errorSpy)).toHaveLength(0);
  });

  it("multiple cache mutations during Suspense coalesce correctly after resume", async () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;
    const i18n = fake.asI18n();

    const { Suspender, resolve } = makeSuspender();

    const { queryByTestId } = render(
      <I18nProvider i18n={i18n} locale="en" messages={EN} autoInit={false}>
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Suspender>
            <Consumer />
          </Suspender>
        </Suspense>
      </I18nProvider>,
    );

    await act(async () => {
      fake.addTranslations(EN_V2);
      fake.addTranslations(EN_V3);
      await flushMicrotasks();
    });

    expect(renderWarnings(errorSpy)).toHaveLength(0);

    await act(async () => {
      resolve();
      await flushMicrotasks();
    });

    // Coalescing is what makes this different from the single-mutation case:
    // both writes landed while suspended, and the resumed render shows the LAST
    // one exactly once rather than replaying EN_V2 first.
    expect(queryByTestId("consumer")).not.toBeNull();
    expect(queryByTestId("consumer")?.textContent).toBe("Hi");
    expect(renderWarnings(errorSpy)).toHaveLength(0);
  });
});
