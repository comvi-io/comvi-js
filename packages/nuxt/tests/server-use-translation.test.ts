import { beforeEach, describe, expect, it, vi } from "vitest";

const getCookie = vi.fn();
const getHeader = vi.fn();
const createI18n = vi.fn();
const runComviSetup = vi.fn(async () => undefined);

vi.mock("h3", () => ({
  getCookie,
  getHeader,
}));

vi.mock("@comvi/core", () => ({
  createI18n,
}));

vi.mock("#build/comvi.setup", () => ({
  runComviSetup,
}));

function createEvent(runtimeConfigOverrides: Partial<any> = {}) {
  return {
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            locales: ["en", "de", "uk"],
            defaultLocale: "en",
            cookieName: "i18n_locale",
            defaultNs: "common",
            fallbackLanguage: "en",
            detectBrowserLanguage: {
              useCookie: true,
              fallbackLocale: "en",
            },
            cdnUrl: undefined,
            apiBaseUrl: "https://api.example.com",
          },
        },
        comvi: {},
        ...runtimeConfigOverrides,
      },
    },
  } as any;
}

function createI18nStub(initialLanguage = "en") {
  const loaded = new Set<string>();

  const i18n: any = {
    locale: initialLanguage,
    init: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
    setLocaleAsync: vi.fn(async (newLocale: string) => {
      i18n.locale = newLocale;
    }),
    hasLocale: vi.fn((locale: string, namespace = "common") =>
      loaded.has(`${locale}:${namespace}`),
    ),
    addActiveNamespace: vi.fn(async (namespace: string) => {
      loaded.add(`${i18n.locale}:${namespace}`);
    }),
    t: vi.fn(() => "translated-value"),
    hasTranslation: vi.fn(() => true),
  };

  return i18n;
}

async function importUseTranslation() {
  vi.resetModules();
  return (await import("../src/runtime/server/utils/useTranslation")).useTranslation;
}

describe("useTranslation (server)", () => {
  beforeEach(() => {
    getCookie.mockReset();
    getHeader.mockReset();
    createI18n.mockReset();
    runComviSetup.mockReset();
    runComviSetup.mockResolvedValue(undefined);
  });

  it("uses explicit locale and namespace, returning string translation helper", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t, locale, hasTranslation } = await useTranslation(createEvent(), {
      locale: "de",
      namespace: "admin",
    });

    expect(locale).toBe("de");
    t("hello");
    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        language: "de",
        ns: "admin",
      }),
    );
    expect(i18n.addActiveNamespace).toHaveBeenCalledWith("admin");
    expect(runComviSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        i18n,
        event: expect.objectContaining({ context: expect.any(Object) }),
        runtime: "server",
      }),
    );
    expect(runComviSetup.mock.invocationCallOrder[0]).toBeLessThan(
      i18n.init.mock.invocationCallOrder[0],
    );

    hasTranslation("hello", { locale: "de", ns: "admin" });
    expect(i18n.hasTranslation).toHaveBeenCalledWith("hello", "de", "admin");
  });

  it("detects locale from cookie when enabled and supported", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);
    getCookie.mockReturnValue("de");
    getHeader.mockReturnValue(undefined);
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());
    expect(locale).toBe("de");
  });

  it("detects locale from Accept-Language header when cookie is not set", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);
    getCookie.mockReturnValue(undefined);
    getHeader.mockReturnValue("de-DE,de;q=0.9,en;q=0.8");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());
    expect(locale).toBe("de");
  });

  it("matches base language to region-specific locale using prefix fallback", async () => {
    const i18n = createI18nStub("en-US");
    createI18n.mockReturnValue(i18n);
    getCookie.mockReturnValue(undefined);
    getHeader.mockReturnValue("en-GB,en;q=0.9,de;q=0.8");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(
      createEvent({
        public: {
          comvi: {
            locales: ["en-US", "de-DE"],
            defaultLocale: "en-US",
            cookieName: "i18n_locale",
            defaultNs: "common",
            fallbackLanguage: "en-US",
            detectBrowserLanguage: {
              useCookie: true,
              fallbackLocale: "en-US",
            },
            cdnUrl: undefined,
            apiBaseUrl: "https://api.example.com",
          },
        },
      }),
    );

    expect(locale).toBe("en-US");
  });

  it("falls back to default locale when browser detection is disabled", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);
    getCookie.mockReturnValue("de");
    getHeader.mockReturnValue("de-DE,de;q=0.9");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(
      createEvent({
        public: {
          comvi: {
            locales: ["en", "de"],
            defaultLocale: "en",
            defaultNs: "common",
            cookieName: "i18n_locale",
            detectBrowserLanguage: false,
          },
        },
      }),
    );

    expect(locale).toBe("en");
  });

  it("reuses one i18n instance for repeated calls in the same locale", async () => {
    const i18n = createI18nStub("en");
    i18n.hasLocale.mockReturnValue(true);
    createI18n.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    await useTranslation(event, { locale: "en" });
    await useTranslation(event, { locale: "en" });

    expect(createI18n).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.setLocaleAsync).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent request-level i18n initialization", async () => {
    const i18n = createI18nStub("en");
    let releaseInit!: () => void;
    const initGate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    i18n.init.mockImplementation(async () => {
      await initGate;
    });
    createI18n.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    const pendingA = useTranslation(event, { locale: "en" });
    const pendingB = useTranslation(event, { locale: "en" });
    await vi.waitFor(() => {
      expect(createI18n).toHaveBeenCalledTimes(1);
      expect(runComviSetup).toHaveBeenCalledTimes(1);
      expect(i18n.init).toHaveBeenCalledTimes(1);
    });

    releaseInit();
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
    expect(resultA.locale).toBe("en");
    expect(resultB.locale).toBe("en");
  });

  it("creates isolated request-scoped i18n instances per locale", async () => {
    const i18nEn = createI18nStub("en");
    const i18nDe = createI18nStub("de");
    createI18n.mockImplementationOnce(() => i18nEn).mockImplementationOnce(() => i18nDe);

    const useTranslation = await importUseTranslation();
    const event = createEvent();

    const [enResult, deResult] = await Promise.all([
      useTranslation(event, { locale: "en", namespace: "common" }),
      useTranslation(event, { locale: "de", namespace: "common" }),
    ]);

    expect(createI18n).toHaveBeenCalledTimes(2);
    expect(runComviSetup).toHaveBeenCalledTimes(2);
    expect(i18nEn.init).toHaveBeenCalledTimes(1);
    expect(i18nDe.init).toHaveBeenCalledTimes(1);

    enResult.t("hello");
    deResult.t("hello");

    expect(i18nEn.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        language: "en",
        ns: "common",
      }),
    );
    expect(i18nDe.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        language: "de",
        ns: "common",
      }),
    );
  });
});
