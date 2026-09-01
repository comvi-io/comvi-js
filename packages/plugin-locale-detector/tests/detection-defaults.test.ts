import { describe, expect, it, vi } from "vitest";
import { initWithPlugin } from "./helpers/init";
import { mockCookie, mockNavigator, mockWindowLocation } from "./setup";

describe("LocaleDetector() option defaults", () => {
  it("tries the querystring first when no order is given", async () => {
    mockWindowLocation("?lng=fr");
    localStorage.setItem("i18n_locale", "de");
    sessionStorage.setItem("i18n_locale", "it");
    mockCookie("i18n_lang=es");
    mockNavigator(["ja-JP"], "ja-JP");

    const i18n = await initWithPlugin({ caches: [] }, "en");

    expect(i18n.locale).toBe("fr");
  });

  it("falls through to the navigator when no earlier source has a locale and no order is given", async () => {
    mockNavigator(["ja-JP"], "ja-JP");

    const i18n = await initWithPlugin({ caches: [] }, "en");

    expect(i18n.locale).toBe("ja");
  });

  it("persists the detected locale to localStorage when no caches are given", async () => {
    mockNavigator(["fr-FR"], "fr-FR");

    await initWithPlugin({ order: ["navigator"] }, "en");

    expect(localStorage.getItem("i18n_locale")).toBe("fr");
  });

  it("writes root path, lax sameSite and a one-year max-age when no cookie options are given", async () => {
    mockNavigator(["fr-FR"], "fr-FR");
    const cookieSetter = vi.spyOn(document, "cookie", "set");

    await initWithPlugin({ order: ["navigator"], caches: ["cookie"] }, "en");

    expect(cookieSetter.mock.calls.at(-1)?.[0]).toBe(
      "i18n_lang=fr; max-age=31536000; path=/; samesite=lax",
    );
  });
});
