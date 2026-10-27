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
import { detect, LOCALE_KEY, persist, type DetectOptions } from "../../src/plugins";

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

/** The locale an instance starts in with `detect(o)` as its plugin (and `locale: start`). */
const detected = (o: DetectOptions, start = "en") =>
  createI18n({ locale: start, plugins: [detect(o)] }).locale;

describe("detect() — a plugin (design §3.3)", () => {
  const supported = ["en", "de", "pt-BR", "uk"];

  it("reads ?lang= first, then the cookie, then localStorage, then navigator.languages", () => {
    navigatorLanguages(["uk-UA"]);
    localStorage.setItem(LOCALE_KEY, "de");
    document.cookie = `${LOCALE_KEY}=pt-BR; path=/`;
    history.replaceState(null, "", "/?lang=en");
    expect(detected({ supported }, "uk")).toBe("en");
    history.replaceState(null, "", "/");
    expect(detected({ supported })).toBe("pt-BR");
    clearCookies();
    expect(detected({ supported })).toBe("de");
    localStorage.clear();
    expect(detected({ supported })).toBe("uk");
  });

  it("negotiates: a regional or differently spelled request maps to the supported entry as spelled", () => {
    navigatorLanguages(["pt_br", "en-GB"]);
    expect(detected({ supported })).toBe("pt-BR");
    navigatorLanguages(["de-CH"]);
    expect(detected({ supported })).toBe("de");
  });

  it("skips a source that names nothing supported; none match → the `locale` option stays", () => {
    navigatorLanguages(["ja"]);
    document.cookie = `${LOCALE_KEY}=fr; path=/`;
    expect(detected({ supported }, "uk")).toBe("uk");
    expect(detected({ supported })).toBe("en");
  });

  it("honours `order`, `query` and `key`", () => {
    navigatorLanguages(["de"]);
    history.replaceState(null, "", "/?hl=uk");
    document.cookie = "my_locale=pt-BR; path=/";
    expect(detected({ supported, order: ["navigator", "query"] })).toBe("de");
    expect(detected({ supported, order: ["query"], query: "hl" })).toBe("uk");
    expect(detected({ supported, order: ["cookie"], key: "my_locale" })).toBe("pt-BR");
  });

  it("survives a source that throws (blocked storage)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    navigatorLanguages(["de"]);
    expect(detected({ supported })).toBe("de");
  });

  it("outside a browser does nothing", () => {
    navigatorLanguages(["de"]);
    vi.stubGlobal("document", undefined);
    try {
      expect(detected({ supported }, "uk")).toBe("uk");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runs before the first loads: only the detected locale is requested", async () => {
    navigatorLanguages(["de"]);
    const loaded: string[] = [];
    const i18n = createI18n({
      locale: "en",
      plugins: [detect({ supported })],
      loader: async (l, n) => (loaded.push(`${l}:${n}`), { a: l }),
    });
    await i18n.ready;
    expect(i18n.locale).toBe("de");
    expect(i18n.t("a")).toBe("de");
    expect(loaded).toEqual(["de:default"]);
  });

  it("a detected locale that fails to load entirely leaves the `locale` option, loaded", async () => {
    navigatorLanguages(["de"]);
    const loaded: string[] = [];
    const i18n = createI18n({
      locale: "en",
      plugins: [detect({ supported })],
      onError: () => {},
      loader: async (l, n) => {
        loaded.push(`${l}:${n}`);
        if (l == "de") throw new Error("404");
        return { a: l };
      },
    });
    await vi.waitFor(() => expect(i18n.t("a")).toBe("en"));
    expect(i18n.locale).toBe("en");
    expect(loaded).toEqual(["de:default", "en:default"]);
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
    const i18n = createI18n({ locale: "en", plugins: [detect({ supported }), persist()] });
    await i18n.setLocale("de");
    i18n.destroy();
    expect(detected({ supported })).toBe("de");
  });
});
