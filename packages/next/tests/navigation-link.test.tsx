/**
 * `<Link>` from `@comvi/next/navigation`.
 *
 * `next/link` is the framework boundary and is stubbed with an anchor that
 * reports the href it was handed, so every assertion is about the href the
 * wrapper computes rather than about Next's own rendering.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import { Link } from "../src/navigation";
import type { RoutingConfig } from "../src/routing/types";

vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: react.forwardRef(function NextLinkStub(
      { href, children, ...rest }: { href: unknown; children?: React.ReactNode },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return react.createElement(
        "a",
        { "data-testid": "next-link", "data-href": JSON.stringify(href), ...rest, ref },
        children,
      );
    }),
  };
});

const ROUTING: RoutingConfig = {
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  pathnames: {
    "/about": { de: "/ueber-uns" },
  },
};

const hrefHandedToNext = (): unknown => JSON.parse(screen.getByTestId("next-link").dataset.href!);

const renderUnderProvider = (
  children: React.ReactNode,
  options: { routing?: RoutingConfig; locale?: string } = {},
) => {
  const { routing, locale = "de" } = options;
  const fake = new FakeI18n({ language: locale });
  const rendered = render(
    <I18nProvider i18n={fake.asI18n()} locale={locale} routing={routing} autoInit={false}>
      {children}
    </I18nProvider>,
  );
  return { ...rendered, fake };
};

describe("<Link>", () => {
  it("localizes a string href with the current locale", () => {
    renderUnderProvider(<Link href="/about">About</Link>, { routing: ROUTING, locale: "de" });

    expect(hrefHandedToNext()).toBe("/de/ueber-uns");
  });

  it("localizes a string href with an explicitly requested locale", () => {
    renderUnderProvider(
      <Link href="/about" locale="en">
        About
      </Link>,
      { routing: ROUTING, locale: "de" },
    );

    expect(hrefHandedToNext()).toBe("/about");
  });

  it("localizes the pathname of a URL object and keeps its query", () => {
    renderUnderProvider(<Link href={{ pathname: "/about", query: { ref: "nav" } }}>About</Link>, {
      routing: ROUTING,
      locale: "de",
    });

    expect(hrefHandedToNext()).toEqual({ pathname: "/de/ueber-uns", query: { ref: "nav" } });
  });

  it("prefixes the bare locale segment when no routing config is provided", () => {
    renderUnderProvider(<Link href="/about">About</Link>, { locale: "de" });

    expect(hrefHandedToNext()).toBe("/de/about");
  });

  it("renders its children and forwards unrelated props to the anchor", () => {
    renderUnderProvider(
      <Link href="/about" className="nav-item">
        About us
      </Link>,
      { routing: ROUTING, locale: "de" },
    );

    const anchor = screen.getByTestId("next-link");
    expect(anchor).toHaveProperty("className", "nav-item");
    expect(anchor.textContent).toBe("About us");
  });

  it("forwards its ref to the rendered anchor", () => {
    const ref = React.createRef<HTMLAnchorElement>();

    renderUnderProvider(
      <Link ref={ref} href="/about">
        About
      </Link>,
      { routing: ROUTING, locale: "de" },
    );

    expect(ref.current).toBe(screen.getByTestId("next-link"));
  });

  it("re-localizes its href when the instance switches locale", async () => {
    const { fake } = renderUnderProvider(<Link href="/about">About</Link>, {
      routing: ROUTING,
      locale: "de",
    });
    expect(hrefHandedToNext()).toBe("/de/ueber-uns");

    await act(async () => {
      await fake.setLocaleAsync("en");
    });

    expect(hrefHandedToNext()).toBe("/about");
  });

  it("identifies itself as LocalizedLink in the component tree", () => {
    expect(Link.displayName).toBe("LocalizedLink");
  });
});

describe("routing configuration handed down by <I18nProvider>", () => {
  it("prefixes a URL object with the bare locale segment when no routing config is provided", () => {
    renderUnderProvider(<Link href={{ pathname: "/about", query: { ref: "nav" } }}>About</Link>, {
      locale: "de",
    });

    expect(hrefHandedToNext()).toEqual({ pathname: "/de/about", query: { ref: "nav" } });
  });

  it("re-localizes descendants when the provider is given a different routing config", () => {
    const fake = new FakeI18n({ language: "de" });
    const { rerender } = render(
      <I18nProvider i18n={fake.asI18n()} locale="de" routing={ROUTING} autoInit={false}>
        <Link href="/about">About</Link>
      </I18nProvider>,
    );
    expect(hrefHandedToNext()).toBe("/de/ueber-uns");

    rerender(
      <I18nProvider
        i18n={fake.asI18n()}
        locale="de"
        routing={{ ...ROUTING, pathnames: { "/about": { de: "/wer-wir-sind" } } }}
        autoInit={false}
      >
        <Link href="/about">About</Link>
      </I18nProvider>,
    );

    expect(hrefHandedToNext()).toBe("/de/wer-wir-sind");
  });
});
