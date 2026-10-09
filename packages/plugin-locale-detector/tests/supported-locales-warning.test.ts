/**
 * Without `supportedLocales` the detector cannot tell a language the app ships
 * from one it does not: whatever the browser reports becomes the active locale
 * and is cached. Development builds say so once, when the plugin starts.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";
import type { LocaleDetectorOptions } from "../src/index";
import { localeDetector } from "../src/index";
import { mockNavigator } from "./setup";

const WARNING =
  "[@comvi/plugin-locale-detector] localeDetector() was given no supportedLocales, so any " +
  "language the browser reports becomes the active locale and is cached, including one this " +
  "app has no translations for. Pass the locales you ship: " +
  'localeDetector({ supportedLocales: ["en", "de"] }).';

const initWith = async (options?: LocaleDetectorOptions) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(localeDetector(options));
  await i18n.init();
  return { i18n, warn };
};

describe("localeDetector() without supportedLocales", () => {
  it("no options → warns once at init, naming the option", async () => {
    mockNavigator(["en-US"], "en-US");

    const { warn } = await initWith();

    expect(warn.mock.calls).toEqual([[WARNING]]);
  });

  it("other options but no supportedLocales → warns", async () => {
    mockNavigator(["en-US"], "en-US");

    const { warn } = await initWith({ order: ["navigator"], caches: [] });

    expect(warn.mock.calls).toEqual([[WARNING]]);
  });

  it("still applies the detected language, since the warning changes no behaviour", async () => {
    mockNavigator(["ja-JP"], "ja-JP");

    const { i18n } = await initWith({ caches: [] });

    expect(i18n.locale).toBe("ja");
  });

  it("supportedLocales given → silent", async () => {
    mockNavigator(["en-US"], "en-US");

    const { warn } = await initWith({ supportedLocales: ["en", "de"] });

    expect(warn).not.toHaveBeenCalled();
  });

  it("convertDetectedLocale given → silent, the app maps tags itself", async () => {
    mockNavigator(["en-US"], "en-US");

    const { warn } = await initWith({ convertDetectedLocale: (tag) => tag.slice(0, 2) });

    expect(warn).not.toHaveBeenCalled();
  });
});
