import { describe, it, expect, vi, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { getI18n, setI18n } from "../src/server";
import { getLocale } from "../src/server/getLocale";

vi.mock("../src/server/getLocale", () => ({
  getLocale: vi.fn().mockResolvedValue("fr"),
}));

const runInServerRuntime = async (fn: () => Promise<void>) => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = "nodejs";
  try {
    await fn();
  } finally {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  }
};

describe("server getI18n", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to getLocale when locale is not passed", async () => {
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
      return { greeting: "Hello" };
    });
    i18n.registerLoader(loaderMock);
    setI18n(i18n);

    const { t } = await getI18n();

    expect(t("greeting")).toBe("Bonjour");
    expect(loaderMock).toHaveBeenCalledWith("fr", "common");
  });

  it("loads translations for the request locale on demand", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({ "en:common": { __seed: "seed" } });

    const loaderMock = vi.fn(async () => ({ greeting: "Bonjour" }));
    i18n.registerLoader(loaderMock);
    setI18n(i18n);

    const { t } = await getI18n({ locale: "fr" });

    expect(t("greeting")).toBe("Bonjour");
    expect(loaderMock).toHaveBeenCalledWith("fr", "common");
  });

  it("exposes hasTranslation with namespace overrides", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });

    const hasTranslationSpy = vi.spyOn(i18n, "hasTranslation");
    hasTranslationSpy
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    i18n.addTranslations({ "fr:common": { __seed: "ok" } });
    setI18n(i18n);

    const { hasTranslation } = await getI18n({ locale: "fr" });

    hasTranslation("greeting");
    hasTranslation("title", { ns: "admin" });
    hasTranslation("missing");
    hasTranslation("greeting", { locale: "en" });

    expect(hasTranslationSpy).toHaveBeenNthCalledWith(1, "greeting", "fr", "common");
    expect(hasTranslationSpy).toHaveBeenNthCalledWith(2, "title", "fr", "admin");
    expect(hasTranslationSpy).toHaveBeenNthCalledWith(3, "missing", "fr", "common");
    expect(hasTranslationSpy).toHaveBeenNthCalledWith(4, "greeting", "en", "common");
  });

  it("throws actionable error when locale cannot be resolved", async () => {
    vi.mocked(getLocale).mockRejectedValueOnce(new Error("not set"));

    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    setI18n(i18n);

    await expect(getI18n()).rejects.toMatchObject({
      message: expect.stringContaining("Locale not set"),
      cause: expect.any(Error),
    });
  });

  it("does not load translations when locale/default namespace is already cached", async () => {
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

    const loaderMock = vi.fn(async () => ({ greeting: "Bonjour from loader" }));
    i18n.registerLoader(loaderMock);
    setI18n(i18n);

    const { t } = await getI18n({ locale: "fr" });

    expect(t("greeting")).toBe("Bonjour cached");
    expect(loaderMock).not.toHaveBeenCalled();
  });

  it("initializes i18n so server plugins run even when locale cache is warm", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = createNextI18n({
        locales: ["en", "fr"],
        defaultLocale: "en",
        defaultNs: "common",
        devMode: false,
      });

      const serverPlugin = vi.fn(async () => undefined);
      nextI18n.useServer(serverPlugin);

      nextI18n.i18n.addTranslations({
        "fr:common": { greeting: "Bonjour cached" },
      });

      setI18n(nextI18n.i18n);

      const { t } = await getI18n({ locale: "fr" });
      expect(t("greeting")).toBe("Bonjour cached");
      expect(serverPlugin).toHaveBeenCalledTimes(1);
    });
  });

  it("passes locale and namespace through getI18n.t() wrapper", async () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });
    i18n.addTranslations({ "fr:common": { __seed: "ok" } });

    const tSpy = vi.spyOn(i18n, "tRaw").mockReturnValue("translated");
    setI18n(i18n);

    const { t } = await getI18n({ locale: "fr" });
    const result = t("title", { ns: "admin", count: 2 } as never);

    expect(result).toBe("translated");
    expect(tSpy).toHaveBeenCalledWith(
      "title",
      expect.objectContaining({
        locale: "fr",
        ns: "admin",
        count: 2,
      }),
    );
  });

  it("flattens structured translation results to plain text", async () => {
    const { i18n } = createNextI18n({
      locales: ["en"],
      defaultLocale: "en",
      defaultNs: "common",
      basicHtmlTags: ["strong"],
      devMode: false,
    });

    i18n.addTranslations({
      "en:common": {
        greeting: "Hello <strong>{name}</strong>",
      },
    });
    setI18n(i18n);

    const { t } = await getI18n({ locale: "en" });

    expect(t("greeting", { name: "Ada" } as never)).toBe("Hello Ada");
  });
});
