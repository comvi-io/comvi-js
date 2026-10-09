/**
 * A detected locale is persisted once `init()` has succeeded with it, never
 * before. Written earlier, a language the app has no catalog for was cached
 * ahead of the first load, and every later visit read it back and failed the
 * same way: no query parameter and no in-app switch could get the visitor out
 * without clearing storage.
 *
 * Every visit below is a new instance over the same `localStorage`. The app
 * ships `en` and `de`; the detector is given no `supportedLocales`, which is
 * the setup that lets an unshipped language through.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import type { LocaleDetectorOptions } from "../src/index";
import { localeDetector } from "../src/index";
import { mockNavigator, mockWindowLocation } from "./setup";

const KEY = "i18n_locale";
const stored = () => localStorage.getItem(KEY);

/** What storage held each time the loader was asked for a catalog. */
let storedWhileLoading: Array<string | null>;

const visit = (options?: LocaleDetectorOptions) => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  storedWhileLoading = [];
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(attachLoader);
  i18n.registerLoader(async (locale) => {
    storedWhileLoading.push(stored());
    if (locale !== "en" && locale !== "de") throw new Error(`no catalog for ${locale}`);
    return { hello: `hello-${locale}` };
  });
  return i18n.use(localeDetector(options));
};

const FAILED_JA = '[@comvi/core] Failed to load all namespaces for locale "ja": default';

describe("a browser language the app has no catalog for", () => {
  it("visit 1 → init fails and nothing is persisted", async () => {
    mockNavigator(["ja-JP"], "ja-JP");

    await expect(visit().init()).rejects.toThrow(FAILED_JA);

    expect(stored()).toBeNull();
  });

  it("visit 2, same browser → the same failure, still nothing persisted", async () => {
    mockNavigator(["ja-JP"], "ja-JP");
    await visit()
      .init()
      .catch(() => {});

    await expect(visit().init()).rejects.toThrow(FAILED_JA);

    expect(stored()).toBeNull();
  });

  it("visit 3 with ?lng=en → init succeeds in en, and en is persisted", async () => {
    mockNavigator(["ja-JP"], "ja-JP");
    await visit()
      .init()
      .catch(() => {});
    mockWindowLocation("?lng=en");

    const i18n = visit();
    await i18n.init();

    expect(i18n.t("hello")).toBe("hello-en");
    expect(stored()).toBe("en");
  });

  it("app-level setLocale('en') after the failed init → en renders, storage stays empty", async () => {
    mockNavigator(["ja-JP"], "ja-JP");
    const i18n = visit();
    await i18n.init().catch(() => {});

    await i18n.setLocale("en");

    expect(i18n.t("hello")).toBe("hello-en");
    expect(stored()).toBeNull();
  });
});

describe("a cached locale the app has no catalog for", () => {
  it("init fails → the value the detector read is removed", async () => {
    localStorage.setItem(KEY, "ja");

    await expect(visit().init()).rejects.toThrow(FAILED_JA);

    expect(stored()).toBeNull();
  });

  it("the next visit with ?lng=en → init succeeds, since the cache no longer wins", async () => {
    localStorage.setItem(KEY, "ja");
    await visit()
      .init()
      .catch(() => {});
    mockWindowLocation("?lng=en");

    const i18n = visit();
    await i18n.init();

    expect(i18n.locale).toBe("en");
    expect(stored()).toBe("en");
  });

  it("the app rewrote the key during the failing init → its value is kept", async () => {
    localStorage.setItem(KEY, "ja");
    const i18n = visit();
    i18n.on("loadError", () => localStorage.setItem(KEY, "de"));

    await i18n.init().catch(() => {});

    expect(stored()).toBe("de");
  });

  it("removed from every cache target that still holds it", async () => {
    localStorage.setItem(KEY, "ja");
    sessionStorage.setItem(KEY, "ja");

    await visit({ caches: ["localStorage", "sessionStorage"] })
      .init()
      .catch(() => {});

    expect([stored(), sessionStorage.getItem(KEY)]).toEqual([null, null]);
  });

  it("destroyed mid-init with no load failure → the cached value is kept", async () => {
    localStorage.setItem(KEY, "de");
    const i18n = visit();

    const init = i18n.init();
    await i18n.destroy();
    await init;

    expect(stored()).toBe("de");
  });
});

describe("a locale the app does ship", () => {
  it("detected at init → persisted once init has succeeded, not while it loads", async () => {
    mockNavigator(["de-DE"], "de-DE");

    await visit().init();

    expect(storedWhileLoading).toEqual([null]);
    expect(stored()).toBe("de");
  });

  it("equal to the configured locale → persisted once init has succeeded", async () => {
    mockNavigator(["en-US"], "en-US");

    await visit().init();

    expect(stored()).toBe("en");
  });

  it("explicit switch after init → persisted immediately", async () => {
    mockNavigator(["en-US"], "en-US");
    const i18n = visit();
    await i18n.init();

    await i18n.setLocale("de");

    expect(stored()).toBe("de");
  });

  it("cached and loadable → read back and kept", async () => {
    localStorage.setItem(KEY, "de");

    const i18n = visit();
    await i18n.init();

    expect(i18n.locale).toBe("de");
    expect(stored()).toBe("de");
  });
});
