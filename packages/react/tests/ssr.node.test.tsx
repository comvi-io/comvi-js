// @vitest-environment node
/** Exercises the `getServerSnapshot` paths that happy-dom does not hit. */

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
