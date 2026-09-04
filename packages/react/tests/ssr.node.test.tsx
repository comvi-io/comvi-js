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

    expect(html.replaceAll("<!-- -->", "")).toBe("Bonjour");
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

    expect(html.replaceAll("<!-- -->", "")).toBe('<span data-locale="en">Hello</span>');
  });

  it("falls back to the live host state when no ssrInitial* prop is given", () => {
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
      <I18nProvider i18n={i18n} autoInit={false}>
        <Show />
      </I18nProvider>,
    );

    expect(html).toContain('data-loading="false"');
    expect(html).toContain('data-init="false"');
  });
});

/**
 * Under a server-rendered provider the instance locale is the host's static
 * configured one, not the request's. Every locale-sensitive member of
 * `useI18n()` has to read the provider's locale instead — `hasTranslation`
 * included, since it gates whether callers even ask for a string.
 */
describe("@comvi/react SSR — useI18n().hasTranslation follows the provider locale", () => {
  it("answers for ssrInitialLocale, not the instance locale", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: {}, fr: { greeting: "Bonjour" } },
      exposeGlobal: false,
    });
    const Probe = () => <>{`has:${useI18n().hasTranslation("greeting")}`}</>;

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} ssrInitialLocale="fr">
        <Probe />
      </I18nProvider>,
    );

    expect(html).toContain("has:true");
  });

  it("reports false for a key the provider locale does not have", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" }, fr: {} },
      exposeGlobal: false,
    });
    const Probe = () => <>{`has:${useI18n().hasTranslation("greeting")}`}</>;

    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} ssrInitialLocale="fr">
        <Probe />
      </I18nProvider>,
    );

    expect(html).toContain("has:false");
  });
});

/**
 * Regression guard for the client-only tag boundary added in `T.tsx`: React
 * error boundaries do not run during `renderToString`, so a component or
 * element tag handler that throws still tears the SERVER render down. The
 * client boundary must not create the impression that server renders degrade.
 */
describe("@comvi/react SSR — a throwing tag handler is NOT contained on the server", () => {
  it("renderToString rethrows the handler's error instead of rendering the children", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link>" } },
      exposeGlobal: false,
    });
    const Exploding = (): React.ReactElement => {
      throw new Error("handler exploded");
    };

    const renderServerSide = () =>
      renderToString(
        <I18nProvider i18n={i18n} autoInit={false}>
          <T i18nKey={"msg" as never} components={{ link: <Exploding /> }} />
        </I18nProvider>,
      );

    expect(renderServerSide).toThrow(new Error("handler exploded"));
  });
});
