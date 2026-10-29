/**
 * `handover(i18n)` of @comvi/core/internal (design §2.6, R3-21): what a server render gives
 * the browser — the locale, timeZone, the clock, and the catalogs of every active namespace
 * in the locale's chain, in the shape `createI18n({ catalogs })` takes. A browser instance
 * made from it holds those catalogs and asks its loader for none of them.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src";
import { formatRelativeTime } from "../../src/format";
import { activate, coming, handover, live, state } from "../../src/internal";

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
      serverNow: 7,
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

  it("hands over a slot of the chain whose load failed as null: the browser does not ask again", async () => {
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
    expect(payload.catalogs).toEqual({ default: { "pt-BR": null, pt: null, en: { hi: "Hi" } } });
    const loader = vi.fn(async () => ({}));
    const client = createI18n({ fallbackLocale: "en", ...payload, loader });
    await client.ready;
    expect(client.t("hi")).toBe("Hi");
    expect(loader).not.toHaveBeenCalled();
  });

  /** A server in `uk` whose `uk:account` is a 404: it renders `account` from `en`. */
  const failedOnServer = async () => {
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      onError: () => {},
      loader: async (l, n): Promise<Record<string, string>> => {
        if (l == "uk" && n == "account") throw new Error("404 uk:account");
        return n == "account" ? { profile: "Profile" } : { hi: l == "uk" ? "Привіт" : "Hi" };
      },
    });
    // uk:account failed (only the fallback locale has it): load() rejects (lot 4b).
    await expect(server.load("account")).rejects.toThrow("404 uk:account");
    return JSON.parse(JSON.stringify(handover(server)));
  };

  it("hydration does not ask for a slot that failed on the server, even when a binding activates its namespace", async () => {
    const payload = await failedOnServer();
    expect(payload.catalogs.account).toEqual({ uk: null, en: { profile: "Profile" } });
    const loader = vi.fn(async () => ({ profile: "Профіль" }));
    const client = createI18n({ fallbackLocale: "en", ...payload, loader });
    // Not "still coming": the browser renders the fallback the server rendered.
    expect(coming(client, state(client), "account")).toBe(false);
    expect(client.t("profile", { ns: "account" })).toBe("Profile");
    // What a binding's useI18n("account") does after commit.
    await activate(client, "account");
    await client.ready;
    expect(loader).not.toHaveBeenCalled();
    expect(client.t("profile", { ns: "account" })).toBe("Profile");
  });

  it("an explicit load(ns) in the browser asks for a slot that failed on the server once", async () => {
    const payload = await failedOnServer();
    const loader = vi.fn(async () => ({ profile: "Профіль" }));
    const client = createI18n({ fallbackLocale: "en", ...payload, loader });
    await client.load("account");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("uk", "account", expect.anything());
    expect(client.t("profile", { ns: "account" })).toBe("Профіль");
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
      const { serverNow } = handover(i18n);
      expect(serverNow).toBe(1_000_000);
      const client = createI18n({ locale: "en", timeZone: "UTC", serverNow });
      expect(formatRelativeTime(client, 1_000_000 - 30_000)).toBe(rendered);
      // Another instance (another request) reads the clock of its own.
      expect(handover(createI18n({ locale: "en", timeZone: "UTC" })).serverNow).toBe(1_060_000);
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
    expect(handover(i18n).serverNow).toBe(123);
  });

  it("in a browser a handed-over serverNow holds until the app mounts, then the clock runs (lot 4b)", () => {
    vi.stubGlobal("document", {});
    vi.useFakeTimers({ now: 100_000, toFake: ["Date"] });
    try {
      // The server rendered at 40 000; the browser hydrates at 100 000.
      const client = createI18n({ locale: "en", timeZone: "UTC", serverNow: 40_000 });
      expect(formatRelativeTime(client, 10_000)).toBe("30 seconds ago"); // the server's text
      vi.setSystemTime(160_000);
      expect(formatRelativeTime(client, 10_000)).toBe("30 seconds ago"); // still hydrating
      live(client); // a binding's useFormat() after mount
      expect(formatRelativeTime(client, 10_000)).toBe("2 minutes ago"); // 150 s from the browser clock
      vi.setSystemTime(10_000 + 3_600_000);
      expect(formatRelativeTime(client, 10_000)).toBe("1 hour ago");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("an explicit `now` stays fixed after mount; `now` wins over serverNow (lot 4b)", () => {
    vi.stubGlobal("document", {});
    vi.useFakeTimers({ now: 100_000, toFake: ["Date"] });
    try {
      const fixed = createI18n({ locale: "en", now: 40_000, serverNow: 70_000 });
      expect(formatRelativeTime(fixed, 10_000)).toBe("30 seconds ago");
      live(fixed);
      vi.setSystemTime(1_000_000);
      expect(formatRelativeTime(fixed, 10_000)).toBe("30 seconds ago");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("throws without timeZone in development; the error names the option", () => {
    expect(() => handover(createI18n({ locale: "en" }))).toThrow(
      "[@comvi/core] a server render needs the timeZone option",
    );
  });
});
