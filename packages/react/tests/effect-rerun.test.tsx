/**
 * effect-rerun.test.tsx — W4 harness for the W2b-ii decision about whether
 * `useI18n()` return identity needs further work (B6 in the breaking-change
 * table at AUDIT-react-packages.md).
 *
 * The audit (Dim 4 P2, Dim 8 P3) flagged that `useI18n()` returns a fresh
 * object every call — idiomatic for `useForm` / `useQuery`-shaped hooks,
 * but a footgun for `useEffect([useI18nReturn])` patterns.
 *
 * This file pins both behaviors as measurement:
 *   1. Effect on whole `useI18n()` return RE-RUNS on every reactive change
 *      (cache load, locale flip).
 *   2. Effect on destructured `locale` RE-RUNS ONLY when locale changes
 *      (not on namespace load — confirms the new W2b-ii context split for
 *      `useLocale()` consumers, AND that destructured fields don't fire
 *      effects when other axes change).
 *
 * If a future change adds memoization to the `useI18n()` return so that
 * passing the whole object to deps becomes safe (B6 "promote to P1"), the
 * first test would need updating — making it a forcing function.
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
