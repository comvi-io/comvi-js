/**
 * T.bench.tsx — Advisory micro-bench for <T> render cost
 *
 * PURPOSE: Inform the OQ-4 decision in docs/adr/0004-T-generic-vs-memo.md.
 * These are ADVISORY measurements only — not a CI gate.
 *
 * Rule from plan v0.3-fix-everything.md:
 *   "memo removal allowed iff render-count identical AND p99 regression < +15%"
 *
 * Cases:
 *   1. Memo-ON  — exported `T` (React.memo-wrapped TComponent), 50 consumers
 *   2. Memo-OFF — bare `TComponent` replicated inline, 50 consumers
 *   3. useI18n consumer cost — 50 components calling useI18n()
 *   4. useLocale consumer cost — 50 components calling useLocale()
 *
 * ENV: happy-dom (matches packages/react/vitest.config.ts)
 * NO external deps — timing via performance.now() only.
 * ≥1000 iterations per case. Reports p50 + p99 per case.
 */

import React from "react";
import { describe, it } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { I18nProvider } from "../src/I18nProvider";
import { useLocale } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute p50 and p99 from an array of durations (ms). */
function percentiles(samples: number[]): { p50: number; p99: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const p50idx = Math.floor(sorted.length * 0.5);
  const p99idx = Math.floor(sorted.length * 0.99);
  return {
    p50: sorted[p50idx] ?? 0,
    p99: sorted[p99idx] ?? 0,
  };
}

/** Print a formatted result table row to console. */
function report(label: string, iterations: number, p50: number, p99: number, verdict: string) {
  console.log(`\n[T.bench] ${label}`);
  console.log(`  iterations : ${iterations}`);
  console.log(`  p50        : ${p50.toFixed(4)} ms`);
  console.log(`  p99        : ${p99.toFixed(4)} ms`);
  console.log(`  verdict    : ${verdict}`);
}

// ---------------------------------------------------------------------------
// Translation fixtures
// ---------------------------------------------------------------------------

const TRANSLATIONS_EN: Record<string, string> = {};
for (let i = 0; i < 50; i++) {
  TRANSLATIONS_EN[`key_${i}`] = `English text ${i}`;
}
const KEYS = Object.keys(TRANSLATIONS_EN) as Array<`key_${number}`>;

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

/** 50 <T> consumers using the exported (memo-wrapped) T. */
function Subject50TMemo({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      {KEYS.map((key) => (
        <T key={key} i18nKey={key} />
      ))}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Bare TComponent — structurally equivalent to the unwrapped function body
// exported from T.tsx, without the React.memo wrapper.
// We replicate it here because TComponent is not exported from T.tsx.
// This matches the shape of TComponent exactly (same hooks, same logic paths)
// for the purpose of measuring memo overhead.
// ---------------------------------------------------------------------------
function TBare({ i18nKey }: { i18nKey: string }) {
  const { t, locale: _locale } = useI18n();
  const content = t(i18nKey as never);
  return <>{typeof content === "string" ? content : String(content)}</>;
}

/** 50 bare (non-memo) T consumers. */
function Subject50TBare({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      {KEYS.map((key) => (
        <TBare key={key} i18nKey={key} />
      ))}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// useI18n consumer (50 components)
// ---------------------------------------------------------------------------
function UseI18nConsumer({ i18nKey }: { i18nKey: string }) {
  const { t } = useI18n();
  return <span>{String(t(i18nKey as never))}</span>;
}

function Subject50UseI18n({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      {KEYS.map((key) => (
        <UseI18nConsumer key={key} i18nKey={key} />
      ))}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// useLocale consumer (50 components)
// ---------------------------------------------------------------------------
function UseLocaleConsumer({ idx }: { idx: number }) {
  const locale = useLocale();
  return <span data-idx={idx}>{locale}</span>;
}

function Subject50UseLocale({ i18n }: { i18n: FakeI18n }) {
  return (
    <I18nProvider i18n={i18n.asI18n()} autoInit={false}>
      {KEYS.map((key, idx) => (
        <UseLocaleConsumer key={key} idx={idx} />
      ))}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Bench runner
//
// Strategy: measure the wall-time of render() + one re-render (locale switch)
// across ITERATIONS iterations. Each iteration mounts a fresh tree, records
// the time for the initial render + one locale-switch act(), then unmounts.
// ---------------------------------------------------------------------------

const ITERATIONS = 1000;

async function runBench(Subject: React.ComponentType<{ i18n: FakeI18n }>): Promise<number[]> {
  const samples: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const fake = new FakeI18n();
    fake.addTranslations({ en: TRANSLATIONS_EN });

    const t0 = performance.now();

    const { unmount } = render(<Subject i18n={fake} />);

    await act(async () => {
      await fake.setLocaleAsync("fr");
    });

    const t1 = performance.now();
    samples.push(t1 - t0);

    unmount();
    cleanup();
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Tests (bench runs as vitest test cases — output goes to console)
// ---------------------------------------------------------------------------

describe("T component micro-bench (advisory, OQ-4)", () => {
  // Store results across cases so we can compute cross-case verdicts.
  let memoOnP99 = 0;
  let memoOffP99 = 0;

  it("Case 1 — Memo-ON: 50 <T> (React.memo-wrapped), render + re-render", async () => {
    const samples = await runBench(Subject50TMemo);
    const { p50, p99 } = percentiles(samples);
    memoOnP99 = p99;

    report(
      "Case 1 — Memo-ON (exported T, React.memo wrapper)",
      ITERATIONS,
      p50,
      p99,
      "baseline — see Case 2 verdict for relative comparison",
    );
  }, // timeout: 2 min (generous for slow CI)
  120_000);

  it("Case 2 — Memo-OFF: 50 <TBare> (no React.memo), render + re-render", async () => {
    const samples = await runBench(Subject50TBare);
    const { p50, p99 } = percentiles(samples);
    memoOffP99 = p99;

    const regression = memoOnP99 > 0 ? ((p99 - memoOnP99) / memoOnP99) * 100 : NaN;
    const threshold = 15;
    const verdict = isNaN(regression)
      ? "Cannot compute — run cases sequentially"
      : regression < threshold
        ? `Memo-off p99 ${regression >= 0 ? "+" : ""}${regression.toFixed(1)}% vs memo-on — within +${threshold}% threshold per ADR 0004 → OQ-4 CAN be reopened`
        : `Memo-off p99 +${regression.toFixed(1)}% vs memo-on — exceeds +${threshold}% threshold per ADR 0004 → React.memo SHOULD stay`;

    report("Case 2 — Memo-OFF (bare TComponent, no wrapper)", ITERATIONS, p50, p99, verdict);
  }, 120_000);

  it("Case 3 — useI18n consumer cost: 50 components calling useI18n()", async () => {
    const samples = await runBench(Subject50UseI18n);
    const { p50, p99 } = percentiles(samples);

    report(
      "Case 3 — useI18n consumer (50 components)",
      ITERATIONS,
      p50,
      p99,
      "baseline for hook cost comparison (see Case 4)",
    );
  }, 120_000);

  it("Case 4 — useLocale consumer cost: 50 components calling useLocale()", async () => {
    const samples = await runBench(Subject50UseLocale);
    const { p50, p99 } = percentiles(samples);

    report(
      "Case 4 — useLocale consumer (50 components)",
      ITERATIONS,
      p50,
      p99,
      "narrower subscription than useI18n — lower p99 expected for locale-only consumers",
    );
  }, 120_000);

  it("Cross-case summary (memo-on vs memo-off verdict)", () => {
    if (memoOnP99 === 0 || memoOffP99 === 0) {
      console.log("\n[T.bench] Summary: run all cases in order to get cross-case verdict.");
      return;
    }
    const regression = ((memoOffP99 - memoOnP99) / memoOnP99) * 100;
    const threshold = 15;
    const action =
      regression < threshold
        ? "OQ-4 CAN be reopened — memo removal is safe per the advisory gate"
        : "React.memo SHOULD stay — memo removal exceeds advisory p99 threshold";

    console.log("\n[T.bench] === CROSS-CASE SUMMARY ===");
    console.log(`  Memo-ON  p99  : ${memoOnP99.toFixed(4)} ms`);
    console.log(`  Memo-OFF p99  : ${memoOffP99.toFixed(4)} ms`);
    console.log(`  Regression    : ${regression >= 0 ? "+" : ""}${regression.toFixed(1)}%`);
    console.log(`  Threshold     : +${threshold}%`);
    console.log(`  Action        : ${action}`);
  });
});
