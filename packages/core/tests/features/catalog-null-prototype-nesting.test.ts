/**
 * A catalog built with `Object.create(null)` is an ORDINARY catalog that
 * happens to carry no prototype — it can be nested like any other. The
 * normalizer used to read the missing prototype as "already flat" and adopt a
 * nested one whole, which stored an object-valued leaf: `t("nav.home")` then
 * answered with the key and `t("nav")` threw. RC review #4.
 */
import { describe, expect, it, vi } from "vitest";
import { flattenCatalog } from "../../src";
import { I18n } from "../helpers/composedInstance";

/** `{ nav: { home }, title }` with NO prototype at either level. */
function nestedNullProto(): Record<string, unknown> {
  const nav = Object.create(null) as Record<string, string>;
  nav.home = "Home";
  const catalog = Object.create(null) as Record<string, unknown>;
  catalog.nav = nav;
  catalog.title = "Comvi";
  return catalog;
}

describe("a nested null-prototype catalog", () => {
  it("is flattened when it arrives through the constructor", () => {
    const i18n = new I18n({ locale: "en", messages: { en: nestedNullProto() as never } });

    expect(i18n.t("nav.home" as never)).toBe("Home");
    expect(i18n.t("title" as never)).toBe("Comvi");
  });

  it("is flattened when it arrives through addMessages", () => {
    const i18n = new I18n({ locale: "en" });

    i18n.addMessages({ en: nestedNullProto() as never });

    expect(i18n.t("nav.home" as never)).toBe("Home");
  });

  it("is flattened when it arrives as a loader result", async () => {
    const i18n = new I18n({ locale: "en", defaultNs: "common", ns: ["common"] });

    i18n.registerLoader({ "en:common": () => Promise.resolve(nestedNullProto() as never) });
    await i18n.init();

    expect(i18n.t("nav.home" as never)).toBe("Home");
  });

  it("leaves the parent key missing instead of crashing on the object leaf", () => {
    const i18n = new I18n({ locale: "en" });

    i18n.addMessages({ en: nestedNullProto() as never });

    expect(() => i18n.t("nav" as never)).not.toThrow();
    expect(i18n.t("nav" as never)).toBe("nav");
  });

  it("runs a non-string leaf through the flattener's own coercion", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalog = Object.create(null) as Record<string, unknown>;
    catalog.total = 3;
    const i18n = new I18n({ locale: "en" });

    i18n.addMessages({ en: catalog as never });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Translation "total" is not a string'),
    );
    expect(i18n.t("total" as never)).toBe("3");
  });
});

describe("an already-flat null-prototype catalog", () => {
  // The no-copy adoption is a load-bearing perf contract: re-ingesting a
  // normalized catalog (the loader's own output, a previous flatten) must not
  // pay `Object.assign` per key. Pinned by identity, not by behaviour.
  it("is adopted without a copy", () => {
    const flat = Object.create(null) as Record<string, string>;
    flat["nav.home"] = "Home";

    expect(flattenCatalog(flat)).toBe(flat);
  });

  // The public JSDoc names this condition: a null prototype alone is not
  // enough for the by-reference path, the leaves must all be strings.
  it("is the only null-prototype input adopted; a nested one is flattened into a new object", () => {
    const nested = Object.create(null) as Record<string, unknown>;
    nested.nav = { home: "Home" };

    const result = flattenCatalog(nested);

    expect(result).not.toBe(nested);
    expect({ ...result }).toEqual({ "nav.home": "Home" });
  });
});
