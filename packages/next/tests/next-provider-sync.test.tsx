/**
 * What the Next <I18nProvider> writes onto the instance, and when.
 *
 * The locale and the pre-loaded messages have to land BEFORE the first commit
 * (that is what keeps SSR and hydration in step), and neither may be re-applied
 * on a render that changed nothing.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createI18n, useIsLoading } from "@comvi/react";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import type { MessagesMap } from "../src/client/I18nProvider";

const MESSAGES: MessagesMap = { "fr:default": { greeting: "Bonjour" } };

/**
 * Shadows the prototype accessor with an own property that records writes, so
 * "assigned the same locale again" is distinguishable from "left it alone".
 */
const recordLocaleWrites = (fake: FakeI18n): string[] => {
  const writes: string[] = [];
  let current = fake.locale;
  Object.defineProperty(fake, "locale", {
    get: () => current,
    set: (value: string) => {
      writes.push(value);
      current = value;
    },
    configurable: true,
  });
  return writes;
};

describe("Next <I18nProvider> instance sync", () => {
  it("applies the server locale before the children render", () => {
    const fake = new FakeI18n({ language: "en" });
    const LocaleAtRenderTime = () => <span data-testid="at-render">{fake.locale}</span>;

    render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <LocaleAtRenderTime />
      </I18nProvider>,
    );

    expect(screen.getByTestId("at-render").textContent).toBe("fr");
  });

  it("leaves the locale alone when the instance already carries it", () => {
    const fake = new FakeI18n({ language: "fr" });
    const writes = recordLocaleWrites(fake);

    render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <div />
      </I18nProvider>,
    );

    expect(writes).toEqual([]);
  });

  it("writes the locale when the instance carries a different one", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);

    render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <div />
      </I18nProvider>,
    );

    expect(writes).toEqual(["fr"]);
  });

  it("adds pre-loaded messages once, before the children render", () => {
    const fake = new FakeI18n({ language: "en" });
    const MessagesAtRenderTime = () => (
      <span data-testid="at-render">{String(fake.hasLocale("fr", "default"))}</span>
    );

    render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" messages={MESSAGES} autoInit={false}>
        <MessagesAtRenderTime />
      </I18nProvider>,
    );

    expect(screen.getByTestId("at-render").textContent).toBe("true");
    expect(fake.addTranslations).toHaveBeenCalledExactlyOnceWith(MESSAGES);
  });

  it("does not re-add the same messages object on a later render", () => {
    const fake = new FakeI18n({ language: "en" });
    const { rerender } = render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" messages={MESSAGES} autoInit={false}>
        <div />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider i18n={fake.asI18n()} locale="fr" messages={MESSAGES} autoInit={false}>
        <div data-testid="second" />
      </I18nProvider>,
    );

    expect(fake.addTranslations).toHaveBeenCalledExactlyOnceWith(MESSAGES);
  });

  it("does not re-apply the messages when StrictMode renders the tree twice", () => {
    const fake = new FakeI18n({ language: "en" });

    render(
      <React.StrictMode>
        <I18nProvider i18n={fake.asI18n()} locale="fr" messages={MESSAGES} autoInit={false}>
          <div />
        </I18nProvider>
      </React.StrictMode>,
    );

    expect(fake.addTranslations).toHaveBeenCalledExactlyOnceWith(MESSAGES);
  });

  it("adds a different messages object handed over on a later render", () => {
    const fake = new FakeI18n({ language: "en" });
    const moreMessages: MessagesMap = { "fr:admin": { title: "Console" } };
    const { rerender } = render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" messages={MESSAGES} autoInit={false}>
        <div />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider i18n={fake.asI18n()} locale="fr" messages={moreMessages} autoInit={false}>
        <div />
      </I18nProvider>,
    );

    expect(fake.addTranslations.mock.calls).toEqual([[MESSAGES], [moreMessages]]);
  });

  it("renders without messages instead of adding an empty catalog", () => {
    const fake = new FakeI18n({ language: "en" });

    render(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );

    expect(screen.getByTestId("child")).toBeDefined();
    expect(fake.addTranslations).not.toHaveBeenCalled();
  });

  it("tells the server renderer that nothing is loading", () => {
    const i18n = createI18n({ locale: "en", translation: { en: {} }, exposeGlobal: false });
    const LoadingProbe = () => {
      const { isLoading, isInitializing } = useIsLoading();
      return <span>{`isLoading:${isLoading} isInitializing:${isInitializing}`}</span>;
    };

    const html = renderToString(
      <I18nProvider i18n={i18n} locale="en" autoInit={false}>
        <LoadingProbe />
      </I18nProvider>,
    );

    expect(html).toContain("isLoading:false isInitializing:false");
  });

  it("identifies itself as I18nProvider in the component tree", () => {
    expect(I18nProvider.displayName).toBe("I18nProvider");
  });
});

describe("Next <I18nProvider> misconfiguration report", () => {
  it("names the locale and every configured locale in the report", () => {
    const fake = new FakeI18n({ language: "en" });

    render(
      <I18nProvider
        i18n={fake.asI18n()}
        locale="zz"
        routing={{ locales: ["en", "fr", "de"], defaultLocale: "en" }}
        autoInit={false}
      >
        <div />
      </I18nProvider>,
    );

    expect(fake.reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          '[next-i18n-provider] Locale "zz" is not in routing.locales (en, fr, de). Skipping locale sync.',
      }),
      { source: "init", locale: "zz" },
    );
  });

  it("does not add messages for a locale the routing config rejects", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);

    render(
      <I18nProvider
        i18n={fake.asI18n()}
        locale="zz"
        routing={{ locales: ["en", "fr"], defaultLocale: "en" }}
        messages={MESSAGES}
        autoInit={false}
      >
        <div />
      </I18nProvider>,
    );

    expect(writes).toEqual([]);
    // The message catalog is independent of the locale guard: it still lands.
    expect(fake.addTranslations).toHaveBeenCalledExactlyOnceWith(MESSAGES);
  });
});

describe("Next <I18nProvider> error reporting is silent when configured correctly", () => {
  it("reports nothing when no routing config is supplied", () => {
    const fake = new FakeI18n({ language: "en" });
    const reportSpy = vi.spyOn(fake, "reportError");

    render(
      <I18nProvider i18n={fake.asI18n()} locale="zz" autoInit={false}>
        <div />
      </I18nProvider>,
    );

    expect(reportSpy).not.toHaveBeenCalled();
  });
});
