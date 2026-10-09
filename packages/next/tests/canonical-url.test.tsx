/**
 * The address bar after a locale switch.
 *
 * A switch navigates to the locale-prefixed URL, which the middleware redirects
 * to the public one (`/en/about` → `/about` under `as-needed`). Next 16 answers
 * a REPEATED switch from its client cache and keeps the URL that was asked
 * for, so the page was right and the address bar said `/en/about`. The routing
 * provider puts the public URL back, as the middleware would have.
 *
 * `next/navigation` is the framework boundary and is stubbed with the pathname
 * Next reports.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import type { RoutingConfig } from "../src/routing/types";

const nextNavigation = vi.hoisted(() => ({ pathname: null as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => nextNavigation.pathname,
}));

const ROUTING: RoutingConfig = { locales: ["en", "de"], defaultLocale: "en" };

const renderAt = (url: string, locale: string, routing?: RoutingConfig) => {
  window.history.replaceState(null, "", url);
  nextNavigation.pathname = new URL(url, "http://localhost").pathname;
  const replaced = vi.spyOn(window.history, "replaceState");
  const fake = new FakeI18n({ language: locale });
  render(
    <I18nProvider i18n={fake.asI18n()} locale={locale} routing={routing} autoInit={false}>
      <p>page</p>
    </I18nProvider>,
  );
  return replaced;
};

beforeEach(() => {
  nextNavigation.pathname = null;
});

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

  it("no pathname from Next yet → left alone", () => {
    window.history.replaceState(null, "", "/en/about");
    const replaced = vi.spyOn(window.history, "replaceState");
    const fake = new FakeI18n({ language: "en" });

    render(
      <I18nProvider i18n={fake.asI18n()} locale="en" routing={ROUTING} autoInit={false}>
        <p>page</p>
      </I18nProvider>,
    );

    expect(replaced).not.toHaveBeenCalled();
  });
});
