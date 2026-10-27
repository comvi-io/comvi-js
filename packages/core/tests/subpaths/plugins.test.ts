// @vitest-environment happy-dom
/**
 * @comvi/core/plugins — detect() and persist(), the 0.7 @comvi/plugin-locale-detector
 * behaviour over the one negotiate(): sources in order, the supported entry as spelled,
 * a persisted choice written on every switch, nothing outside a browser.
 * Ported by meaning from plugin-locale-detector: detection-defaults, cookie-source,
 * locale-detector (order, caches), unsupported-locale-persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { detect, LOCALE_KEY, persist } from "../../src/plugins";

const clearCookies = () => {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
};

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  clearCookies();
  localStorage.clear();
  history.replaceState(null, "", "/");
});

const navigatorLanguages = (langs: string[]) =>
  vi.spyOn(navigator, "languages", "get").mockReturnValue(langs);

describe("detect()", () => {
  const supported = ["en", "de", "pt-BR", "uk"];

  it("reads ?lang= first, then the cookie, then localStorage, then navigator.languages", () => {
    navigatorLanguages(["uk-UA"]);
    localStorage.setItem(LOCALE_KEY, "de");
    document.cookie = `${LOCALE_KEY}=pt-BR; path=/`;
    history.replaceState(null, "", "/?lang=en");
    expect(detect({ supported })).toBe("en");
    history.replaceState(null, "", "/");
    expect(detect({ supported })).toBe("pt-BR");
    clearCookies();
    expect(detect({ supported })).toBe("de");
    localStorage.clear();
    expect(detect({ supported })).toBe("uk");
  });

  it("negotiates: a regional or differently spelled request maps to the supported entry as spelled", () => {
    navigatorLanguages(["pt_br", "en-GB"]);
    expect(detect({ supported })).toBe("pt-BR");
    navigatorLanguages(["de-CH"]);
    expect(detect({ supported })).toBe("de");
  });

  it("skips a source that names nothing supported and answers the fallback when none match", () => {
    navigatorLanguages(["ja"]);
    document.cookie = `${LOCALE_KEY}=fr; path=/`;
    expect(detect({ supported, fallback: "uk" })).toBe("uk");
    expect(detect({ supported })).toBe("en");
  });

  it("honours `order`, `query` and `key`", () => {
    navigatorLanguages(["de"]);
    history.replaceState(null, "", "/?hl=uk");
    document.cookie = "my_locale=pt-BR; path=/";
    expect(detect({ supported, order: ["navigator", "query"] })).toBe("de");
    expect(detect({ supported, order: ["query"], query: "hl" })).toBe("uk");
    expect(detect({ supported, order: ["cookie"], key: "my_locale" })).toBe("pt-BR");
  });

  it("survives a source that throws (blocked storage)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    navigatorLanguages(["de"]);
    expect(detect({ supported })).toBe("de");
  });

  it("outside a browser answers the fallback", () => {
    vi.stubGlobal("document", undefined);
    expect(detect({ supported, fallback: "uk" })).toBe("uk");
    vi.unstubAllGlobals();
  });
});

describe("persist()", () => {
  it("writes every locale switch to the cookie, and nothing at setup", async () => {
    const i18n = createI18n({ locale: "en", plugins: [persist()] });
    expect(document.cookie).not.toContain(LOCALE_KEY);
    await i18n.setLocale("de");
    expect(document.cookie).toContain(`${LOCALE_KEY}=de`);
    i18n.add("de", { a: "A" }); // a change that is not a switch
    await i18n.setLocale("pt-BR");
    expect(document.cookie).toContain(`${LOCALE_KEY}=pt-BR`);
  });

  it("writes to localStorage with to: 'storage', under its key", async () => {
    const i18n = createI18n({ locale: "en", plugins: [persist({ to: "storage", key: "k" })] });
    await i18n.setLocale("uk");
    expect(localStorage.getItem("k")).toBe("uk");
  });

  it("stops on destroy() and round-trips with detect()", async () => {
    const supported = ["en", "de"];
    const i18n = createI18n({ locale: detect({ supported }), plugins: [persist()] });
    await i18n.setLocale("de");
    i18n.destroy();
    expect(detect({ supported })).toBe("de");
  });
});
