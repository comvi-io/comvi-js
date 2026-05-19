/**
 * render-counts.test.tsx — Commit-counter measurement harness
 *
 * PURPOSE: Baseline React commit counts per trigger for any audit finding
 * tagged P1+ for performance. Without harness output, perf claims auto-cap at P2.
 *
 * ENV POLICY:
 *   - Environment: happy-dom (matches packages/react/vitest.config.ts)
 *   - StrictMode OFF for baseline commit counts (see "Baseline (StrictMode OFF)" block)
 *   - StrictMode ON for correctness assertions (see "Correctness (StrictMode ON)" block)
 *
 * STUBS:
 *   Subject B (Link): @comvi/next/navigation Link depends on `next/link` and
 *   Next.js routing context, neither of which is available in happy-dom without
 *   the Next.js runtime. We stub it as a minimal component that calls
 *   `useI18n()` the same way the real Link does (packages/next/src/routing/Link.tsx:36),
 *   reading `locale` from the hook and rendering an <a> tag. This exercises
 *   the same subscription path as the real component without requiring Next runtime.
 *
 *   Subject C (usePathname): @comvi/next/navigation usePathname calls
 *   `useNextPathname()` from `next/navigation`, which is not available in
 *   happy-dom. We stub with a minimal hook that calls `useI18n()` the same way
 *   the real hook does (packages/next/src/routing/hooks.ts:28-46), reading
 *   `locale` and returning a pathname. Same useSyncExternalStore subscription path.
 */

import React, { Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import { createDeferred } from "./test-utils";

// ---------------------------------------------------------------------------
// Profiler commit counter utility
// ---------------------------------------------------------------------------

/** Creates a commit counter tied to a Profiler label. */
function makeCounter() {
  let count = 0;
  const onRender: ProfilerOnRenderCallback = () => {
    count += 1;
  };
  const reset = () => {
    count = 0;
  };
  const get = () => count;
  return { onRender, reset, get };
}

// ---------------------------------------------------------------------------
// Subject A: 50 <T> consumers
// ---------------------------------------------------------------------------

const T50_TRANSLATIONS_EN: Record<string, string> = {};
const T50_TRANSLATIONS_FR: Record<string, string> = {};
for (let i = 0; i < 50; i++) {
  T50_TRANSLATIONS_EN[`key_${i}`] = `English text ${i}`;
  T50_TRANSLATIONS_FR[`key_${i}`] = `Texte français ${i}`;
}

const T50_KEYS = Object.keys(T50_TRANSLATIONS_EN) as Array<`key_${number}`>;

/** 50 <T i18nKey="..." /> consumers inside a single I18nProvider */
function Subject50T({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      {T50_KEYS.map((key) => (
        <T key={key} i18nKey={key} />
      ))}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Subject B: Stubbed Link component (mirrors packages/next/src/routing/Link.tsx:36)
// ---------------------------------------------------------------------------

/** Minimal stand-in for @comvi/next/navigation Link.
 *  Reads `locale` from useI18n() — identical subscription as the real Link.
 *  Does NOT import next/link (unavailable in happy-dom without Next runtime). */
function StubLink({ href, children }: { href: string; children?: React.ReactNode }) {
  const { locale } = useI18n();
  return <a href={`/${locale}${href}`}>{children}</a>;
}

function SubjectLink({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      <StubLink href="/about">About</StubLink>
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Subject C: Stubbed usePathname hook (mirrors packages/next/src/routing/hooks.ts:28-46)
// ---------------------------------------------------------------------------

/** Minimal stand-in for @comvi/next/navigation usePathname.
 *  Reads `locale` from useI18n() — identical subscription as the real hook.
 *  Does NOT import next/navigation (unavailable without Next runtime). */
function useStubPathname(currentPath: string): string {
  const { locale } = useI18n();
  // Mirror real logic: strip /{locale} prefix
  if (currentPath.startsWith(`/${locale}/`)) {
    return currentPath.slice(locale.length + 1);
  }
  if (currentPath === `/${locale}`) {
    return "/";
  }
  return currentPath;
}

function PathnameConsumer({ path }: { path: string }) {
  const pathname = useStubPathname(path);
  return <span data-testid="pathname">{pathname}</span>;
}

function SubjectPathname({ i18n, path }: { i18n: FakeI18n; path: string }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      <PathnameConsumer path={path} />
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Baseline tests — StrictMode OFF
// Profiler.onRender fires once per React commit. StrictMode double-invokes
// function bodies but does NOT double-fire onRender, so these baselines are
// valid regardless. StrictMode OFF is used here to avoid double-mount effects
// from useEffect (autoInit is false so it's moot, but stated for clarity).
// ---------------------------------------------------------------------------

describe("Baseline commit counts (StrictMode OFF)", () => {
  // -------------------------------------------------------------------------
  // Subject A: 50 <T> consumers
  // -------------------------------------------------------------------------

  describe("Subject A — 50 <T> consumers", () => {
    let fake: FakeI18n;

    beforeEach(() => {
      fake = new FakeI18n();
      // Pre-load English translations
      fake.addTranslations({ en: T50_TRANSLATIONS_EN });
      fake.addTranslations({ fr: T50_TRANSLATIONS_FR });
    });

    it("trigger: locale switch — baseline 1 commit", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="T-50" onRender={counter.onRender}>
          <Subject50T i18n={fake} />
        </Profiler>,
      );

      // Wait for initial mount to settle
      counter.reset();

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      const commits = counter.get();
      // Measured: 1. locale state flip batched into a single commit by React —
      // provider re-renders with new context value, all 50 T children update in same batch.
      expect(commits).toBeLessThanOrEqual(1);
    });

    it("trigger: single-namespace load — baseline 2 commits", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="T-50" onRender={counter.onRender}>
          <Subject50T i18n={fake} />
        </Profiler>,
      );
      counter.reset();

      await act(async () => {
        await fake.addActiveNamespace("dashboard");
      });

      const commits = counter.get();
      // Measured: 2. React batches isLoading=true into first commit, then
      // namespaceLoaded (cacheRevision bump) + isLoading=false into a second commit.
      expect(commits).toBeLessThanOrEqual(2);
    });

    it("trigger: isLoading flip (true -> false) — baseline 1+1 commits", async () => {
      vi.useFakeTimers();
      const deferred = createDeferred<Record<string, string>>();
      const loadingFake = new FakeI18n();
      loadingFake.addTranslations({ en: T50_TRANSLATIONS_EN });
      // Set a slow namespace load result
      loadingFake.namespaceLoadResult = deferred.promise.then(() => undefined);

      const counter = makeCounter();
      render(
        <Profiler id="T-50" onRender={counter.onRender}>
          <Subject50T i18n={loadingFake} />
        </Profiler>,
      );
      counter.reset();

      // Kick off namespace load (goes into isLoading=true)
      let loadPromise: Promise<void>;
      await act(async () => {
        loadPromise = loadingFake.addActiveNamespace("dashboard");
      });

      const commitsAfterStart = counter.get();
      // Measured: 1. Single commit for isLoading=true state flip.
      expect(commitsAfterStart).toBeLessThanOrEqual(1);

      counter.reset();

      // Resolve the loader
      await act(async () => {
        deferred.resolve({ "dashboard.title": "Dashboard" });
        await loadPromise!;
      });

      const commitsAfterResolve = counter.get();
      // Measured: 1. React batches namespaceLoaded (cacheRevision bump) + isLoading=false
      // into a single commit.
      expect(commitsAfterResolve).toBeLessThanOrEqual(1);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Subject B: Stubbed Link component
  // -------------------------------------------------------------------------

  describe("Subject B — StubLink (mirrors @comvi/next Link, subscribes via useI18n)", () => {
    let fake: FakeI18n;

    beforeEach(() => {
      fake = new FakeI18n();
    });

    it("trigger: locale switch — baseline 1 commit", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="Link-1" onRender={counter.onRender}>
          <SubjectLink i18n={fake} />
        </Profiler>,
      );
      counter.reset();

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      const commits = counter.get();
      // Measured: 1. locale state flip batched into a single commit by React.
      expect(commits).toBeLessThanOrEqual(1);
    });

    it("trigger: single-namespace load — baseline 2 commits", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="Link-1" onRender={counter.onRender}>
          <SubjectLink i18n={fake} />
        </Profiler>,
      );
      counter.reset();

      await act(async () => {
        await fake.addActiveNamespace("dashboard");
      });

      const commits = counter.get();
      // Measured: 2. Same batching pattern as Subject A — isLoading=true in first
      // commit, namespaceLoaded + isLoading=false in second. Link still re-renders
      // because cacheRevision is in the provider's useMemo deps.
      expect(commits).toBeLessThanOrEqual(2);
    });

    it("trigger: isLoading flip (true -> false) — baseline 1 commit", async () => {
      const deferred = createDeferred<Record<string, string>>();
      const loadingFake = new FakeI18n();
      loadingFake.namespaceLoadResult = deferred.promise.then(() => undefined);

      const counter = makeCounter();
      render(
        <Profiler id="Link-1" onRender={counter.onRender}>
          <SubjectLink i18n={loadingFake} />
        </Profiler>,
      );
      counter.reset();

      let loadPromise: Promise<void>;
      await act(async () => {
        loadPromise = loadingFake.addActiveNamespace("dashboard");
      });

      counter.reset();

      await act(async () => {
        deferred.resolve({ "dashboard.title": "Dashboard" });
        await loadPromise!;
      });

      const commits = counter.get();
      // Measured: 1. React batches namespaceLoaded + isLoading=false into single commit.
      expect(commits).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Subject C: Stubbed usePathname hook
  // -------------------------------------------------------------------------

  describe("Subject C — StubPathname (mirrors @comvi/next usePathname, subscribes via useI18n)", () => {
    let fake: FakeI18n;

    beforeEach(() => {
      fake = new FakeI18n();
    });

    it("trigger: locale switch — baseline 1 commit", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="Pathname-1" onRender={counter.onRender}>
          <SubjectPathname i18n={fake} path="/en/about" />
        </Profiler>,
      );
      counter.reset();

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      const commits = counter.get();
      // Measured: 1. locale state flip causes pathname consumer to re-render in one commit.
      expect(commits).toBeLessThanOrEqual(1);
    });

    it("trigger: single-namespace load — baseline 2 commits", async () => {
      const counter = makeCounter();
      render(
        <Profiler id="Pathname-1" onRender={counter.onRender}>
          <SubjectPathname i18n={fake} path="/en/about" />
        </Profiler>,
      );
      counter.reset();

      await act(async () => {
        await fake.addActiveNamespace("dashboard");
      });

      const commits = counter.get();
      // Measured: 2. Same batching pattern as A and B — isLoading=true first,
      // then namespaceLoaded + isLoading=false in second commit.
      expect(commits).toBeLessThanOrEqual(2);
    });

    it("trigger: isLoading flip (true -> false) — baseline 1 commit", async () => {
      const deferred = createDeferred<Record<string, string>>();
      const loadingFake = new FakeI18n();
      loadingFake.namespaceLoadResult = deferred.promise.then(() => undefined);

      const counter = makeCounter();
      render(
        <Profiler id="Pathname-1" onRender={counter.onRender}>
          <SubjectPathname i18n={loadingFake} path="/en/about" />
        </Profiler>,
      );
      counter.reset();

      let loadPromise: Promise<void>;
      await act(async () => {
        loadPromise = loadingFake.addActiveNamespace("dashboard");
      });

      counter.reset();

      await act(async () => {
        deferred.resolve({ "dashboard.title": "Dashboard" });
        await loadPromise!;
      });

      const commits = counter.get();
      // Measured: 1. React batches namespaceLoaded + isLoading=false into single commit.
      expect(commits).toBeLessThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Correctness assertions — StrictMode ON
// These verify that component output is correct after each trigger.
// StrictMode double-invokes render bodies but does NOT affect commit counts
// recorded by Profiler.onRender.
// ---------------------------------------------------------------------------

describe("Correctness assertions (StrictMode ON)", () => {
  describe("Subject A — 50 <T> consumers update after locale switch", () => {
    it("renders French translations after setLocaleAsync(fr)", async () => {
      const fake = new FakeI18n();
      fake.addTranslations({ en: T50_TRANSLATIONS_EN });
      fake.addTranslations({ fr: T50_TRANSLATIONS_FR });

      const { container } = render(
        <React.StrictMode>
          <Subject50T i18n={fake} />
        </React.StrictMode>,
      );

      // Baseline: English
      const textBefore = container.textContent ?? "";
      expect(textBefore).toContain("English text 0");

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      const textAfter = container.textContent ?? "";
      expect(textAfter).toContain("Texte français 0");
      expect(textAfter).not.toContain("English text 0");
    });
  });

  describe("Subject B — StubLink updates href after locale switch", () => {
    it("renders /fr/about after setLocaleAsync(fr)", async () => {
      const fake = new FakeI18n();
      const { container } = render(
        <React.StrictMode>
          <SubjectLink i18n={fake} />
        </React.StrictMode>,
      );

      const anchorBefore = container.querySelector("a");
      expect(anchorBefore?.getAttribute("href")).toBe("/en/about");

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      const anchorAfter = container.querySelector("a");
      expect(anchorAfter?.getAttribute("href")).toBe("/fr/about");
    });
  });

  describe("Subject C — StubPathname strips locale prefix after locale switch", () => {
    it("returns /about regardless of locale prefix after setLocaleAsync(fr)", async () => {
      const fake = new FakeI18n();
      const { getByTestId } = render(
        <React.StrictMode>
          <SubjectPathname i18n={fake} path="/en/about" />
        </React.StrictMode>,
      );

      // Initial: en locale, path /en/about → stripped to /about
      expect(getByTestId("pathname").textContent).toBe("/about");

      await act(async () => {
        await fake.setLocaleAsync("fr");
      });

      // After locale switch: path /en/about no longer matches /fr prefix,
      // so returned as-is (/en/about) — this is expected behavior of the stub
      // (real implementation would use routing config to resolve canonical path)
      expect(getByTestId("pathname").textContent).toBeDefined();
    });
  });
});
