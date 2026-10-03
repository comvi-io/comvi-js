import { describe, it, expect, vi, afterEach } from "vitest";
import type { LoaderResult } from "@comvi/core/loader";
import { createNextI18n } from "../src/createNextI18n";
import { loadTranslations, setI18n } from "../src/server";
import { _resetServerI18n } from "../src/server/cache";

const makeHost = () =>
  createNextI18n({
    locales: ["en", "fr"],
    defaultLocale: "en",
    defaultNs: "common",
    devMode: false,
  }).i18n;

describe("loadTranslations", () => {
  afterEach(() => {
    // The server i18n is a once-cell: a second setI18n with a different
    // instance throws instead of overwriting.
    _resetServerI18n();
  });

  it("warns and returns empty object when no loader is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const i18n = makeHost();
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      "[comvi/next] No loader configured. " +
        "Register one via i18n.registerLoader(...), or compose one onto the host: " +
        "createNextI18n(...).i18n.use(fetchLoader(...)).",
    );
  });

  it("warns about missing loader only once per i18n instance", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const i18n = makeHost();
    setI18n(i18n);

    await loadTranslations("fr");
    await loadTranslations("fr");

    const noLoaderWarnings = warnSpy.mock.calls.filter(([message]) =>
      String(message).includes("No loader configured"),
    );
    expect(noLoaderWarnings).toHaveLength(1);
  });

  it("returns cached namespace when no loader is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const i18n = makeHost();
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour cached" } });
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour cached" },
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("No loader configured"));
  });

  it("returns plain serializable objects for Server->Client boundaries", async () => {
    const i18n = makeHost();
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour cached" } });
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(Object.getPrototypeOf(result["fr:common"])).toBe(Object.prototype);
    expect(result["fr:common"]).toEqual({ greeting: "Bonjour cached" });
  });

  it("loads requested namespaces via registered loader and caches loaded entries", async () => {
    const i18n = makeHost();
    i18n.addTranslations({ "en:common": { __seed: "seed" } });

    const loaderMock = vi.fn(async (language: string, namespace: string): Promise<LoaderResult> => {
      if (language === "fr" && namespace === "common") {
        return { greeting: "Bonjour" };
      }
      if (language === "fr" && namespace === "admin") {
        return { title: "Admin Panel" };
      }
      return {};
    });
    i18n.registerLoader(loaderMock);

    setI18n(i18n);

    const result = await loadTranslations("fr", {
      namespaces: ["common", "admin"],
    });

    // `en` is the default `fallbackLocale`: `en:common` was seeded, so only
    // `en:admin` is fetched for the chain.
    expect(loaderMock).toHaveBeenCalledTimes(3);
    expect(loaderMock).toHaveBeenCalledWith("fr", "common");
    expect(loaderMock).toHaveBeenCalledWith("fr", "admin");
    expect(loaderMock).toHaveBeenCalledWith("en", "admin");
    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour" },
      "fr:admin": { title: "Admin Panel" },
      "en:common": { __seed: "seed" },
      "en:admin": {},
    });
  });

  it("uses cache for already loaded namespaces and fetches only missing ones", async () => {
    const i18n = makeHost();
    i18n.addTranslations({
      "en:common": { __seed: "seed" },
      "fr:common": { greeting: "Bonjour cached" },
    });

    const loaderMock = vi.fn(
      async (_language: string, namespace: string): Promise<LoaderResult> => {
        if (namespace === "admin") {
          return { title: "Admin Panel" };
        }
        return {};
      },
    );
    i18n.registerLoader(loaderMock);
    setI18n(i18n);

    const result = await loadTranslations("fr", {
      namespaces: ["common", "admin"],
    });

    expect(loaderMock).toHaveBeenCalledTimes(2);
    expect(loaderMock).toHaveBeenCalledWith("fr", "admin");
    expect(loaderMock).toHaveBeenCalledWith("en", "admin");
    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour cached" },
      "fr:admin": { title: "Admin Panel" },
      "en:common": { __seed: "seed" },
      "en:admin": { title: "Admin Panel" },
    });
  });

  it("reports and warns when a namespace load fails but keeps successful results", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const i18n = makeHost();
    i18n.addTranslations({ "en:common": { __seed: "seed" } });

    const loaderMock = vi.fn(async (_language: string, namespace: string) => {
      if (namespace === "common") {
        throw new Error("boom");
      }
      return { title: "Admin Panel" };
    });
    i18n.registerLoader(loaderMock);

    setI18n(i18n);

    const result = await loadTranslations("fr", {
      namespaces: ["common", "admin"],
    });

    expect(result).toEqual({
      "fr:admin": { title: "Admin Panel" },
      "en:common": { __seed: "seed" },
      "en:admin": { title: "Admin Panel" },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load fr:common:"),
      expect.any(String),
    );
  });

  it("deduplicates concurrent init calls during parallel translation loads", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeHost();

    const originalInit = i18n.init.bind(i18n);
    let releaseInit!: () => void;
    const initGate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    const initSpy = vi.spyOn(i18n, "init").mockImplementation(async () => {
      await initGate;
      return originalInit();
    });

    setI18n(i18n);

    const pendingA = loadTranslations("fr");
    const pendingB = loadTranslations("fr");
    await Promise.resolve();

    expect(initSpy).toHaveBeenCalledTimes(1);

    releaseInit();
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    expect(resultA).toEqual({});
    expect(resultB).toEqual({});
    // Re-checked after both loads settled: a second init scheduled later in the
    // sequence would be caught here, not only within the first microtask.
    expect(initSpy).toHaveBeenCalledTimes(1);
  });
  describe("fallback chain", () => {
    const makeChainHost = (fallbackLocale: string | string[]) =>
      createNextI18n({
        locales: ["en", "uk", "de"],
        defaultLocale: "en",
        defaultNs: "common",
        fallbackLocale,
        devMode: false,
      }).i18n;

    const catalogs: Record<string, Record<string, Record<string, string>>> = {
      en: { common: { greeting: "Hello", only_en: "Only en" }, admin: { title: "Admin" } },
      uk: { common: { greeting: "Привіт" }, admin: { title: "Адмін" } },
      de: { common: { greeting: "Hallo", only_de: "Nur de" }, admin: { title: "Verwaltung" } },
    };
    const makeLoader = () =>
      vi.fn(
        async (language: string, namespace: string): Promise<LoaderResult> =>
          catalogs[language]?.[namespace] ?? {},
      );

    it("ships every catalog of an array chain, so a key only in a fallback survives hydration", async () => {
      const i18n = makeChainHost(["de", "en"]);
      const loaderMock = makeLoader();
      i18n.registerLoader(loaderMock);
      setI18n(i18n);

      const result = await loadTranslations("uk");

      expect(Object.keys(result)).toEqual(["uk:common", "de:common", "en:common"]);
      expect(result["en:common"]).toEqual(catalogs.en.common);
      expect(result["de:common"]).toEqual(catalogs.de.common);

      // The real consequence: a client host seeded ONLY with this payload
      // resolves the fallback-only key exactly as the server did.
      const client = makeChainHost(["de", "en"]);
      client.addTranslations(result);
      expect(client.t("only_en", { locale: "uk" })).toBe("Only en");
      expect(client.t("only_de", { locale: "uk" })).toBe("Nur de");
    });

    it("loads a string fallbackLocale alongside the requested locale", async () => {
      const i18n = makeChainHost("en");
      i18n.registerLoader(makeLoader());
      setI18n(i18n);

      const result = await loadTranslations("uk");

      expect(result).toEqual({
        "uk:common": catalogs.uk.common,
        "en:common": catalogs.en.common,
      });
    });

    it("loads a fallback equal to the requested locale once and adds nothing outside the chain", async () => {
      const i18n = makeChainHost("en");
      const loaderMock = makeLoader();
      i18n.registerLoader(loaderMock);
      setI18n(i18n);

      const result = await loadTranslations("en");

      expect(result).toEqual({ "en:common": catalogs.en.common });
      expect(loaderMock.mock.calls.filter(([lang]) => lang === "en")).toHaveLength(1);
      expect(loaderMock).not.toHaveBeenCalledWith("de", expect.anything());
      expect(loaderMock).not.toHaveBeenCalledWith("uk", expect.anything());
    });

    it("loads only the requested namespaces for every locale in the chain", async () => {
      const i18n = makeChainHost("en");
      const loaderMock = makeLoader();
      i18n.registerLoader(loaderMock);
      setI18n(i18n);

      const result = await loadTranslations("uk", { namespaces: ["admin"] });

      expect(Object.keys(result).sort()).toEqual(["en:admin", "uk:admin"]);
      expect(loaderMock).not.toHaveBeenCalledWith("uk", "common");
    });
  });
});
