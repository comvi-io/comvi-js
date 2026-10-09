import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasLoaderApi } from "@comvi/core";
import { nodeResponseStub } from "./mocks/node-response";
import { runtimeLocaleKeys } from "./mocks/locale-options";

const getCookie = vi.fn();
const getHeader = vi.fn();
const createComviCore = vi.fn();
const runComviSetup = vi.fn(async () => undefined);

vi.mock("h3", () => ({
  getCookie,
  getHeader,
}));

vi.mock("#build/comvi.i18n", () => ({
  createComviCore,
}));

vi.mock("#build/comvi.setup", () => ({
  runComviSetup,
}));

/** Overrides merge into `public.comvi`, so a test shows only the field it varies. */
function createEvent(comviOverrides: Record<string, unknown> = {}) {
  return {
    node: { res: nodeResponseStub() },
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            locales: ["en", "de", "uk"],
            defaultLocale: "en",
            defaultNs: "common",
            fallbackLocale: "en",
            defaultParams: { formality: "formal" },
            ...runtimeLocaleKeys(),
            ...comviOverrides,
          },
        },
        comvi: {},
      },
    },
  } as any;
}

function createI18nStub(initialLanguage = "en", { loaderCapability = true } = {}) {
  const loaded = new Set<string>();

  // The BASE host — what the generated default `#build/comvi.i18n` builds.
  const i18n: any = {
    locale: initialLanguage,
    init: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
    setLocale: vi.fn(async (newLocale: string) => {
      i18n.locale = newLocale;
    }),
    hasLocale: vi.fn((locale: string, namespace = "common") =>
      loaded.has(`${locale}:${namespace}`),
    ),
    // No fallback chain: the chain is pinned with real hosts in
    // `ssr-fallback-contract.test.ts`.
    getFallbackLocales: vi.fn((): string[] => []),
    t: vi.fn(() => "translated-value"),
    hasTranslation: vi.fn(() => true),
  };

  if (!loaderCapability) {
    return i18n;
  }

  // `@comvi/core/loader` attaches all-or-nothing and core's `hasLoaderApi`
  // probes for the WHOLE surface, so a composed host has to be modelled in
  // full or it reads as capability-less.
  Object.assign(i18n, {
    registerLoader: vi.fn(),
    getLoader: vi.fn(() => ({ name: "loader" })),
    reloadMessages: vi.fn().mockResolvedValue(undefined),
    addActiveNamespaces: vi.fn().mockResolvedValue(undefined),
    removeActiveNamespace: vi.fn(),
    removeActiveNamespaces: vi.fn(),
    onLoadError: vi.fn(() => () => {}),
    addActiveNamespace: vi.fn(async (namespace: string) => {
      loaded.add(`${i18n.locale}:${namespace}`);
    }),
  });

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
    createComviCore.mockReset();
    runComviSetup.mockReset();
    runComviSetup.mockResolvedValue(undefined);
  });

  it("uses explicit locale and namespace, returning string translation helper", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t, locale, hasTranslation } = await useTranslation(createEvent(), {
      locale: "de",
      ns: "admin",
    });

    expect(locale).toBe("de");
    t("hello");
    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        locale: "de",
        ns: "admin",
      }),
    );
    expect(i18n.addActiveNamespace).toHaveBeenCalledWith("admin");
    expect(createComviCore).toHaveBeenCalledWith(
      expect.objectContaining({ defaultParams: { formality: "formal" } }),
    );
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

  it("translates on a capability-less base host without touching the loader", async () => {
    // The generated default host has no loader, so there is nothing to load:
    // whatever `comvi.setup` put in the catalog is what renders. Calling an
    // absent member would be a TypeError swallowed by a warn — this proves the
    // capability probe runs instead.
    const i18n = createI18nStub("en", { loaderCapability: false });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    const { t, locale } = await useTranslation(createEvent(), {
      locale: "de",
      ns: "admin",
    });

    expect(locale).toBe("de");
    expect(t("hello")).toBe("translated-value");
    expect(hasLoaderApi(i18n)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("detects locale from cookie when enabled and supported", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue("de");
    getHeader.mockReturnValue(undefined);
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());
    expect(locale).toBe("de");
  });

  it("detects locale from Accept-Language header when cookie is not set", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue(undefined);
    getHeader.mockReturnValue("de-DE,de;q=0.9,en;q=0.8");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());
    expect(locale).toBe("de");
  });

  it("matches base language to region-specific locale using prefix fallback", async () => {
    const i18n = createI18nStub("en-US");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue(undefined);
    getHeader.mockReturnValue("en-GB,en;q=0.9,de;q=0.8");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(
      createEvent({
        locales: ["en-US", "de-DE"],
        defaultLocale: "en-US",
        fallbackLocale: "en-US",
      }),
    );

    expect(locale).toBe("en-US");
  });

  it("falls back to default locale when browser detection is disabled", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue("de");
    getHeader.mockReturnValue("de-DE,de;q=0.9");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(
      createEvent({
        locales: ["en", "de"],
        ...runtimeLocaleKeys({ localeCookie: false, localeDetection: false }),
      }),
    );

    expect(locale).toBe("en");
  });

  it("reuses one i18n instance for repeated calls in the same locale", async () => {
    const i18n = createI18nStub("en");
    i18n.hasLocale.mockReturnValue(true);
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    await useTranslation(event, { locale: "en" });
    await useTranslation(event, { locale: "en" });

    expect(createComviCore).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.setLocale).not.toHaveBeenCalled();
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
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    const pendingA = useTranslation(event, { locale: "en" });
    const pendingB = useTranslation(event, { locale: "en" });
    // While init is still gated, both calls are in flight: the second joined the
    // first rather than constructing a host of its own.
    await Promise.resolve();
    expect(createComviCore).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);

    releaseInit();
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    // Re-checked after both settled: an init scheduled later in the sequence would
    // be caught here, not only within the first microtask.
    expect(createComviCore).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);
    expect(resultA.locale).toBe("en");
    expect(resultB.locale).toBe("en");
  });

  it("evicts a failed request instance so a later call in the same request retries", async () => {
    const failing = createI18nStub("en");
    failing.init.mockRejectedValueOnce(new Error("comvi.setup blew up"));
    const healthy = createI18nStub("en");
    createComviCore.mockImplementationOnce(() => failing).mockImplementationOnce(() => healthy);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    await expect(useTranslation(event, { locale: "en" })).rejects.toThrow("comvi.setup blew up");
    const { locale } = await useTranslation(event, { locale: "en" });

    expect(locale).toBe("en");
    expect(createComviCore).toHaveBeenCalledTimes(2);
  });

  it("creates isolated request-scoped i18n instances per locale", async () => {
    const i18nEn = createI18nStub("en");
    const i18nDe = createI18nStub("de");
    createComviCore.mockImplementationOnce(() => i18nEn).mockImplementationOnce(() => i18nDe);

    const useTranslation = await importUseTranslation();
    const event = createEvent();

    const [enResult, deResult] = await Promise.all([
      useTranslation(event, { locale: "en", ns: "common" }),
      useTranslation(event, { locale: "de", ns: "common" }),
    ]);

    expect(createComviCore).toHaveBeenCalledTimes(2);
    expect(runComviSetup).toHaveBeenCalledTimes(2);
    expect(i18nEn.init).toHaveBeenCalledTimes(1);
    expect(i18nDe.init).toHaveBeenCalledTimes(1);

    enResult.t("hello");
    deResult.t("hello");

    expect(i18nEn.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        locale: "en",
        ns: "common",
      }),
    );
    expect(i18nDe.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        locale: "de",
        ns: "common",
      }),
    );
  });

  it("ignores the cookie when the detection config turns useCookie off", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue("de");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(
      createEvent(runtimeLocaleKeys({ localeCookie: false })),
    );

    expect(locale).toBe("en");
  });

  it("ignores a cookie carrying a locale that is not configured", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getCookie.mockReturnValue("es");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());

    expect(locale).toBe("en");
  });

  it("reads the browser preference from the Accept-Language header", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const event = createEvent();

    await useTranslation(event);

    expect(getHeader).toHaveBeenCalledWith(event, "accept-language");
  });

  it("ignores a locale the Accept-Language header refuses with q=0", async () => {
    // The Nitro utils' half of the q=0 parity check; middleware.test.ts carries
    // the route-middleware half. Both call the one resolver.
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    getHeader.mockReturnValue("uk;q=0");
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());

    expect(locale).toBe("en");
  });

  it("resolves the fallback locale when the request sends no Accept-Language header", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { locale } = await useTranslation(createEvent());

    expect(locale).toBe("en");
    expect(i18n.t).not.toHaveBeenCalled();
  });

  it("does not reload a namespace the host already carries", async () => {
    const i18n = createI18nStub("en");
    i18n.hasLocale.mockReturnValue(true);
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { locale: "en", ns: "admin" });

    expect(i18n.addActiveNamespace).not.toHaveBeenCalled();
  });

  it("keeps a host that is already on the resolved locale untouched while loading", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { locale: "en", ns: "admin" });

    expect(i18n.setLocale).not.toHaveBeenCalled();
    expect(i18n.addActiveNamespace).toHaveBeenCalledWith("admin");
  });

  it("answers hasTranslation against the resolved locale and namespace by default", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { hasTranslation } = await useTranslation(createEvent(), { locale: "de" });
    hasTranslation("greeting");

    expect(i18n.hasTranslation).toHaveBeenCalledWith("greeting", "de", "common");
  });

  it("falls back to built-in defaults when the runtime config carries no comvi settings", async () => {
    const i18n = createI18nStub("en");
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();
    const bareEvent = {
      node: { res: nodeResponseStub() },
      context: { runtimeConfig: { public: { comvi: {} }, comvi: {} } },
    } as any;

    const { locale, t } = await useTranslation(bareEvent);
    t("hello");

    expect(locale).toBe("en");
    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "en", ns: "default" }),
    );
  });

  it("warns and keeps translating when a namespace fails to load", async () => {
    const i18n = createI18nStub("en");
    i18n.addActiveNamespace.mockRejectedValue(new Error("offline"));
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), { locale: "de", ns: "admin" });

    expect(t("hello")).toBe("translated-value");
    expect(warnSpy).toHaveBeenCalledWith(
      "[@comvi/nuxt] Failed to load de:admin:",
      expect.any(Error),
    );
  });

  describe("localeCookie and localeDetection, the shared vocabulary", () => {
    const headers = (values: Record<string, string>) =>
      getHeader.mockImplementation((_event: unknown, name: string) => values[name]);

    it("walks localeDetection.order: Accept-Language before the cookie when asked", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      getCookie.mockReturnValue("de");
      headers({ "accept-language": "uk" });
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(
        createEvent({ localeDetection: { order: ["accept-language", "cookie"] } }),
      );

      expect(locale).toBe("uk");
    });

    it("ignores an unknown order entry instead of reading Accept-Language for it", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      headers({ "accept-language": "uk" });
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(
        createEvent({ localeDetection: { order: ["bogus"] } }),
      );

      expect(locale).toBe("en");
    });

    it("reads the locale from headerName when header is in the order", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      getCookie.mockReturnValue("de");
      headers({ "x-locale": "uk" });
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(
        createEvent({ localeDetection: { order: ["header", "cookie"], headerName: "x-locale" } }),
      );

      expect(locale).toBe("uk");
    });

    it("reads the cookie a localeCookie object names", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      getCookie.mockImplementation((_event: unknown, name: string) =>
        name === "LANG" ? "de" : undefined,
      );
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(
        createEvent({
          localeCookie: { name: "LANG", maxAge: 1, secure: true, sameSite: "lax" },
        }),
      );

      expect(locale).toBe("de");
    });

    it("reads no cookie with localeCookie: false", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      getCookie.mockReturnValue("de");
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(createEvent({ localeCookie: false }));

      expect(locale).toBe("en");
      expect(getCookie).not.toHaveBeenCalled();
    });

    it("uses the app's resolveAcceptLanguage with the default locale", async () => {
      createComviCore.mockReturnValue(createI18nStub("en"));
      headers({ "accept-language": "uk" });
      const custom = vi.fn(() => "de");
      vi.doMock("#build/comvi.detection", () => ({ resolveAcceptLanguage: custom }));
      const useTranslation = await importUseTranslation();

      const { locale } = await useTranslation(createEvent());

      vi.doUnmock("#build/comvi.detection");
      expect(custom).toHaveBeenCalledWith("uk", ["en", "de", "uk"], "en");
      expect(locale).toBe("de");
    });
  });
});
