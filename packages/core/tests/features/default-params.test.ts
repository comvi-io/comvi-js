import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";

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

describe("defaultParams — the constructor option and setDefaultParams()", () => {
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
    const i18n = createInstance();

    i18n.setDefaultParams({ formality: "formal" });
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

  it("does not expose persistent defaults to post-processor mutations", () => {
    const i18n = createInstance({ formality: "formal" });
    const seen: unknown[] = [];

    i18n.registerPostProcessor((result, _key, _namespace, params) => {
      seen.push(params.formality);
      params.formality = "informal";
      return result;
    });

    expect(i18n.t("review")).toBe("Ihre Bewertung");
    expect(i18n.t("review")).toBe("Ihre Bewertung");
    expect(seen).toEqual(["formal", "formal"]);
    expect(i18n.defaultParams).toEqual({ formality: "formal" });
  });

  it.each(["locale", "ns", "fallback", "raw"])(
    "rejects the reserved call-control key %s in constructor defaults",
    (key) => {
      expect(
        () =>
          new I18n({
            locale: "en",
            defaultParams: { [key]: "invalid" } as never,
          }),
      ).toThrow(/defaultParams.*locale.*ns.*fallback.*raw/i);
    },
  );

  it("rejects reserved call-control keys in runtime replacements", () => {
    const i18n = createInstance();

    expect(() => i18n.setDefaultParams({ locale: "de" } as never)).toThrow(
      /defaultParams.*locale.*ns.*fallback.*raw/i,
    );
  });

  it.each([null, undefined])("rejects nullish constructor defaults (%s)", (value) => {
    expect(
      () =>
        new I18n({
          locale: "en",
          defaultParams: { formality: value } as never,
        }),
    ).toThrow(/defaultParams.*null.*undefined/i);
  });

  it.each([null, undefined])("rejects nullish runtime defaults (%s)", (value) => {
    const i18n = createInstance();
    expect(() => i18n.setDefaultParams({ formality: value } as never)).toThrow(
      /defaultParams.*null.*undefined/i,
    );
  });

  it("does not allow constructor-guaranteed defaults to be removed", () => {
    const i18n = createInstance({ formality: "formal" });

    expect(() => i18n.setDefaultParams(undefined as never)).toThrow(/formality/);
    expect(() => i18n.setDefaultParams({} as never)).toThrow(/formality/);
    expect(() => i18n.setDefaultParams({ formality: undefined } as never)).toThrow(
      /defaultParams.*null.*undefined/i,
    );

    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("accepts a replacement that keeps every constructor-guaranteed key", () => {
    const i18n = createInstance({ formality: "formal" });

    i18n.setDefaultParams({ formality: "informal" });

    expect(i18n.t("review")).toBe("Deine Bewertung");
  });

  it("accepts extra keys alongside a constructor-guaranteed one", () => {
    const i18n = createInstance({ formality: "formal" });

    i18n.setDefaultParams({ formality: "formal", name: "Ada" });

    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("does not accept an inherited value for a constructor-guaranteed key", () => {
    const i18n = createInstance({ formality: "formal" });
    const inherited = Object.create({ formality: "informal" }) as Record<string, string>;

    expect(() => i18n.setDefaultParams(inherited as never)).toThrow(/formality/);
    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("keeps nested values by reference while protecting the top-level object", () => {
    const segments = ["A"];
    const i18n = new I18n({ locale: "en", defaultParams: { segments } });

    expect(i18n.defaultParams).not.toBe(i18n.defaultParams);
    expect(i18n.defaultParams?.segments).toBe(segments);
  });
});
