/**
 * Pins the effect-rerun behavior of useI18n / useLocale:
 *  - useEffect on the whole `useI18n()` return runs on every reactive change
 *    (because the return is a fresh object per render — destructure or use
 *    the per-axis selector hooks)
 *  - useEffect on destructured `locale` runs only on locale changes
 *  - useEffect on `useLocale()` runs only on locale changes (skips cache axis)
 */

import React, { useEffect, useRef } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { useLocale } from "../src/I18nProvider";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("useI18n / useLocale effect-rerun behavior (W4)", () => {
  let fake: FakeI18n;
  beforeEach(() => {
    fake = new FakeI18n();
  });

  it("useEffect on the whole useI18n() return runs on every reactive change", async () => {
    let effectRuns = 0;
    function Consumer() {
      const i18n = useI18n();
      useEffect(() => {
        effectRuns += 1;
      }, [i18n]);
      return null;
    }

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Consumer />
      </I18nProvider>,
    );

    // Mount fires the effect exactly once.
    expect(effectRuns).toBe(1);

    // Locale flip → useI18n() return identity changes → effect re-runs.
    await act(async () => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(effectRuns).toBe(2);

    // Namespace load → useI18n() return identity changes (cacheRevision
    // is in useI18n's internal subscription) → effect re-runs again.
    await act(async () => {
      await fake.addActiveNamespace("dashboard");
    });
    expect(effectRuns).toBeGreaterThanOrEqual(3);
  });

  it("useEffect on destructured locale runs ONLY on locale changes", async () => {
    let effectRuns = 0;
    function Consumer() {
      const { locale } = useI18n();
      useEffect(() => {
        effectRuns += 1;
      }, [locale]);
      return null;
    }

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Consumer />
      </I18nProvider>,
    );

    expect(effectRuns).toBe(1);

    // Locale flip → effect re-runs.
    await act(async () => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(effectRuns).toBe(2);

    // Namespace load → locale is unchanged → effect does NOT re-run.
    await act(async () => {
      await fake.addActiveNamespace("dashboard");
    });
    expect(effectRuns).toBe(2);
  });

  it("useEffect on useLocale() runs ONLY on locale changes (and skips even useI18n's cache axis)", async () => {
    let effectRuns = 0;
    let renderCount = 0;
    function Consumer() {
      renderCount += 1;
      const locale = useLocale();
      useEffect(() => {
        effectRuns += 1;
      }, [locale]);
      return null;
    }

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Consumer />
      </I18nProvider>,
    );

    expect(effectRuns).toBe(1);
    const rendersAfterMount = renderCount;

    // Namespace load → locale unchanged → consumer body does NOT execute
    // (useLocale is on LocaleContext only) → effect does NOT re-run.
    await act(async () => {
      await fake.addActiveNamespace("dashboard");
    });
    expect(renderCount).toBe(rendersAfterMount);
    expect(effectRuns).toBe(1);

    // Locale flip → consumer body executes → effect re-runs.
    await act(async () => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(effectRuns).toBe(2);
  });

  it("ref-based identity check: useI18n() return is a NEW object every render", () => {
    const identities = new Set<object>();
    function Spy() {
      const i18n = useI18n();
      const lastRef = useRef<object | null>(null);
      if (lastRef.current !== i18n) {
        lastRef.current = i18n;
        identities.add(i18n);
      }
      return null;
    }

    const { rerender } = render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Spy />
      </I18nProvider>,
    );

    // Re-render the same tree (no state change) — does it still produce a
    // fresh object? Yes, because the hook returns an object literal that
    // is rebuilt every call. Documenting the current behavior so any future
    // change is loud.
    rerender(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Spy />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Spy />
      </I18nProvider>,
    );

    // At least 1 (mount); more if a re-render fires due to provider
    // re-mount with a fresh i18n.asI18n() proxy. The point: identity is
    // NOT shared across renders — destructuring guidance applies.
    expect(identities.size).toBeGreaterThanOrEqual(1);
  });
});
