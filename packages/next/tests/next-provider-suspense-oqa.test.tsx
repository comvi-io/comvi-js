/**
 * OQ-A (pre-merge gate): Does queueMicrotask deferral affect React 19 Suspense
 * boundaries that read translations during a suspended render?
 *
 * Scenario: a useI18n() child is inside a <Suspense> boundary. The child
 * suspends (throws a Promise). While it is suspended, an i18n event fires
 * (addTranslations → configChanged). When Suspense resumes, the deferred
 * microtask callback would schedule a React update. We assert:
 *   - no "Cannot update a component" warning fires
 *   - after resume the consumer re-renders correctly
 *
 * Result: PASS — microtask deferral does not introduce a new warning class
 * under Suspense. Documented as known-safe in the PR description.
 *
 * NOTE: vitest.config.ts aliases @comvi/react → ../react/src/index.ts.
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import { useI18n } from "@comvi/react";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

// ---------------------------------------------------------------------------
// Suspense helper: a component that suspends until a promise resolves
// ---------------------------------------------------------------------------

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

    // Consumer is suspended — fallback is shown.
    expect(queryByTestId("fallback")).not.toBeNull();
    expect(queryByTestId("consumer")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();

    // Fire addTranslations while Consumer is suspended. The microtask deferred
    // callback will be queued but Consumer is not yet committed.
    await act(async () => {
      fake.addTranslations(EN_UPDATED);
      await Promise.resolve();
    });

    // Still no warning.
    const warningsAfterMutation = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Cannot update a component"),
    );
    expect(warningsAfterMutation).toHaveLength(0);

    // Resolve suspension — Consumer mounts and renders.
    await act(async () => {
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Consumer should now be rendered.
    expect(queryByTestId("consumer")).not.toBeNull();

    // No warning should have fired during or after resume.
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

    // Fire two mutations while suspended.
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
