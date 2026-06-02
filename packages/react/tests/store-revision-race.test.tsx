import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { createI18n } from "@comvi/core";

// Reproduction for the M3 "t2 window" race: a non-cache event (here a
// fallback-locale change, which does NOT bump the translation-cache revision)
// fired in the window between a `useI18n` consumer's commit and its
// `useSyncExternalStore` passive subscribe-effect attaching. On `develop` the
// consumer's snapshot `${cacheRev}:${eventRevisionRef}` doesn't move (cacheRev
// unchanged; eventRevisionRef still 0 because subscribe hasn't run), so React
// drops the re-render and the consumer renders stale. A content-addressed
// getSnapshot (Option C) reflects the live fallback state and re-renders.
describe("useStoreRevision — commit→subscribe (t2) window", () => {
  it("re-renders for a non-cache event fired during the commit→subscribe window", async () => {
    const i18n = createI18n({
      locale: "fr",
      defaultNs: "common",
      translation: {
        en: { fallbackOnly: "Fallback" },
      },
    });

    let rendered = "";
    function Consumer() {
      const { t } = useI18n();
      rendered = t("fallbackOnly" as never) as string;
      return <span data-testid="out">{rendered}</span>;
    }

    // Layout effects run during commit, BEFORE any passive effect (the
    // consumer's `useSyncExternalStore` subscribe). Firing the event here lands
    // it precisely in the t2 pre-subscribe window. Sibling order: Injector first.
    function Injector() {
      useLayoutEffect(() => {
        i18n.setFallbackLocale("en");
      }, []);
      return null;
    }

    const revisionBefore = i18n.translationCache.getRevision();

    render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Injector />
        <Consumer />
      </I18nProvider>,
    );

    // The fallback change is NOT a cache mutation.
    expect(i18n.translationCache.getRevision()).toBe(revisionBefore);

    // RED on develop (consumer stuck at "fallbackOnly"); GREEN with the fix.
    await waitFor(() => {
      expect(rendered).toBe("Fallback");
    });
  });
});
