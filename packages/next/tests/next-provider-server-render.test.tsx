// @vitest-environment node
/**
 * What the Next <I18nProvider> is allowed to touch during a SERVER render.
 *
 * The App Router host is created once at module scope and shared by every
 * concurrent request the server process handles, so a render-phase write to it
 * leaks one request's locale into another request's tree. The request locale
 * has to travel through React context instead.
 *
 * The environment is `node` on purpose: the guard in the provider is
 * `typeof window !== "undefined"`, so a DOM environment would take the client
 * branch and every case here would pass for the wrong reason.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { createI18n, useI18n } from "@comvi/react";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import type { MessagesMap } from "../src/client/I18nProvider";

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

describe("Next <I18nProvider> server render does not write the shared host", () => {
  it("leaves the shared host's locale untouched while the children render", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);
    const HostLocaleAtRenderTime = () => <span>{`host:${fake.locale}`}</span>;

    const html = renderToString(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <HostLocaleAtRenderTime />
      </I18nProvider>,
    );

    expect(html).toContain("host:en");
    expect(writes).toEqual([]);
  });

  it("keeps two interleaved server renders from crossing on one host", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);
    const seen: string[] = [];

    const HostLocaleProbe = ({ label }: { label: string }) => {
      seen.push(`${label}:${fake.locale}`);
      return <span>{label}</span>;
    };

    // Renders the "de" request in the middle of the "fr" request, which is what
    // two concurrent App Router requests do to one module-scope instance.
    const InterleavedRequest = () => {
      seen.push(`fr-before:${fake.locale}`);
      renderToString(
        <I18nProvider i18n={fake.asI18n()} locale="de" autoInit={false}>
          <HostLocaleProbe label="de" />
        </I18nProvider>,
      );
      seen.push(`fr-after:${fake.locale}`);
      return null;
    };

    renderToString(
      <I18nProvider i18n={fake.asI18n()} locale="fr" autoInit={false}>
        <InterleavedRequest />
      </I18nProvider>,
    );

    expect(seen).toEqual(["fr-before:en", "de:en", "fr-after:en"]);
    expect(writes).toEqual([]);
  });

  it("leaves the locale and the active namespaces unchanged on later server renders", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
      exposeGlobal: false,
    });
    const messages: MessagesMap = { "fr:default": { greeting: "Bonjour" } };

    renderToString(
      <I18nProvider i18n={i18n} locale="fr" messages={messages} autoInit={false}>
        <div />
      </I18nProvider>,
    );
    const namespacesAfterFirst = [...i18n.getActiveNamespaces()].sort();

    renderToString(
      <I18nProvider i18n={i18n} locale="de" messages={messages} autoInit={false}>
        <div />
      </I18nProvider>,
    );

    expect(i18n.locale).toBe("en");
    expect([...i18n.getActiveNamespaces()].sort()).toEqual(namespacesAfterFirst);
  });

  it("resolves useI18n().hasTranslation against the provider locale, not the host locale", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: {}, fr: { greeting: "Bonjour" } },
      exposeGlobal: false,
    });
    const HasTranslationProbe = () => {
      const { hasTranslation } = useI18n();
      return <span>{`has:${hasTranslation("greeting")}`}</span>;
    };

    const html = renderToString(
      <I18nProvider i18n={i18n} locale="fr" autoInit={false}>
        <HasTranslationProbe />
      </I18nProvider>,
    );

    expect(html).toContain("has:true");
    expect(i18n.locale).toBe("en");
  });

  it("still renders the request locale's text without touching the host", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" }, fr: { greeting: "Bonjour" } },
      exposeGlobal: false,
    });
    const Greeting = () => <span>{useI18n().t("greeting" as never)}</span>;

    const html = renderToString(
      <I18nProvider i18n={i18n} locale="fr" autoInit={false}>
        <Greeting />
      </I18nProvider>,
    );

    expect(html).toContain("Bonjour");
    expect(i18n.locale).toBe("en");
  });
});

/**
 * A `[locale]` segment outside `routing.locales` is a SERVER-side routing
 * mistake. The diagnostic has to reach `onError` during the server render,
 * where the server logs are — waiting for a browser to hydrate hides it from
 * exactly the person who can fix it. Only the locale WRITE is client-only.
 */
describe("Next <I18nProvider> reports a misrouted locale during a server render", () => {
  it("reports the misconfiguration without writing the shared host", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);

    renderToString(
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
    expect(writes).toEqual([]);
  });

  it("stays silent during a server render when the locale is routable", () => {
    const fake = new FakeI18n({ language: "en" });
    const writes = recordLocaleWrites(fake);

    renderToString(
      <I18nProvider
        i18n={fake.asI18n()}
        locale="fr"
        routing={{ locales: ["en", "fr", "de"], defaultLocale: "en" }}
        autoInit={false}
      >
        <div />
      </I18nProvider>,
    );

    expect(fake.reportError).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
