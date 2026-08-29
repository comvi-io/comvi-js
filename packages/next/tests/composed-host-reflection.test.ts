import { describe, it, expect } from "vitest";
import { createNextI18n } from "../src/createNextI18n";

/**
 * B7 — the REFLECTIVE half of the `@comvi/next` composed-host contract.
 *
 * `tests/composed-contract.test.ts` pins what the composed host DOES;
 * this file pins what it LOOKS LIKE to reflection. The claim is the same one
 * `@comvi/core`'s `tests/root-contract.test.ts` pins for the core composite
 * and `packages/core/src/core/devtools.ts:17-18` states in prose:
 *
 *   a spread copy of a host carries DATA only, never behaviour.
 *
 * `src/composedHost.ts` restores the import-map `registerLoader` overload on
 * the instance. Whatever mechanism it uses must leave the own descriptor in
 * the class-method shape `{ writable: true, enumerable: false, configurable:
 * true }` — the shape `attachLoader` installed and every 0.4 consumer that
 * spreads, `Object.keys`-enumerates or `JSON.stringify`s a host relies on.
 */

const ROUTING = { locales: ["en", "de"], defaultLocale: "en" } as const;

/** The class-method descriptor shape core's A11 suite pins. */
const CLASS_METHOD_DESCRIPTOR = { writable: true, enumerable: false, configurable: true };

const shapeOf = (d: PropertyDescriptor | undefined) =>
  d && { writable: d.writable, enumerable: d.enumerable, configurable: d.configurable };

describe("createNextI18n composed host — reflective contract (B7)", () => {
  it("keeps registerLoader a NON-ENUMERABLE own property with the class-method descriptor", () => {
    const { i18n } = createNextI18n({ ...ROUTING });

    const descriptor = Object.getOwnPropertyDescriptor(i18n, "registerLoader");
    expect(descriptor, "the builder installs registerLoader on the instance").toBeDefined();
    expect(typeof descriptor!.value).toBe("function");
    expect(shapeOf(descriptor), "registerLoader descriptor").toEqual(CLASS_METHOD_DESCRIPTOR);

    expect(Object.keys(i18n)).not.toContain("registerLoader");
  });

  it("enumerates data only — no capability member leaks into Object.keys or a spread", () => {
    const { i18n } = createNextI18n({ ...ROUTING, translation: { en: { a: "A" } } });

    const host = i18n as unknown as Record<string, unknown>;
    const enumerableFunctions = Object.keys(host).filter((key) => typeof host[key] === "function");
    expect(enumerableFunctions, "Object.keys must carry no behaviour").toEqual([]);

    const spread = { ...i18n } as Record<string, unknown>;
    expect(
      Object.keys(spread).filter((key) => typeof spread[key] === "function"),
      "a spread copy carries data only",
    ).toEqual([]);
  });

  it("gives every composed capability member the same non-enumerable own shape", () => {
    const { i18n } = createNextI18n({ ...ROUTING });

    // The members `attachLoader` / `attachPlugins` copy onto the instance:
    // the builder must not single any of them out.
    for (const name of [
      "registerLoader",
      "getLoader",
      "reloadTranslations",
      "addActiveNamespace",
      "addActiveNamespaces",
      "onLoadError",
      "use",
      "onMissingKey",
      "setPluginData",
      "getPluginData",
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      if (!descriptor) continue; // inherited members are already non-enumerable
      expect(shapeOf(descriptor), `${name} descriptor`).toEqual(CLASS_METHOD_DESCRIPTOR);
    }
  });

  it("still serves BOTH registerLoader overloads after the descriptor install", async () => {
    const { i18n } = createNextI18n({ ...ROUTING });

    i18n.registerLoader({
      en: () => Promise.resolve({ default: { k: "EN" } }),
      de: () => Promise.resolve({ default: { k: "DE" } }),
    });
    await i18n.init();

    expect(i18n.t("k")).toBe("EN");
    await i18n.setLocaleAsync("de");
    expect(i18n.t("k")).toBe("DE");

    const fn = createNextI18n({ ...ROUTING });
    fn.i18n.registerLoader(async (locale, ns) => ({ hi: `hi-${locale}-${ns}` }));
    await fn.i18n.init();
    expect(fn.i18n.t("hi")).toBe("hi-en-default");
  });
});
