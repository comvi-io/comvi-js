/**
 * `handover(i18n)` of @comvi/core/internal (design §2.6, R3-21): what a server render gives
 * the browser — the locale, timeZone, the clock, and the catalogs of every active namespace
 * in the locale's chain, in the shape `createI18n({ catalogs })` takes. A browser instance
 * made from it holds those catalogs and asks its loader for none of them.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src";
import { formatRelativeTime } from "../../src/format";
import { handover } from "../../src/internal";

describe("handover()", () => {
  it("hands over the chain (parents, fallback locales) of the active namespaces only", async () => {
    const i18n = createI18n({
      locale: "de-AT",
      fallbackLocale: "en",
      timeZone: "Europe/Vienna",
      now: 7,
      namespaces: ["default", "shop"],
      catalogs: {
        default: { "de-AT": { a: "A" }, de: { b: "B" }, en: { c: "C" }, fr: { d: "D" } },
        shop: { en: { s: "S" } },
        inactive: { de: { x: "X" } },
      },
    });
    expect(handover(i18n)).toEqual({
      locale: "de-AT",
      timeZone: "Europe/Vienna",
      now: 7,
      catalogs: {
        default: { "de-AT": { a: "A" }, de: { b: "B" }, en: { c: "C" } },
        shop: { en: { s: "S" } },
      },
    });
  });

  it("a namespace activated later is handed over; one still loading is not", async () => {
    let answer!: (c: Record<string, string>) => void;
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: { a: "A" } },
      loader: (l, n) =>
        n == "late" ? new Promise((y) => (answer = y)) : Promise.resolve({ [n]: l }),
    });
    await i18n.load("shop");
    void i18n.load("late");
    expect(Object.keys(handover(i18n).catalogs).sort()).toEqual(["default", "shop"]);
    answer({ z: "Z" });
    await i18n.ready;
    expect(handover(i18n).catalogs.late).toEqual({ en: { z: "Z" } });
  });

  it("a browser instance made from it renders the same and loads nothing", async () => {
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      loader: async (l): Promise<Record<string, string>> =>
        l == "uk" ? { hi: "Привіт" } : { hi: "Hi", only: "Only" },
    });
    await server.ready;
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const loader = vi.fn(async () => ({}));
    const client = createI18n({ fallbackLocale: "en", ...payload, loader });
    await client.ready;
    expect([client.t("hi"), client.t("only")]).toEqual(["Привіт", "Only"]);
    expect(loader).not.toHaveBeenCalled();
  });

  it("hands over a slot of the chain whose load failed as an empty catalog: the browser does not ask again", async () => {
    const server = createI18n({
      locale: "pt-BR",
      fallbackLocale: "en",
      timeZone: "UTC",
      onError: () => {},
      loader: async (l): Promise<Record<string, string>> => {
        if (l != "en") throw new Error(`404 ${l}`);
        return { hi: "Hi" };
      },
    });
    await server.ready;
    const payload = JSON.parse(JSON.stringify(handover(server)));
    expect(payload.catalogs).toEqual({ default: { "pt-BR": {}, pt: {}, en: { hi: "Hi" } } });
    const loader = vi.fn(async () => ({}));
    const client = createI18n({ fallbackLocale: "en", ...payload, loader });
    await client.ready;
    expect(client.t("hi")).toBe("Hi");
    expect(loader).not.toHaveBeenCalled();
  });

  it("a slot still loading or never asked for is not handed over (the browser loads it)", async () => {
    let answer!: (c: Record<string, string>) => void;
    const loading = createI18n({
      locale: "de",
      fallbackLocale: "en",
      timeZone: "UTC",
      loader: (l) => (l == "de" ? new Promise((y) => (answer = y)) : Promise.resolve({ a: l })),
    });
    await new Promise((y) => setTimeout(y));
    expect(handover(loading).catalogs).toEqual({ default: { en: { a: "en" } } });
    answer({ a: "de" });
    // No loader: an absent slot is one nobody provided, not a failure.
    const none = createI18n({
      locale: "de",
      fallbackLocale: "en",
      timeZone: "UTC",
      catalogs: { default: { en: { a: "A" } } },
    });
    expect(handover(none).catalogs).toEqual({ default: { en: { a: "A" } } });
  });

  it("on a server one clock per instance: the render's relative time and the handover agree", () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });
    try {
      const i18n = createI18n({ locale: "en", timeZone: "UTC" });
      const rendered = formatRelativeTime(i18n, 1_000_000 - 30_000);
      vi.setSystemTime(1_000_000 + 60_000);
      const { now } = handover(i18n);
      expect(now).toBe(1_000_000);
      const client = createI18n({ locale: "en", timeZone: "UTC", now });
      expect(formatRelativeTime(client, 1_000_000 - 30_000)).toBe(rendered);
      // Another instance (another request) reads the clock of its own.
      expect(handover(createI18n({ locale: "en", timeZone: "UTC" })).now).toBe(1_060_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("in a browser the clock runs: no instance keeps a reading", () => {
    vi.stubGlobal("document", {});
    vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
    try {
      const i18n = createI18n({ locale: "en" });
      expect(formatRelativeTime(i18n, 0)).toBe("10 seconds ago");
      vi.setSystemTime(20_000);
      expect(formatRelativeTime(i18n, 0)).toBe("20 seconds ago");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("the clock defaults to now when the instance has no `now` option", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const i18n = createI18n({ locale: "en", timeZone: "UTC" });
    expect(handover(i18n).now).toBe(123);
  });

  it("throws without timeZone in development; the error names the option", () => {
    expect(() => handover(createI18n({ locale: "en" }))).toThrow(
      "[@comvi/core] a server render needs the timeZone option",
    );
  });
});
