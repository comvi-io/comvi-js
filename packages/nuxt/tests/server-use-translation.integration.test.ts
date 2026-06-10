import { beforeEach, describe, expect, it, vi } from "vitest";
import type { I18n } from "@comvi/core";

const getCookie = vi.fn();
const getHeader = vi.fn();
const runComviSetup = vi.fn();

vi.mock("h3", () => ({
  getCookie,
  getHeader,
}));

vi.mock("#build/comvi.setup", () => ({
  runComviSetup,
}));

function createEvent() {
  return {
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            locales: ["en", "de"],
            defaultLocale: "en",
            cookieName: "i18n_locale",
            defaultNs: "common",
            fallbackLocale: "en",
            detectBrowserLanguage: { useCookie: true, fallbackLocale: "en" },
          },
        },
        comvi: {},
      },
    },
  } as any;
}

async function importUseTranslation() {
  vi.resetModules();
  return (await import("../src/runtime/server/utils/useTranslation")).useTranslation;
}

describe("useTranslation (server, real core instance)", () => {
  beforeEach(() => {
    getCookie.mockReset();
    getHeader.mockReset();
    runComviSetup.mockReset();
    runComviSetup.mockImplementation(async ({ i18n }: { i18n: I18n }) => {
      i18n.addTranslations({
        "en:common": { greeting: "Hello", farewell: "Bye" },
        "de:common": { greeting: "Hallo", farewell: "Tschüss" },
      });
    });
  });

  it("resolves locale-correct strings for concurrent requests with different locales", async () => {
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    const [en, de] = await Promise.all([
      useTranslation(event, { locale: "en" }),
      useTranslation(event, { locale: "de" }),
    ]);

    expect(en.t("greeting")).toBe("Hello");
    expect(de.t("greeting")).toBe("Hallo");
    expect(en.t("farewell")).toBe("Bye");
    expect(de.t("farewell")).toBe("Tschüss");
  });

  it("translates with the detected cookie locale through a real instance", async () => {
    getCookie.mockReturnValue("de");
    const useTranslation = await importUseTranslation();

    const { t, locale } = await useTranslation(createEvent());

    expect(locale).toBe("de");
    expect(t("greeting")).toBe("Hallo");
  });
});
