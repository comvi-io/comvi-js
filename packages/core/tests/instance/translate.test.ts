/**
 * t(), ns(), per-call options, defaultParams, has() and the report codes.
 * Ported by meaning from 0.7: translation, translate-param-shapes, translate-parts-assembly,
 * translate-entry-defaults, namespaces, multilingual, empty-translation-fallback (instance
 * half), fallback-param-shared-cache, default-params, audit-default-params (setDefaultParams,
 * R3-3), host-error-reporting and error-stems (onError codes), missing-key-warning,
 * api-contracts (has()).
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { state } from "../../src/internal";
import { make } from "./helpers";

describe("t()", () => {
  const { i18n } = make({
    locale: "en",
    messages: {
      en: {
        flat: "Flat",
        hi: "Hi {name}!",
        two: "{a} to {b}!",
        n: "{n, plural, one {# item} other {# items}}",
        g: "{g, select, female {she} other {they}}",
        rich: "Click <b>here</b>, {name}",
        "a:b": "colon key",
      },
    },
  });

  it("translates flat keys, including keys with a colon (no 'ns:key' spelling)", () => {
    expect(i18n.t("flat")).toBe("Flat");
    expect(i18n.t("a:b")).toBe("colon key");
  });

  it("interpolates params of every primitive shape as String(value) (R3-17)", () => {
    expect(i18n.t("hi", { name: "Ann" })).toBe("Hi Ann!");
    expect(i18n.t("hi", { name: 1234.5 })).toBe("Hi 1234.5!");
    expect(i18n.t("hi", { name: true })).toBe("Hi true!");
    expect(i18n.t("two", { a: 1, b: 2 })).toBe("1 to 2!");
    expect(i18n.t("hi", { name: ["a", "b", "c"] })).toBe("Hi a,b,c!");
  });

  it("prints an id and a year as written, on the fast path and the full path (R3-17)", () => {
    const de = createI18n({
      locale: "de",
      messages: { de: { order: "Bestellung #{orderId}", since: "Seit {year}" } },
    });
    expect(de.t("order", { orderId: 1004 })).toBe("Bestellung #1004");
    expect(de.t("since", { year: 2026 })).toBe("Seit 2026");
    // `locale` per call takes the full path (no primary-record fast path)
    expect(de.t("since", { year: 2026, locale: "de" })).toBe("Seit 2026");
    de.setDefaultParams({ x: 1 });
    expect(de.t("order", { orderId: 1004 })).toBe("Bestellung #1004");
  });

  it("renders ICU plural and select", () => {
    expect(i18n.t("n", { n: 1 })).toBe("1 item");
    expect(i18n.t("n", { n: 3 })).toBe("3 items");
    expect(i18n.t("g", { g: "female" })).toBe("she");
  });

  it("returns rich parts when a tag handler returns a node", () => {
    const node = { node: true };
    expect(i18n.t("rich", { b: () => node, name: "Ann" })).toEqual(["Click ", node, ", Ann"]);
    expect(i18n.t("rich", { name: "Ann" })).toBe("Click here, Ann");
  });

  it("renders a missing parameter as its placeholder", () => {
    expect(make({ locale: "en", messages: { en: { hi: "Hi {name}" } } }).i18n.t("hi")).toBe(
      "Hi {name}",
    );
  });

  it("interpolates CJK text without spaces", () => {
    const { i18n: ja } = make({ locale: "ja", messages: { ja: { w: "{name}さん、ようこそ" } } });
    expect(ja.t("w", { name: "田中" })).toBe("田中さん、ようこそ");
  });
});

describe("missing keys", () => {
  it("render the key and report missing_key with locale and namespace", () => {
    const { i18n, errors } = make({ locale: "de", messages: { de: {} } });
    expect(i18n.t("nope")).toBe("nope");
    expect(errors).toEqual([
      expect.objectContaining({ code: "missing_key", key: "nope", locale: "de", ns: "default" }),
    ]);
  });

  it("`missing` decides what renders", () => {
    const missing = vi.fn((key: string, l: string, n: string) => `[${n}/${l}/${key}]`);
    const { i18n } = make({ locale: "de", missing });
    expect(i18n.t("x", { ns: "shop" })).toBe("[shop/de/x]");
  });

  it("an empty string is untranslated: the chain goes on past it, and an all-empty key is missing", () => {
    const { i18n, errors } = make({
      locale: "de",
      fallbackLocale: ["fr", "en"],
      messages: {
        de: { title: "", both: "", hi: "" },
        fr: { title: "", only: "" },
        en: { title: "Title", hi: "Hi {name}" },
      },
    });
    expect(i18n.t("title")).toBe("Title");
    expect(i18n.t("hi", { name: "Ada" })).toBe("Hi Ada");
    expect(i18n.t("only")).toBe("only");
    expect(errors.map((e) => e.code)).toContain("missing_key");
  });

  it("a message rendering empty for one call is still a translation", () => {
    const { i18n, errors } = make({ locale: "en", messages: { en: { e: "{x}" } } });
    expect(i18n.t("e", { x: "" })).toBe("");
    expect(errors).toEqual([]);
  });

  it("report fallback_used when a fallback LOCALE answers (not the locale's own parent)", () => {
    const { i18n, errors } = make({
      locale: "pt-BR",
      fallbackLocale: "en",
      messages: { pt: { a: "pt" }, en: { b: "en" } },
    });
    expect(i18n.t("a")).toBe("pt");
    expect(errors).toEqual([]);
    expect(i18n.t("b")).toBe("en");
    expect(errors).toEqual([
      expect.objectContaining({ code: "fallback_used", key: "b", locale: "pt-BR", ns: "default" }),
    ]);
  });

  it("are printed once per key in development by the default reporter, with the package name", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });
    i18n.t("gone");
    i18n.t("gone");
    expect(error.mock.calls).toEqual([['[@comvi/core] missing_key "gone" (en)']]);
  });
});

describe("namespaces", () => {
  const { i18n, errors } = make({
    locale: "en",
    catalogs: { default: { en: { a: "A", same: "default" } }, shop: { en: { same: "shop" } } },
  });

  it("per-call `ns` and ns() read another namespace; there is no fall through to default", () => {
    expect(i18n.t("same", { ns: "shop" })).toBe("shop");
    expect(i18n.ns("shop")("same")).toBe("shop");
    expect(i18n.t("a", { ns: "shop" })).toBe("a");
    expect(errors).toContainEqual(expect.objectContaining({ code: "missing_key", ns: "shop" }));
  });
});

describe("per-call locale", () => {
  it("renders in another locale, formatted for it", () => {
    const { i18n } = make({
      locale: "en",
      messages: {
        en: { n: "{n, plural, other {# items}}" },
        de: { n: "{n, plural, other {# Artikel}}" },
      },
    });
    expect(i18n.t("n", { n: 1234, locale: "de" })).toBe("1.234 Artikel");
    expect(i18n.t("n", { n: 1234 })).toBe("1,234 items");
  });

  // R3-1/R4-10: a per-call locale comes from user input. It is checked BEFORE anything
  // renders: Intl would throw a RangeError out of t() on "" or "!!" (1a review).
  it.each(["!!", "x_", "en-", "a/b"])(
    "an invalid per-call locale %j reports invalid_locale and renders in the instance locale",
    (bad) => {
      const { i18n, errors } = make({
        locale: "de",
        messages: { de: { n: "{n, plural, other {# Artikel}} {when}" } },
      });
      expect(() => i18n.t("n", { n: 1234, when: new Date(0), locale: bad })).not.toThrow();
      expect(i18n.t("n", { n: 1234, when: "", locale: bad })).toBe("1.234 Artikel ");
      expect(errors).toContainEqual(
        expect.objectContaining({ code: "invalid_locale", locale: bad }),
      );
    },
  );

  it("an invalid per-call locale is reported once per locale, not on every call", () => {
    const { i18n, errors } = make({ locale: "de", messages: { de: { a: "A" } } });
    for (let k = 0; k < 20; k++) i18n.t("a", { locale: "!!" });
    i18n.t("a", { locale: "??" });
    expect(errors.filter((e) => e.code == "invalid_locale").map((e) => e.locale)).toEqual([
      "!!",
      "??",
    ]);
  });

  it("per-call options are the params' OWN properties: inherited ns and locale are ignored", () => {
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { a: "A" } }, shop: { en: { a: "Shop" }, de: { a: "Laden" } } },
    });
    const p = Object.create({ ns: "shop", locale: "de" });
    expect(i18n.t("a", p)).toBe("A");
    expect(i18n.ns("shop")("a", Object.create({ locale: "de" }))).toBe("Shop");
    expect(i18n.t("a", { ns: "shop", locale: "de" })).toBe("Laden");
  });

  it("an empty per-call locale is no per-call locale", () => {
    const { i18n, errors } = make({
      locale: "de",
      messages: { de: { n: "{n, plural, other {# Artikel}}" } },
    });
    expect(i18n.t("n", { n: 1234, locale: "" })).toBe("1.234 Artikel");
    expect(errors).toEqual([]);
  });

  it("an app-spelled per-call locale reads the catalog under that spelling", () => {
    const { i18n } = make({
      locale: "en",
      messages: { pt_BR: { n: "{n, plural, other {# itens}}" } },
    });
    expect(i18n.t("n", { n: 1234.5, locale: "pt_BR" })).toBe("1.234,5 itens");
  });
});

describe("defaultParams (R3-3)", () => {
  const messages = {
    en: {
      g: "{gender, select, female {She} male {He} other {They}} wrote",
      hi: "Hi {name} from {brand}",
      plain: "Plain",
    },
  };

  it("apply when the call does not pass the param, key by key", () => {
    const { i18n } = make({
      locale: "en",
      messages,
      defaultParams: { gender: "female", brand: "Comvi" },
    });
    expect(i18n.t("g")).toBe("She wrote");
    expect(i18n.t("g", { gender: "male" })).toBe("He wrote");
    expect(i18n.t("hi", { name: "Ann" })).toBe("Hi Ann from Comvi");
    expect(i18n.t("hi", { name: "Ann", brand: "X" })).toBe("Hi Ann from X");
    expect(i18n.t("plain")).toBe("Plain");
  });

  it("setDefaultParams() replaces them and publishes", () => {
    const { i18n } = make({ locale: "en", messages, defaultParams: { brand: "A" } });
    const sub = vi.fn();
    i18n.on(sub);
    i18n.setDefaultParams({ brand: "B" });
    expect(sub).toHaveBeenCalledTimes(1);
    expect(i18n.t("hi", { name: "Ann" })).toBe("Hi Ann from B");
  });

  it("an empty object is none: `defaultParams: {}` and setDefaultParams({}) keep the fast path", () => {
    const { i18n } = make({ locale: "en", messages, defaultParams: {} });
    expect(state(i18n).dp).toBeNull();
    i18n.setDefaultParams({ brand: "B" });
    expect(state(i18n).dp).toEqual({ brand: "B" });
    i18n.setDefaultParams({});
    expect(state(i18n).dp).toBeNull();
    expect(i18n.t("hi", { name: "Ann", brand: "X" })).toBe("Hi Ann from X");
  });

  it("are not mutated by a render, and a call's params object is not either", () => {
    const dp = { brand: "A" };
    const p = { name: "Ann" };
    const { i18n } = make({ locale: "en", messages, defaultParams: dp });
    i18n.t("hi", p);
    expect(dp).toEqual({ brand: "A" });
    expect(p).toEqual({ name: "Ann" });
  });
});

describe("has()", () => {
  const { i18n } = make({
    locale: "de",
    fallbackLocale: "en",
    catalogs: {
      default: { de: { a: "A", empty: "" }, en: { b: "B" } },
      shop: { de: { s: "S" } },
    },
  });

  it("answers along the chain, or for the locale alone with fallback: false", () => {
    expect(i18n.has("a")).toBe(true);
    expect(i18n.has("b")).toBe(true);
    expect(i18n.has("b", { fallback: false })).toBe(false);
    expect(i18n.has("s", { ns: "shop" })).toBe(true);
    expect(i18n.has("b", { locale: "en", fallback: false })).toBe(true);
  });

  it("is false for an empty translation, an unknown key, an empty key and a locale never loaded", () => {
    expect(i18n.has("empty", { fallback: false })).toBe(false);
    expect(i18n.has("zzz")).toBe(false);
    expect(i18n.has("")).toBe(false);
    expect(i18n.has("a", { locale: "fr", fallback: false })).toBe(false);
  });

  it("never reports a key inherited from Object.prototype", () => {
    expect(i18n.has("toString")).toBe(false);
    expect(i18n.t("constructor")).toBe("constructor");
  });
});

describe("onError", () => {
  it("receives every code the instance raises", async () => {
    const codes = new Set<string>();
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { a: "A" }, de: { p: "{x}", s: "{x, number}" } },
      loader: async () => {
        throw new Error("down");
      },
      namespaces: [],
      onError: (e) => codes.add(e.code),
    });
    i18n.t("missing");
    i18n.t("a");
    i18n.t("p");
    i18n.t("s");
    i18n.t("p", { locale: "!!", x: 1 });
    await i18n.load("shop");
    expect([...codes].sort()).toEqual([
      "fallback_used",
      "invalid_locale",
      "load_failed",
      "missing_key",
      "missing_param",
      "syntax",
    ]);
  });
});
