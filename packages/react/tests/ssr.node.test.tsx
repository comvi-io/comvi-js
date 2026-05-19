// @vitest-environment node
/**
 * ssr.node.test.ts — W4 SSR coverage for the `getServerSnapshot` paths in
 * `packages/react/src/I18nProvider.tsx` (lines 168-186 — the three
 * useSyncExternalStore call-sites for locale / isLoading / isInitializing).
 *
 * The render-counts.test.tsx harness runs in happy-dom which always
 * exercises the CLIENT snapshot path. This file uses the `node` vitest
 * environment to exercise the SERVER snapshot path via
 * `react-dom/server.renderToString`. Closes Dim 2 P3 + Dim 14 P3 from
 * AUDIT-FINDINGS.md.
 *
 * Invariants asserted:
 *   1. `renderToString` resolves the correct text using the provider's
 *      configured locale (proves getServerSnapshot returns the configured
 *      locale, not whatever the default-initialised i18n.locale is).
 *   2. `ssrInitialLocale` override produces the override locale in the
 *      output (proves the snapshot getter respects the prop).
 *   3. `ssrInitialIsLoading` / `ssrInitialIsInitializing` flow into the
 *      provider state on the server snapshot path.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "../src/I18nProvider";
import { useIsLoading, useLocale } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { createI18n, T } from "../src";

describe("@comvi/react SSR — getServerSnapshot paths (W4)", () => {
  it("renderToString uses the configured locale via getServerSnapshot", () => {
    const i18n = createI18n({
      locale: "fr",
      translation: { fr: { greeting: "Bonjour" }, en: { greeting: "Hello" } },
    });

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false}>
        <T i18nKey={"greeting" as never} />
      </I18nProvider>,
    );

    expect(html).toContain("Bonjour");
  });

  it("ssrInitialLocale overrides the i18n.locale on the server snapshot path", () => {
    // Instance defaults to 'en' but we tell the provider the SSR locale is
    // 'de'. The server snapshot getter should return 'de' for any consumer
    // that uses useLocale() / useI18n().locale.
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: { greeting: "Hello" },
        de: { greeting: "Hallo" },
      },
    });

    function Show() {
      const locale = useLocale();
      return <span data-locale={locale}>{locale}</span>;
    }

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} ssrInitialLocale="de">
        <Show />
      </I18nProvider>,
    );

    expect(html).toContain('data-locale="de"');
    expect(html).toContain(">de<");
  });

  it("ssrInitialIsLoading flows through useIsLoading on the server snapshot path", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { x: "x" } } });

    function Show() {
      const { isLoading, isInitializing } = useIsLoading();
      return (
        <span data-loading={String(isLoading)} data-init={String(isInitializing)}>
          state
        </span>
      );
    }

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} ssrInitialIsLoading ssrInitialIsInitializing>
        <Show />
      </I18nProvider>,
    );

    expect(html).toContain('data-loading="true"');
    expect(html).toContain('data-init="true"');
  });

  it("useI18n on the server snapshot path returns the configured locale + a valid t()", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
    });

    function Show() {
      const { locale, t } = useI18n();
      return <span data-locale={locale}>{t("greeting" as never)}</span>;
    }

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Show />
      </I18nProvider>,
    );

    expect(html).toContain("Hello");
    expect(html).toContain('data-locale="en"');
  });
});
