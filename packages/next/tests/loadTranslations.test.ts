import { describe, it, expect, vi, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { loadTranslations, setI18n } from "../src/server";

describe("loadTranslations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns and returns empty object when no loader is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No loader configured"));
  });

  it("warns about missing loader only once per i18n instance", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
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

    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour cached" } });
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour cached" },
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("No loader configured"));
  });

  it("returns plain serializable objects for Server->Client boundaries", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour cached" } });
    setI18n(i18n);

    const result = await loadTranslations("fr");

    expect(Object.getPrototypeOf(result["fr:common"])).toBe(Object.prototype);
    expect(result["fr:common"]).toEqual({ greeting: "Bonjour cached" });
  });

  it("loads requested namespaces via registered loader and caches loaded entries", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({ "en:common": { __seed: "seed" } });

    const loaderMock = vi.fn(async (language: string, namespace: string) => {
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

    expect(loaderMock).toHaveBeenCalledTimes(2);
    expect(loaderMock).toHaveBeenCalledWith("fr", "common");
    expect(loaderMock).toHaveBeenCalledWith("fr", "admin");
    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour" },
      "fr:admin": { title: "Admin Panel" },
    });
  });

  it("uses cache for already loaded namespaces and fetches only missing ones", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({
      "en:common": { __seed: "seed" },
      "fr:common": { greeting: "Bonjour cached" },
    });

    const loaderMock = vi.fn(async (_language: string, namespace: string) => {
      if (namespace === "admin") {
        return { title: "Admin Panel" };
      }
      return {};
    });
    i18n.registerLoader(loaderMock);
    setI18n(i18n);

    const result = await loadTranslations("fr", {
      namespaces: ["common", "admin"],
    });

    expect(loaderMock).toHaveBeenCalledTimes(1);
    expect(loaderMock).toHaveBeenCalledWith("fr", "admin");
    expect(result).toEqual({
      "fr:common": { greeting: "Bonjour cached" },
      "fr:admin": { title: "Admin Panel" },
    });
  });

  it("reports and warns when a namespace load fails but keeps successful results", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
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
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load fr:common:"),
      expect.any(String),
    );
  });

  it("deduplicates concurrent init calls during parallel translation loads", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });

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
    expect(warnSpy).toHaveBeenCalled();
  });
});
