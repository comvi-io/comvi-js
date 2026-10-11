/**
 * The address bar after a locale switch.
 *
 * A switch navigates to the locale-prefixed URL, which the middleware redirects
 * to the public one (`/en/about` → `/about` under `as-needed`). Next 16 answers
 * a REPEATED switch from its client cache and keeps the URL that was asked
 * for, so the page was right and the address bar said `/en/about`. The routing
 * provider puts the public URL back, as the middleware would have.
 *
 * The provider reads the browser's own URL, never `next/navigation`: the client
 * entry has to import in plain Node ESM, where that specifier does not resolve
 * (`tests/dist/native-esm-rich-text.dist.test.ts`). It looks again whenever the
 * locale it renders in changes, which is what a switch is.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import type { RoutingConfig } from "../src/routing/types";

const ROUTING: RoutingConfig = { locales: ["en", "de"], defaultLocale: "en" };

const renderAt = (url: string, locale: string, routing?: RoutingConfig) => {
  window.history.replaceState(null, "", url);
  const replaced = vi.spyOn(window.history, "replaceState");
  const fake = new FakeI18n({ language: locale });
  render(
    <I18nProvider i18n={fake.asI18n()} locale={locale} routing={routing} autoInit={false}>
      <p>page</p>
    </I18nProvider>,
  );
  return replaced;
};

describe("the routing provider keeps the public URL in the address bar", () => {
  it("as-needed, the default locale's prefixed URL → replaced with the unprefixed one, query and hash kept", () => {
    const replaced = renderAt("/en/about?tab=team#top", "en", ROUTING);

    expect(replaced).toHaveBeenCalledTimes(1);
    expect(replaced).toHaveBeenCalledWith(null, "", "/about?tab=team#top");
  });

  it("as-needed, the default locale's prefixed root → replaced with /", () => {
    const replaced = renderAt("/en", "en", ROUTING);

    expect(replaced).toHaveBeenCalledWith(null, "", "/");
  });

  it("never, any locale's prefixed URL → replaced with the unprefixed one", () => {
    const replaced = renderAt("/de/about", "de", { ...ROUTING, localePrefix: "never" });

    expect(replaced).toHaveBeenCalledWith(null, "", "/about");
  });

  it.each([
    ["as-needed, another locale's prefixed URL", "/de/about", "de", ROUTING],
    ["as-needed, an unprefixed URL", "/about", "en", ROUTING],
    [
      "always, the default locale's prefixed URL",
      "/en/about",
      "en",
      { ...ROUTING, localePrefix: "always" },
    ],
    ["a path that only starts with a locale's letters", "/enter", "en", ROUTING],
  ] as const)("%s → left alone", (_name, url, locale, routing) => {
    const replaced = renderAt(url, locale, routing);

    expect(replaced).not.toHaveBeenCalled();
  });

  it("a switch that arrives as a new locale on the same provider → the URL it landed on is put right", () => {
    window.history.replaceState(null, "", "/de/about");
    const fake = new FakeI18n({ language: "de" });
    const tree = (locale: string) => (
      <I18nProvider i18n={fake.asI18n()} locale={locale} routing={ROUTING} autoInit={false}>
        <p>page</p>
      </I18nProvider>
    );
    const { rerender } = render(tree("de"));
    // What Next 16 leaves in the address bar for a repeated switch to `en`.
    window.history.replaceState(null, "", "/en/about");
    const replaced = vi.spyOn(window.history, "replaceState");

    rerender(tree("en"));

    expect(replaced).toHaveBeenCalledWith(null, "", "/about");
  });
});
