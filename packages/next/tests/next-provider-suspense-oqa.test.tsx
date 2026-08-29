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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import { useI18n } from "@comvi/react";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

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

describe("OQ-A — Suspense + microtask deferral (pre-merge gate)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("cache mutation during Suspense does not fire 'Cannot update a component' after resume", async () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;
    const i18n = fake.asI18n();

    const EN = { default: { greeting: "Hello" } };
    const EN_UPDATED = { default: { greeting: "Hi there" } };

    function Consumer() {
      const { t } = useI18n();
      return <span data-testid="consumer">{t("greeting" as never)}</span>;
    }

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
      await Promise.resolve();
    });

    const warningsAfterMutation = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(warningsAfterMutation).toHaveLength(0);

    await act(async () => {
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryByTestId("consumer")).not.toBeNull();

    const warningsAfterResume = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(warningsAfterResume).toHaveLength(0);
  });

  it("multiple cache mutations during Suspense coalesce correctly after resume", async () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;
    const i18n = fake.asI18n();

    const EN = { default: { greeting: "Hello" } };
    const EN_V2 = { default: { greeting: "Hey" } };
    const EN_V3 = { default: { greeting: "Hi" } };

    function Consumer() {
      const { t } = useI18n();
      return <span data-testid="consumer">{t("greeting" as never)}</span>;
    }

    const { Suspender, resolve } = makeSuspender();

    render(
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
      await Promise.resolve();
    });

    const warningsDuringMutation = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(warningsDuringMutation).toHaveLength(0);

    await act(async () => {
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const warningsAfterResume = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(warningsAfterResume).toHaveLength(0);
  });
});
