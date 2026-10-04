/**
 * Catalog ingestion enumerates OWN locale keys only. `for...in` used to walk
 * the prototype chain of the outer `{ locale: catalog }` map, so a map built
 * on a prototype that carries locale entries had those adopted as if the
 * caller had passed them. RC review, non-blocking hardening on core/i18n.ts.
 */
import { describe, expect, it } from "vitest";
import { I18n } from "../helpers/composedHost";

/** `{ fr: … }` as an own key, `{ en: … }` reachable only through the prototype. */
function withInheritedLocale(): Record<string, Record<string, string>> {
  const proto = { en: { greeting: "inherited" } };
  const map = Object.create(proto) as Record<string, Record<string, string>>;
  map.fr = { greeting: "bonjour" };
  return map;
}

describe("a catalog map with an inherited locale entry", () => {
  it("adopts the own locale only, through addMessages", () => {
    const i18n = new I18n({ locale: "fr" });

    i18n.addMessages(withInheritedLocale());

    expect(i18n.getLoadedLocales()).toEqual(["fr"]);
    expect(i18n.hasTranslation("greeting", "en")).toBe(false);
    expect(i18n.t("greeting" as never)).toBe("bonjour");
  });

  it("adopts the own locale only, through the constructor", () => {
    const i18n = new I18n({ locale: "fr", messages: withInheritedLocale() });

    expect(i18n.getLoadedLocales()).toEqual(["fr"]);
    expect(i18n.hasTranslation("greeting", "en")).toBe(false);
  });

  it("announces namespaceLoaded for the own locale only", () => {
    const i18n = new I18n({ locale: "fr" });
    const locales: string[] = [];
    i18n.on("namespaceLoaded", ({ locale }) => void locales.push(locale));

    i18n.addMessages(withInheritedLocale());

    expect(locales).toEqual(["fr"]);
  });
});
