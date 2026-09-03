/**
 * `clearTranslations()` clears CONTENT, not intent.
 *
 * The editor-save and webhook-refresh flow is "drop everything, fetch it
 * again": a full clear followed by `reloadTranslations()` or a locale switch.
 * That only works if the host still knows which namespaces it was serving, so
 * a scopeless clear leaves `_activeNamespaces` alone. Naming a namespace
 * (`clearTranslations(undefined, ns)`) is still the one way to deactivate one,
 * and the default namespace is always reloadable.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

function recordingHost() {
  const loads: string[] = [];
  const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
  i18n.registerLoader(async (locale, namespace) => {
    loads.push(`${locale}:${namespace}`);
    return { key: `${locale}/${namespace}` };
  });
  return { i18n, loads };
}

describe("clearTranslations() then reloadTranslations()", () => {
  it("refetches every namespace that was active before the clear", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "footer"]);
    loads.length = 0;

    i18n.clearTranslations();
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:nav", "en:footer"]);
  });

  it("refetches for the fallback locale as well as the current one", async () => {
    const loads: string[] = [];
    const i18n = attachLoader(
      createI18n({ locale: "en", fallbackLocale: "de", ns: ["nav"], exposeGlobal: false }),
    );
    i18n.registerLoader(async (locale, namespace) => {
      loads.push(`${locale}:${namespace}`);
      return { key: "v" };
    });
    await i18n.addActiveNamespace("nav");
    loads.length = 0;

    i18n.clearTranslations();
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:nav", "de:nav"]);
  });

  it("serves the refetched catalog again afterwards", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("nav");

    i18n.clearTranslations();
    await i18n.reloadTranslations();

    expect(i18n.t("key", { ns: "nav" })).toBe("en/nav");
  });
});

describe("clearTranslations() then setLocaleAsync()", () => {
  it("loads the still-active namespaces for the new locale", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespace("nav");
    loads.length = 0;

    i18n.clearTranslations();
    await i18n.setLocaleAsync("de");

    expect(loads).toEqual(["de:nav"]);
  });
});

describe("clearTranslations(undefined, namespace) then reloadTranslations()", () => {
  it("does not refetch the namespace that was named", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin"]);
    loads.length = 0;

    i18n.clearTranslations(undefined, "admin");
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:nav"]);
  });
});

describe("reloadTranslations() with no active namespace left", () => {
  it("falls back to the default namespace", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespace("default");
    loads.length = 0;

    i18n.clearTranslations(undefined, "default");
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:default"]);
  });

  it("warns that the default namespace was reloaded instead of nothing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("default");

    i18n.clearTranslations(undefined, "default");
    await i18n.reloadTranslations();

    expect(warnSpy).toHaveBeenCalledWith(
      '[i18n] reloadTranslations(): no namespace is active, reloading the default namespace "default". clearTranslations(undefined, ns) deactivates a namespace; a scopeless clearTranslations() does not.',
    );
  });
});
