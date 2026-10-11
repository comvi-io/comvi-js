/**
 * `ssrLocale` whose catalog is NOT available and whose load fails. The locale
 * ref mirrors the core: it never reports a locale the instance is not in,
 * neither while the load is pending nor after it rejects.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n as createCore } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { createI18nFromCore } from "../src";

const loadedCore = async (uk: () => Promise<Record<string, string>>) => {
  const core = createCore({
    locale: "en",
    exposeGlobal: false,
    onError: () => {},
  }).use(loader({ en: async () => ({ greeting: "Hello" }), uk }));
  await core.init();
  return core;
};

/** Resolves when the locale switch itself is reported as failed. */
const switchFailed = (core: Awaited<ReturnType<typeof loadedCore>>) =>
  new Promise<void>((resolve) =>
    core.on("loadError", ({ namespace }) => {
      if (namespace === "locale-change") resolve();
    }),
  );

describe("vue — ssrLocale whose catalog fails to load", () => {
  it("keeps the ref on the core's locale while the load is pending and after it rejects", async () => {
    const core = await loadedCore(async () => {
      throw new Error("offline");
    });
    const failed = switchFailed(core);

    const i18n = createI18nFromCore(core, { ssrLocale: "uk" });

    expect(i18n.locale.value).toBe(core.locale);
    expect(i18n.t("greeting")).toBe("Hello");

    await failed;

    expect(core.locale).toBe("en");
    expect(i18n.locale.value).toBe("en");
    expect(i18n.t("greeting")).toBe("Hello");
    expect(i18n.formatNumber(1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
  });

  it("lets the same locale be requested again after the failure", async () => {
    const uk = vi
      .fn<() => Promise<Record<string, string>>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ greeting: "Привіт" });
    const core = await loadedCore(uk);
    const failed = switchFailed(core);
    const i18n = createI18nFromCore(core, { ssrLocale: "uk" });
    await failed;

    i18n.locale.value = "uk";
    await vi.waitFor(() => expect(core.locale).toBe("uk"));

    expect(i18n.locale.value).toBe("uk");
    expect(i18n.t("greeting")).toBe("Привіт");
  });

  it("moves the ref when the pending load succeeds", async () => {
    const core = await loadedCore(async () => ({ greeting: "Привіт" }));
    const i18n = createI18nFromCore(core, { ssrLocale: "uk" });

    await vi.waitFor(() => expect(core.locale).toBe("uk"));

    expect(i18n.locale.value).toBe("uk");
    expect(i18n.t("greeting")).toBe("Привіт");
  });
});
