import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";

const FORMALITY_SELECT = "{formality, select, formal {Ihre Bewertung} other {Deine Bewertung}}";

function createInstance(defaultParams?: Record<string, string>) {
  const i18n = new I18n({ locale: "de", defaultParams });
  i18n.addTranslations({
    de: {
      review: FORMALITY_SELECT,
      greeting: "Hallo {name}!",
      trees:
        "{formality, select, formal {Sie haben} other {du hast}} {count, plural, one {# Baum} other {# Bäume}} gepflanzt",
    },
  });
  return i18n;
}

describe("Instance-level defaultParams", () => {
  it("renders select branches from instance defaults without call-level params", () => {
    const i18n = createInstance({ formality: "formal" });
    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("falls back to the other branch when no default and no call param is given", () => {
    const i18n = createInstance();
    expect(i18n.t("review")).toBe("Deine Bewertung");
  });

  it("lets call-level params override instance defaults key by key", () => {
    const i18n = createInstance({ formality: "formal" });
    expect(i18n.t("review", { formality: "informal" })).toBe("Deine Bewertung");
  });

  it("merges defaults with call-level params for other keys", () => {
    const i18n = createInstance({ formality: "formal" });
    expect(i18n.t("trees", { count: 3 })).toBe("Sie haben 3 Bäume gepflanzt");
  });

  it("applies defaults to simple param interpolation", () => {
    const i18n = createInstance({ name: "Eugene" });
    expect(i18n.t("greeting")).toBe("Hallo Eugene!");
    expect(i18n.t("greeting", { name: "Ivan" })).toBe("Hallo Ivan!");
  });

  it("setDefaultParams replaces defaults and affects subsequent renders", () => {
    const i18n = createInstance({ formality: "formal" });
    expect(i18n.t("review")).toBe("Ihre Bewertung");

    i18n.setDefaultParams({ formality: "informal" });
    expect(i18n.t("review")).toBe("Deine Bewertung");

    i18n.setDefaultParams(undefined);
    expect(i18n.t("review")).toBe("Deine Bewertung");
    expect(i18n.defaultParams).toBeUndefined();
  });

  it("emits configChanged with source defaultParams", () => {
    const i18n = createInstance();
    const listener = vi.fn();
    i18n.on("configChanged", listener);

    i18n.setDefaultParams({ formality: "formal" });

    expect(listener).toHaveBeenCalledWith({ source: "defaultParams" });
    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("copies the params object so later external mutations have no effect", () => {
    const options = { formality: "formal" };
    const i18n = createInstance(options);

    options.formality = "informal";
    expect(i18n.t("review")).toBe("Ihre Bewertung");

    const exposed = i18n.defaultParams!;
    exposed.formality = "informal";
    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });
});
