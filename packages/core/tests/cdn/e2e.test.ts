/**
 * `createI18n` + `cdn()` end to end against the platform's CDN worker (frozen bundle, run
 * in-process by worker-host.ts) over real HTTP — the S5 suite (12 scenarios) on the
 * shipped code, plus the R4-11 partial failure and the app-spelling rule (R4-10).
 * Timing is never asserted; delays only order events.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cdn, withFallback } from "../../src/cdn";
import type { I18nError } from "../../src/errors";
import { createI18n, type I18nOptions } from "../../src/instance";
import { startWorkerHost } from "./worker-host";

let host: Awaited<ReturnType<typeof startWorkerHost>>;
beforeAll(async () => {
  host = await startWorkerHost();
});
afterAll(() => host.close());
beforeEach(() => host.reset());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A trailing slash on purpose: today's examples carry one.
const base = () => `${host.origin}/dist1/`;
const mk = (o: Partial<I18nOptions> = {}) => {
  const errors: I18nError[] = [];
  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    loader: cdn(base()),
    onError: (e) => errors.push(e),
    ...o,
  });
  return { i18n, errors };
};

describe("cdn() against the CDN v1 worker", () => {
  it("1 · loads the root namespace from <base>/<locale>.json and renders ICU", async () => {
    const { i18n } = mk();
    await i18n.ready;
    expect(i18n.t("hello", { name: "Ann" })).toBe("Hello, Ann!");
    expect(i18n.t("items", { count: 2 })).toBe("2 items");
    expect(host.log()).toEqual(["200 /dist1/en.json"]);
    expect(host.entries()[0].accept).toBe("application/json");
  });

  it("2 · a namespace comes from <base>/<ns>/<locale>.json; concurrent loads share one request", async () => {
    const { i18n } = mk();
    await i18n.ready;
    await Promise.all([i18n.load("shop"), i18n.load("shop"), i18n.load("shop")]);
    expect(i18n.t("cart.title", { ns: "shop" })).toBe("Cart");
    expect(host.log().filter((x) => x.includes("/shop/en.json"))).toHaveLength(1);
  });

  it("3 · switches en → de (root + shop), reuses the en fallback, renders per-call locale", async () => {
    const { i18n } = mk();
    await i18n.ready;
    await i18n.load("shop");
    host.reset();
    await i18n.setLocale("de");
    expect(i18n.locale).toBe("de");
    expect(i18n.t("cart.title", { ns: "shop" })).toBe("Warenkorb");
    expect(i18n.t("only_en")).toBe("English only");
    expect(i18n.t("hello", { name: "A", locale: "en" })).toBe("Hello, A!");
    expect(host.log().sort()).toEqual(["200 /dist1/de.json", "200 /dist1/shop/de.json"]);
  });

  it("4 · partial failure (R4-11): uk has a root but no shop — the switch happens, shop/uk is reported", async () => {
    const { i18n, errors } = mk();
    await i18n.ready;
    await i18n.load("shop");
    await i18n.setLocale("uk");
    expect(i18n.locale).toBe("uk");
    expect(i18n.t("items", { count: 3 })).toBe("3 товари");
    expect(i18n.t("cart.title", { ns: "shop" })).toBe("Cart");
    expect(host.log()).toContain("404 /dist1/shop/uk.json");
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "load_failed", locale: "uk", ns: "shop" }),
    );
  });

  it("5 · a failed pair is not refetched on every read or switch, only when asked for again", async () => {
    const { i18n } = mk();
    await i18n.ready;
    await i18n.load("shop");
    await i18n.setLocale("uk");
    host.reset();
    i18n.t("cart.title", { ns: "shop" });
    await i18n.ready;
    await i18n.setLocale("en");
    expect(host.log()).toEqual([]);
    await i18n.setLocale("uk"); // the target asks for its own pairs again
    await i18n.load("shop"); // so does an explicit load(ns)
    expect(host.log()).toEqual(["404 /dist1/shop/uk.json", "404 /dist1/shop/uk.json"]);
  });

  it("6 · a locale with no catalog at all: setLocale rejects with the HTTP error, the locale stays", async () => {
    const { i18n } = mk();
    await i18n.ready;
    await expect(i18n.setLocale("fr")).rejects.toThrow(/HTTP 404: .*\/dist1\/fr\.json/);
    expect(i18n.locale).toBe("en");
  });

  it("7 · withFallback serves a bundled catalog when the CDN has none", async () => {
    const { i18n } = mk({
      loader: withFallback(cdn(base()), {
        fr: () => Promise.resolve({ default: { hello: "Bonjour, {name}!" } }),
      }),
    });
    await i18n.ready;
    await i18n.setLocale("fr");
    expect(i18n.locale).toBe("fr");
    expect(i18n.t("hello", { name: "A" })).toBe("Bonjour, A!");
    expect(host.log()).toEqual(["200 /dist1/en.json", "404 /dist1/fr.json"]);
  });

  it("8 · a body that is not a catalog (an array) is a load failure", async () => {
    const { i18n, errors } = mk();
    await i18n.ready;
    await i18n.load("bad");
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: "load_failed",
        ns: "bad",
        cause: expect.objectContaining({ message: expect.stringMatching(/not a catalog/) }),
      }),
    );
  });

  it("9 · invalid locales and namespaces are refused before any request", async () => {
    const { i18n, errors } = mk();
    await i18n.ready;
    host.reset();
    for (const l of ["..", "a/b", "", "de?x=1"]) await expect(i18n.setLocale(l)).rejects.toThrow();
    await i18n.load("a/b");
    await i18n.load("..");
    expect(host.log()).toEqual([]);
    expect(errors.filter((e) => e.code === "invalid_locale")).toHaveLength(4);
    expect(errors.filter((e) => e.code === "load_failed").map((e) => e.ns)).toEqual(["a/b", ".."]);
  });

  it("10 · abort mid-flight: en → de (slow) → back to en aborts the de request, nothing lands", async () => {
    const { i18n } = mk();
    await i18n.ready;
    host.delay("dist1/de.json", 400);
    let published = 0;
    const toDe = i18n.setLocale("de");
    await sleep(50);
    i18n.on(() => published++);
    await i18n.setLocale("en");
    await expect(toDe).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
    await sleep(450);
    expect(host.log()).toEqual(["200 /dist1/en.json", "0 /dist1/de.json ABORTED"]);
    expect(i18n.locale).toBe("en");
    expect(published).toBe(1); // the abort's own state (load end); no catalog, no switch
  });

  it("11 · destroy() while a load is in flight aborts it; the switch never lands", async () => {
    const { i18n } = mk();
    await i18n.ready;
    host.delay("dist1/de.json", 400);
    const p = i18n.setLocale("de");
    await sleep(50);
    i18n.destroy();
    await expect(p).resolves.toBeUndefined();
    await sleep(450);
    expect(i18n.locale).toBe("en");
    expect(host.log()).toEqual(["200 /dist1/en.json", "0 /dist1/de.json ABORTED"]);
  });

  it("12 · the timeout covers a slow response; the switch rejects with the timeout error", async () => {
    const { i18n } = mk({ loader: cdn(base(), { timeout: 100 }) });
    await i18n.ready;
    host.delay("dist1/de.json", 400);
    await expect(i18n.setLocale("de")).rejects.toThrow(/timeout 100 ms: .*\/dist1\/de\.json/);
    expect(i18n.locale).toBe("en");
    await sleep(350);
    expect(host.log()).toEqual(["200 /dist1/en.json", "0 /dist1/de.json ABORTED"]);
  });

  it("requests the locale as the app spells it, never the canonical form (iw stays iw)", async () => {
    const { i18n } = mk({ locale: "iw", fallbackLocale: [] });
    await i18n.ready;
    expect(host.log()).toEqual(["404 /dist1/iw.json"]);
  });

  it("`root` is the platform's literal default, whatever namespaces the app activates", async () => {
    const { i18n } = mk({ namespaces: ["default", "shop"] });
    await i18n.ready;
    expect(host.log().sort()).toEqual(["200 /dist1/en.json", "200 /dist1/shop/en.json"]);
  });
});
