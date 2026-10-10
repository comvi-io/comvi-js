import { describe, expect, it } from "vitest";
import {
  findUnknownRoutingOptionKeys,
  normalizeRoutingOptions,
  type RoutingOptions,
} from "../src/index";

const BASE: RoutingOptions = { locales: ["en", "de"], defaultLocale: "en" };
const NEXT = { cookieNameDefault: "NEXT_LOCALE" };
const NUXT = { cookieNameDefault: "i18n_locale" };

describe("normalizeRoutingOptions", () => {
  it("applies every default", () => {
    expect(normalizeRoutingOptions(BASE, NEXT)).toEqual({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeCookie: { name: "NEXT_LOCALE", maxAge: 31536000, secure: true, sameSite: "lax" },
      localeDetection: { order: ["query", "cookie", "accept-language"] },
    });
  });

  const inputs: Array<[string, RoutingOptions]> = [
    ["nothing set", BASE],
    ["a cookie name", { ...BASE, localeCookie: "LANG" }],
    ["cookie attributes", { ...BASE, localeCookie: { maxAge: 60, sameSite: "none" } }],
    ["no cookie", { ...BASE, localeCookie: false }],
    ["no detection", { ...BASE, localeDetection: false }],
    [
      "a query and an order",
      { ...BASE, localeDetection: { queryParam: "lang", order: ["query"] } },
    ],
    ["a prefix mode and ns", { ...BASE, localePrefix: "always", ns: ["common"] }],
  ];

  it.each(inputs)(
    "differs between the frameworks only in the default cookie name: %s",
    (_, input) => {
      const next = normalizeRoutingOptions(input, NEXT);
      const nuxt = normalizeRoutingOptions(input, NUXT);
      const withoutDefaultName = (options: ReturnType<typeof normalizeRoutingOptions>) =>
        options.localeCookie && ["NEXT_LOCALE", "i18n_locale"].includes(options.localeCookie.name)
          ? { ...options, localeCookie: { ...options.localeCookie, name: "<default>" } }
          : options;

      expect(withoutDefaultName(next)).toEqual(withoutDefaultName(nuxt));
    },
  );

  it("leaves no key set to undefined", () => {
    const normalized = normalizeRoutingOptions(BASE, NUXT);
    const values = [
      ...Object.values(normalized),
      ...Object.values(normalized.localeCookie || {}),
      ...Object.values(normalized.localeDetection || {}),
    ];
    expect(values).not.toContain(undefined);
  });

  it("copies arrays rather than sharing them with the input", () => {
    const order: ["cookie"] = ["cookie"];
    const normalized = normalizeRoutingOptions({ ...BASE, localeDetection: { order } }, NUXT);
    expect(normalized.localeDetection && normalized.localeDetection.order).not.toBe(order);
  });
});

describe("findUnknownRoutingOptionKeys", () => {
  it("names the key that replaced an older spelling", () => {
    expect(
      findUnknownRoutingOptionKeys({
        localeDetection: { cookieName: "x", cookieSecure: false } as never,
      }),
    ).toEqual([
      { key: "localeDetection.cookieName", use: "localeCookie.name" },
      { key: "localeDetection.cookieSecure", use: "localeCookie.secure" },
    ]);
  });

  it("reports a key with no replacement, and an unknown order entry", () => {
    expect(
      findUnknownRoutingOptionKeys({
        localeCookie: { path: "/" } as never,
        localeDetection: { order: ["browser"] } as never,
      }),
    ).toEqual([{ key: "localeCookie.path" }, { key: 'localeDetection.order: "browser"' }]);
  });

  it("accepts every key of the schema", () => {
    expect(
      findUnknownRoutingOptionKeys({
        localeCookie: { name: "a", maxAge: 1, secure: true, sameSite: "lax", domain: "d" },
        localeDetection: {
          order: ["query", "cookie", "header", "accept-language"],
          queryParam: "q",
          headerName: "h",
          resolveAcceptLanguage: () => undefined,
        },
      }),
    ).toEqual([]);
  });
});
