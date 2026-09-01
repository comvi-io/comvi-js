import { describe, expect, it } from "vitest";
import { initWithPlugin } from "./helpers/init";
import { mockCookie } from "./setup";

const COOKIE_ONLY = { order: ["cookie" as const], caches: [] };

describe("cookie detection source", () => {
  it("finds the lookup name after an earlier cookie in the header", async () => {
    mockCookie("other=1; i18n_lang=fr");

    const i18n = await initWithPlugin(COOKIE_ONLY, "de");

    expect(i18n.locale).toBe("fr");
  });

  it("trims whitespace around the cookie value", async () => {
    mockCookie("i18n_lang= fr ");

    const i18n = await initWithPlugin(COOKIE_ONLY, "de");

    expect(i18n.locale).toBe("fr");
  });

  it("ignores a valueless cookie entry whose name prefixes the lookup name", async () => {
    mockCookie("langs; lang=fr");

    const i18n = await initWithPlugin({ ...COOKIE_ONLY, lookupCookie: "lang" }, "de");

    expect(i18n.locale).toBe("fr");
  });

  it("ignores a cookie whose value is not decodable", async () => {
    mockCookie("i18n_lang=%E0%A4%A");

    const i18n = await initWithPlugin(COOKIE_ONLY, "de");

    expect(i18n.locale).toBe("de");
  });

  it("stops at the first entry with the lookup name instead of trying a later duplicate", async () => {
    mockCookie("i18n_lang=%E0%A4%A; i18n_lang=fr");

    const i18n = await initWithPlugin(COOKIE_ONLY, "de");

    expect(i18n.locale).toBe("de");
  });
});
