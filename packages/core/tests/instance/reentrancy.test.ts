/**
 * Lot 4d re-entrancy (`.lot1-pending-tests.md`, "Lot 4d re-entrancy"): user code that runs
 * synchronously inside a switch, a load or a hold — a subscriber, a loader, an abort
 * listener — may call `setLocale()`. The last call wins from the moment it is made, the
 * flights stay accounted for, and every promise settles.
 */
import { describe, expect, it } from "vitest";
import type { Catalog } from "../../src/compile/cache";
import { acquire, available, coming, state } from "../../src/internal";
import type { I18n } from "../../src/instance";
import { flush, make, manualLoader } from "./helpers";

const rl = (i18n: I18n, ns = "default") => [
  available(i18n, state(i18n), ns),
  coming(i18n, state(i18n), ns),
];

/** Whether `p` settled (it is watched from now on; read it after a flush). */
const watch = (p: Promise<unknown>) => {
  const w = { settled: false };
  const on = () => void (w.settled = true);
  p.then(on, on);
  return w;
};

describe("setLocale() re-entered from user code (lot 4d)", () => {
  it("A · an abort listener and a cleanup notification re-enter: the replacement flight of the same key survives", async () => {
    const m = manualLoader();
    const signals: AbortSignal[] = [];
    let fr: Promise<void> | undefined;
    let en: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: {}, fr: {} }, account: { fr: {} } },
      loader: (l, n, s) => {
        if (l == "en" && n == "account") {
          signals.push(s);
          if (signals.length == 1)
            s.addEventListener("abort", () => void (fr = i18n.setLocale("fr")));
        }
        return m.load(l, n, s);
      },
    });
    acquire(i18n, "account");
    i18n.on(() => {
      if (!en && signals[0]?.aborted) en = i18n.setLocale("en");
    });
    const de = watch(i18n.setLocale("de"));
    await flush();
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    // The replacement is published and `ready` waits for it.
    expect(state(i18n).ld).toHaveLength(1);
    const ready = watch(i18n.ready);
    const latest = watch(en!);
    await flush();
    expect(ready.settled).toBe(false);
    expect(latest.settled).toBe(false);
    await m.answer("en:account", { title: "Account" });
    await flush();
    expect(ready.settled).toBe(true);
    expect(latest.settled).toBe(true);
    expect(de.settled).toBe(true);
    await fr;
    expect(i18n.locale).toBe("en");
    expect(rl(i18n, "account")).toEqual([true, false]);
    expect(state(i18n).ld).toEqual([]);
  });

  it("B · a loader calls setLocale() synchronously: the flight it was started for is registered, aborted and forgotten", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      messages: { en: {}, fr: {} },
      loader: (l, n, s) => {
        if (l == "de") fr = i18n.setLocale("fr");
        return m.load(l, n, s);
      },
    });
    const de = watch(i18n.setLocale("de"));
    // Nothing to load for fr: applied before the outer call returned.
    expect(i18n.locale).toBe("fr");
    expect(m.signals.get("de:default")!.aborted).toBe(true);
    expect(state(i18n).ld).toEqual([]);
    expect(rl(i18n)).toEqual([true, false]);
    const ready = watch(i18n.ready);
    const newer = watch(fr!);
    await flush();
    expect(ready.settled).toBe(true);
    expect(de.settled).toBe(true);
    expect(newer.settled).toBe(true);
  });

  it("C · a failure's recovery publishes and a subscriber switches: the stale call resolves, the newer one applies", async () => {
    const m = manualLoader();
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: {}, fr: {} }, account: { fr: {} } },
      loader: m.load,
    });
    acquire(i18n, "account");
    let fr: Promise<void> | undefined;
    i18n.on(() => {
      if (!fr && m.requested.filter((k) => k == "en:account").length == 2)
        fr = i18n.setLocale("fr");
    });
    const de = i18n.setLocale("de");
    await m.fail("de:default");
    await m.fail("de:account");
    expect(fr).toBeDefined();
    await expect(de).resolves.toBeUndefined();
    await fr;
    expect(i18n.locale).toBe("fr");
    // The recovery's load of the locale left behind went with the switch.
    expect(m.signals.get("en:account")!.aborted).toBe(true);
    expect(state(i18n).ld).toEqual([]);
  });

  it("a failure with recovery and no newer call still rejects (the ordinary path)", async () => {
    const m = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: m.load });
    const de = i18n.setLocale("de");
    await m.fail("de:default", new Error("404 de"));
    await expect(de).rejects.toThrow("404 de");
    expect(i18n.locale).toBe("en");
  });

  it("a deferred nested call, then a newer one: the newer wins from its call, the deferred one never applies or requests", async () => {
    const m = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {}, de: {}, it: {} }, loader: m.load });
    const seen: string[] = [];
    i18n.on(() => seen.push(i18n.locale));
    let fr: Promise<void> | undefined;
    let it_: Promise<void> | undefined;
    i18n.on(() => {
      if (!fr && i18n.locale == "de") {
        fr = i18n.setLocale("fr");
        it_ = i18n.setLocale("it");
      }
    });
    await i18n.setLocale("de");
    expect(i18n.locale).toBe("it");
    expect(seen).not.toContain("fr");
    expect(m.requested).toEqual([]);
    await expect(fr).resolves.toBeUndefined();
    await expect(it_).resolves.toBeUndefined();
  });

  it("a subscriber's switch does not change `locale` inside the subscriber; the next subscriber sees each state in order", async () => {
    const { i18n } = make({ locale: "en", messages: { en: {}, de: {}, fr: {} } });
    const inside: string[] = [];
    const next: string[] = [];
    i18n.on(() => {
      if (i18n.locale == "de") {
        void i18n.setLocale("fr");
        inside.push(i18n.locale);
      }
    });
    i18n.on(() => next.push(i18n.locale));
    await i18n.setLocale("de");
    expect(inside).toEqual(["de"]);
    expect(next).toEqual(["de", "fr"]);
    expect(i18n.locale).toBe("fr");
  });

  it("a subscriber's switch from a landing's publish keeps the same order", async () => {
    const m = manualLoader();
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: {}, fr: {} } },
      namespaces: ["default"],
      loader: m.load,
    });
    const order: string[] = [];
    let fr: Promise<void> | undefined;
    i18n.on(() => {
      if (!fr && m.signals.has("en:shop") && !state(i18n).ld.length) fr = i18n.setLocale("fr");
    });
    i18n.on(() => order.push(`${i18n.locale}:${i18n.has("s", { ns: "shop" })}`));
    const p = i18n.load("shop");
    order.length = 0;
    await m.answer("en:shop", { s: "S" });
    await p;
    await fr;
    expect(order).toEqual(["en:true", "fr:false"]);
  });

  it("an abort listener finds the flight gone from the accounting, the published state and ready", async () => {
    const m = manualLoader();
    const seen: { ld: readonly string[]; pending: boolean }[] = [];
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: {}, de: {} } },
      loader: (l, n, s) => {
        s.addEventListener("abort", () => {
          const ready = watch(i18n.ready);
          seen.push({ ld: state(i18n).ld, pending: !ready.settled });
          settled.push(ready);
        });
        return m.load(l, n, s);
      },
    });
    const settled: { settled: boolean }[] = [];
    const p = i18n.load("account");
    await i18n.setLocale("de");
    expect(seen.map((x) => x.ld)).toEqual([[]]);
    await flush();
    // `ready` read in the listener is the resolved one: nothing is left in flight.
    expect(settled[0]!.settled).toBe(true);
    await p;
  });

  it("the abort settles the wait though the loader ignores its signal; a late landing changes nothing", async () => {
    const m = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {}, fr: {} }, loader: m.load });
    const de = i18n.setLocale("de");
    await i18n.setLocale("fr");
    await expect(de).resolves.toBeUndefined();
    await m.answer("de:default", { late: "L" });
    expect(i18n.has("late", { locale: "de" })).toBe(false);
    expect(state(i18n).ld).toEqual([]);
    expect(i18n.locale).toBe("fr");
  });

  it("destroy() from a subscriber: what is queued settles and starts nothing", async () => {
    const m = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {}, de: {} }, loader: m.load });
    let fr: Promise<void> | undefined;
    let ld: Promise<void> | undefined;
    i18n.on(() => {
      if (!fr && i18n.locale == "de") {
        fr = i18n.setLocale("fr");
        ld = i18n.load("shop");
        i18n.destroy();
      }
    });
    await i18n.setLocale("de");
    await expect(fr).resolves.toBeUndefined();
    await expect(ld).resolves.toBeUndefined();
    expect(m.requested).toEqual([]);
    expect(i18n.locale).toBe("de");
  });

  it("destroy() from an abort listener: the stale switch settles and nothing more loads", async () => {
    const m = manualLoader();
    const { i18n } = make({
      locale: "en",
      messages: { en: {} },
      loader: (l, n, s) => {
        s.addEventListener("abort", () => i18n.destroy());
        return m.load(l, n, s);
      },
    });
    void i18n.load("shop");
    await expect(i18n.setLocale("de")).resolves.toBeUndefined();
    expect(m.requested).toEqual(["en:shop"]);
    expect(i18n.locale).toBe("en");
  });

  it("the guard covers a switch's continuation: after its loads, a subscriber's switch waits for the subscriber too", async () => {
    const m = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {}, fr: {} }, loader: m.load });
    const inside: string[] = [];
    let fr: Promise<void> | undefined;
    i18n.on(() => {
      if (!fr && i18n.locale == "de") {
        fr = i18n.setLocale("fr");
        inside.push(i18n.locale);
      }
    });
    const de = i18n.setLocale("de");
    await m.answer("de:default");
    await de;
    await fr;
    expect(inside).toEqual(["de"]);
    expect(i18n.locale).toBe("fr");
  });

  it("a failed flight's cleanup leaves the newer request of the same key: onError switches away and back", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    let back: Promise<void> | undefined;
    const i18n: I18n = make({
      locale: "en",
      messages: { en: {}, fr: {} },
      loader: m.load,
      onError: (e) => {
        if (e.code == "load_failed" && !back) {
          fr = i18n.setLocale("fr");
          back = i18n.setLocale("de");
        }
      },
    }).i18n;
    const de = i18n.setLocale("de");
    await m.fail("de:default");
    await expect(de).resolves.toBeUndefined();
    await fr;
    expect(m.requested).toEqual(["de:default", "de:default"]);
    expect(state(i18n).ld).toHaveLength(1);
    await m.answer("de:default");
    await back;
    expect(i18n.locale).toBe("de");
    expect(state(i18n).ld).toEqual([]);
  });

  it("the guard covers a continuation's loader start: every flight of a stale target is registered and aborted", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      messages: { en: {}, fr: {} },
      loader: (l, n, s) => {
        if (l == "de" && n == "a") fr = i18n.setLocale("fr");
        return m.load(l, n, s);
      },
    });
    const de = i18n.setLocale("de");
    // Held while the switch waits: they load for en, and for de right after it applies.
    acquire(i18n, "a");
    acquire(i18n, "b");
    await m.answer("de:default");
    await de;
    expect(m.signals.get("de:a")!.aborted).toBe(true);
    expect(m.signals.get("de:b")!.aborted).toBe(true);
    await m.answer("fr:a");
    await m.answer("fr:b");
    await fr;
    expect(i18n.locale).toBe("fr");
    expect(state(i18n).ld).toEqual([]);
  });

  it("a stale prune leaves the rest to the newer switch: a flight in the newer chain goes on", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      fallbackLocale: { fr: ["en"] },
      messages: { en: {}, fr: {} },
      loader: (l, n, s) => {
        if (n == "a") s.addEventListener("abort", () => void (fr = i18n.setLocale("fr")));
        return m.load(l, n, s);
      },
    });
    void i18n.load("a");
    void i18n.load("b");
    void i18n.setLocale("de");
    // de's prune aborted en:a; its listener switched to fr, whose chain keeps en:b.
    expect(m.signals.get("en:a")!.aborted).toBe(true);
    expect(m.signals.get("en:b")!.aborted).toBe(false);
    await fr;
    expect(i18n.locale).toBe("fr");
    await m.answer("en:b");
    expect(state(i18n).ld).toEqual([]);
  });

  it("a loader re-enters through load(): the switch wins, load()'s flight is aborted, the promises settle", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: {}, fr: {} }, account: { fr: {} } },
      loader: (l, n, s) => {
        if (l == "en") fr = i18n.setLocale("fr");
        return m.load(l, n, s);
      },
    });
    const p = watch(i18n.load("account"));
    expect(i18n.locale).toBe("fr");
    expect(m.signals.get("en:account")!.aborted).toBe(true);
    expect(state(i18n).ld).toEqual([]);
    expect(rl(i18n, "account")).toEqual([true, false]);
    await flush();
    expect(p.settled).toBe(true);
    await fr;
  });

  it("a loader re-enters through a hold: the switch wins and the held namespace loads for the new locale", async () => {
    const m = manualLoader();
    let fr: Promise<void> | undefined;
    const { i18n } = make({
      locale: "en",
      messages: { en: {}, fr: {} },
      loader: (l, n, s) => {
        if (l == "en") fr = i18n.setLocale("fr");
        return m.load(l, n, s);
      },
    });
    acquire(i18n, "shop");
    // The held namespace is in the switch's wait: the old locale stays until it lands.
    expect(i18n.locale).toBe("en");
    expect(m.requested).toEqual(["en:shop", "fr:shop"]);
    expect(m.signals.get("en:shop")!.aborted).toBe(true);
    expect(state(i18n).ld).toHaveLength(1);
    await m.answer("fr:shop", { s: "S-fr" } as Catalog);
    await fr;
    expect(i18n.locale).toBe("fr");
    expect(rl(i18n, "shop")).toEqual([true, false]);
    expect(i18n.t("s", { ns: "shop" })).toBe("S-fr");
    expect(state(i18n).ld).toEqual([]);
  });
});
