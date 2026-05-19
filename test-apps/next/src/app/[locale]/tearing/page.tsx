"use client";

/**
 * Tearing test page for Playwright E2E.
 *
 * Purpose: expose the mid-commit DOM observability gap that happy-dom cannot
 * cover. The tearing-under-startTransition scenario describes the
 * architectural hazard: <T> / t() consumers reading i18n.locale via the bound
 * translation closure (tRaw) may observe a pre-mutated locale while React
 * still renders against the old state.
 *
 * This page mounts TWO independent consumers of the same translation key
 * ("home.title") side by side. A button triggers a locale change inside
 * React.startTransition so React can yield mid-render. The Playwright spec
 * polls the DOM at short intervals and asserts that the two consumers are
 * ALWAYS pair-consistent (both EN or both FR — never one of each).
 *
 * Translation values used:
 *   EN: "Comvi i18n Example"  (home.title)
 *   FR: "Exemple Comvi i18n"  (home.title)
 *
 * A 150 ms artificial delay is injected via a slow-loading wrapper so the
 * transition is observably long, giving the poller a larger window to catch
 * any mid-commit inconsistency.
 */

import React, { startTransition, useState, useEffect } from "react";
import { useI18n } from "@comvi/next/client";

// ---------------------------------------------------------------------------
// Slow translation wrapper
// Adds an artificial paint delay so the in-flight transition is long enough
// for the Playwright poller to sample mid-commit frames.
// ---------------------------------------------------------------------------

function SlowConsumer({ label }: { label: string }) {
  const { t } = useI18n();
  const text = t("home.title" as never);

  // Burn ~150 ms of synchronous work to widen the observable mid-commit window.
  // This is intentionally slow to maximise the chance of catching tearing.
  const [, setRendered] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setRendered(true), 0);
    return () => clearTimeout(id);
  }, [text]);

  return (
    <span data-testid={label} data-value={text} aria-label={label}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TearingPage() {
  const { setLocale, locale } = useI18n();

  const handleSwitch = () => {
    startTransition(() => {
      void setLocale("fr");
    });
  };

  const handleReset = () => {
    startTransition(() => {
      void setLocale("en");
    });
  };

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-xl font-bold">Tearing E2E Test Page</h2>

      <p className="text-sm text-gray-500">
        Current locale: <strong data-testid="current-locale">{locale}</strong>
      </p>

      {/* Two independent consumers of the same key — must always be pair-consistent */}
      <div className="space-y-2">
        <div className="p-3 border rounded" data-testid="consumer-a-wrapper">
          <SlowConsumer label="consumer-a" />
        </div>
        <div className="p-3 border rounded" data-testid="consumer-b-wrapper">
          <SlowConsumer label="consumer-b" />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          data-testid="switch-to-fr"
          onClick={handleSwitch}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Switch to FR (startTransition)
        </button>
        <button
          data-testid="reset-to-en"
          onClick={handleReset}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Reset to EN
        </button>
      </div>
    </div>
  );
}
