/**
 * Lot 4c (owner brief 29.10, R3-26): reading, loading and holding a namespace; `isReady` and
 * `isLoading` as core predicates; consumer accounting; `setLocale()` against the active set;
 * the handover accounting; the development diagnostic of an idle read. The contract is in
 * `.lot1-pending-tests.md` ("Lot 4c contract"); the bindings run the same cases through
 * components (`packages/react/tests/namespaces-4c.test.tsx`, `packages/vue/tests/namespaces-4c.test.ts`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, type I18n } from "../../src/instance";
import { acquire, available, coming, core, handover, state } from "../../src/internal";
import { flush, make, manualLoader, tableLoader } from "./helpers";

/** Lets the development diagnostic's timer run (it re-checks after the render's task). */
const tick = () => new Promise((y) => setTimeout(y));

/** `[isReady, isLoading]` of `ns` in the instance's published state. */
const rl = (i18n: I18n, ns = "default") => [
  available(i18n, state(i18n), ns),
  coming(i18n, state(i18n), ns),
];

describe("isReady / isLoading — the four rows of the table (brief §2)", () => {
  it("first load, no catalog: not ready, loading", () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "uk", loader: l.load });
    expect(rl(i18n)).toEqual([false, true]);
  });

  it("a catalog is in place: ready, not loading — an empty one too", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "uk", loader: l.load });
    await l.answer("uk:default", {});
    expect(rl(i18n)).toEqual([true, false]);
  });

  it("a usable catalog while a load is in flight: ready and loading", () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: { title: "Account" } },
      loader: l.load,
    });
    expect(l.requested).toEqual(["uk:default"]);
    expect(rl(i18n)).toEqual([true, true]);
  });

  it("no catalog, the load failed: neither (no endless loading)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "uk", loader: l.load });
    await l.fail("uk:default");
    expect(rl(i18n)).toEqual([false, false]);
  });

  it("no catalog, no load planned (no loader): neither", () => {
    const { i18n } = make({ locale: "uk", messages: { en: { title: "Account" } } });
    expect(rl(i18n)).toEqual([false, false]);
  });
});

describe("isReady — which catalogs count (brief §2)", () => {
  it("a catalog of a locale outside the chain does not count (owner's review of e5a3788d)", () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "uk", messages: { en: { title: "Account" } }, loader: l.load });
    expect(rl(i18n)).toEqual([false, true]);
    expect(i18n.t("title")).toBe("title");
  });

  it("an allowed fallback locale's catalog counts", () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: { title: "Account" } },
      loader: l.load,
    });
    expect(available(i18n, state(i18n), "default")).toBe(true);
    expect(i18n.t("title")).toBe("Account");
  });

  it("a parent locale's catalog counts (pt-BR → pt)", () => {
    const { i18n } = make({ locale: "pt-BR", messages: { pt: { a: "A" } } });
    expect(rl(i18n)).toEqual([true, false]);
  });

  it("inline, cached and handed-over catalogs count; a key missing from one is a plain missing key", () => {
    const { i18n, errors } = make({
      locale: "en",
      catalogs: { shop: { en: {} } },
      loader: manualLoader().load,
    });
    expect(rl(i18n, "shop")).toEqual([true, false]);
    expect(i18n.t("nope", { ns: "shop" })).toBe("nope");
    expect(errors.map((e) => e.code)).toEqual(["missing_key"]);
  });

  it("during a switch it is the locale on screen that counts, not the target", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
    const sw = i18n.setLocale("de");
    expect(i18n.locale).toBe("en");
    expect(rl(i18n)).toEqual([true, true]); // en on screen; de:default in flight
    await l.answer("de:default", { a: "B" });
    await sw;
    expect(rl(i18n)).toEqual([true, false]);
  });
});

describe("reading never loads (brief §1)", () => {
  it("t(), i18n.ns() and a per-call ns start no request", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      messages: { en: { a: "A" } },
      loader: l.load,
      onError: () => {},
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    i18n.t("x", { ns: "shop" });
    i18n.ns("help")("y");
    i18n.t("a", { locale: "de" });
    await tick(); // the diagnostic's re-check runs under the spy
    expect(l.requested).toEqual([]);
    warn.mockRestore();
  });
});

describe("consumer accounting (brief §3)", () => {
  it("two consumers share one flight; releasing one keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const a = acquire(i18n, "shop");
    const b = acquire(i18n, "shop");
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { s: "S" });
    a();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop", { s: "S-de" });
    await sw;
    expect(i18n.t("s", { ns: "shop" })).toBe("S-de");
    b();
  });

  it("the last consumer leaving keeps the cache; the next switch does not load it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const release = acquire(i18n, "shop");
    await l.answer("en:shop", { s: "S" });
    release();
    expect(i18n.t("s", { ns: "shop" })).toBe("S"); // cached
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await l.answer("de:default");
    await sw;
    expect(i18n.locale).toBe("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
  });

  it("a namespace of the `namespaces` option stays active with no consumer", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["default", "nav"], loader: l.load });
    await l.answer("en:default");
    await l.answer("en:nav");
    // A consumer comes and goes: the pin stays.
    acquire(i18n, "nav")();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:default", "en:nav", "de:default", "de:nav"]);
    await l.answer("de:default");
    await l.answer("de:nav");
    await sw;
  });

  it("load(ns) warms the cache without keeping the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const p = i18n.load("shop");
    await l.answer("en:shop", { s: "S" });
    await p;
    expect(rl(i18n, "shop")).toEqual([true, false]);
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await l.answer("de:default");
    await sw;
  });

  it("a release aborts nothing: another consumer's and an explicit load()'s flight goes on", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const release = acquire(i18n, "shop");
    const p = i18n.load("shop");
    release();
    expect(l.signals.get("en:shop")!.aborted).toBe(false);
    await l.answer("en:shop", { s: "S" });
    await expect(p).resolves.toBeUndefined();
    expect(i18n.t("s", { ns: "shop" })).toBe("S");
  });

  it("a remount after a failed load asks for nothing; load(ns) is the explicit retry", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    acquire(i18n, "shop")();
    await l.fail("en:shop");
    for (let k = 0; k < 3; k++) acquire(i18n, "shop")();
    await flush();
    expect(l.requested).toEqual(["en:shop"]);
    expect(rl(i18n, "shop")).toEqual([false, false]);
    const retry = i18n.load("shop");
    expect(rl(i18n, "shop")).toEqual([false, true]);
    await l.answer("en:shop", { s: "S" });
    await retry;
    expect(rl(i18n, "shop")).toEqual([true, false]);
  });

  it("set up, cleaned up, set up again (React Strict Mode): one consumer, counted right", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    acquire(i18n, "shop")();
    const release = acquire(i18n, "shop");
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop");
    release();
    // No consumer left: the switch does not load shop.
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await l.answer("de:default");
    await sw;
  });

  it("counts are per instance (two apps, two requests)", async () => {
    const l = manualLoader();
    const a = make({ locale: "en", messages: { en: {} }, loader: l.load }).i18n;
    const b = make({ locale: "en", messages: { en: {} }, loader: l.load }).i18n;
    acquire(a, "shop");
    await l.answer("en:shop");
    const sb = b.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await l.answer("de:default");
    await sb;
  });
});

describe("setLocale() against the active set (brief §4, §7)", () => {
  it("the key scenario: account → default → switch: only default loads; back on account it loads, loading meanwhile", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    await l.answer("en:default", { home: "Home" });
    // The account page.
    const account = acquire(i18n, "account");
    await l.answer("en:account", { title: "Account" });
    expect(rl(i18n, "account")).toEqual([true, false]);
    // The default page: the account page unmounts.
    account();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default"]);
    await l.answer("de:default", { home: "Start" });
    await sw;
    // Back on the account page: before its hold (render), not ready and loading — not a
    // frame of "unavailable".
    expect(rl(i18n, "account")).toEqual([false, true]);
    acquire(i18n, "account");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default", "de:account"]);
    expect(rl(i18n, "account")).toEqual([false, true]);
    await l.answer("de:account", { title: "Konto" });
    expect(rl(i18n, "account")).toEqual([true, false]);
    expect(i18n.t("title", { ns: "account" })).toBe("Konto");
  });

  it("the key scenario with a fallback locale: back on account it is ready (English) and loading", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", fallbackLocale: "en", loader: l.load });
    await l.answer("en:default");
    const account = acquire(i18n, "account");
    await l.answer("en:account", { title: "Account" });
    account();
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    expect(rl(i18n, "account")).toEqual([true, true]);
    expect(i18n.t("title", { ns: "account" })).toBe("Account");
  });

  it("returning in the same locale renders from the cache: nothing is requested", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    acquire(i18n, "account")();
    await l.answer("en:account", { title: "Account" });
    acquire(i18n, "account");
    await flush();
    expect(l.requested).toEqual(["en:account"]);
    expect(rl(i18n, "account")).toEqual([true, false]);
  });

  it("two fast switches, a failure and the explicit retry, with a consumer", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    acquire(i18n, "shop");
    await l.answer("en:shop", { s: "S-en" });
    const de = i18n.setLocale("de");
    const fr = i18n.setLocale("fr");
    await expect(de).resolves.toBeUndefined();
    expect(l.signals.get("de:shop")!.aborted).toBe(true);
    await l.answer("fr:default");
    await l.fail("fr:shop");
    await fr; // partial failure switches (R4-11)
    expect(i18n.locale).toBe("fr");
    expect(rl(i18n, "shop")).toEqual([false, false]);
    expect(errors.map((e) => [e.code, e.locale, e.ns])).toEqual([["load_failed", "fr", "shop"]]);
    const retry = i18n.load("shop");
    await l.answer("fr:shop", { s: "S-fr" });
    await retry;
    expect(i18n.t("s", { ns: "shop" })).toBe("S-fr");
    expect(rl(i18n, "shop")).toEqual([true, false]);
  });

  it("a namespace released after the call stays in the call's wait", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const release = acquire(i18n, "shop");
    await l.answer("en:shop");
    const sw = i18n.setLocale("de");
    release();
    await l.answer("de:default");
    expect(i18n.locale).toBe("en"); // still waits for de:shop
    await l.answer("de:shop");
    await sw;
    expect(i18n.locale).toBe("de");
  });
});

describe("handover accounting (brief §5)", () => {
  const server = async () => {
    const t = tableLoader({ "en:default": {}, "en:account": { a: "A" }, "en:shop": { s: "S" } });
    const i18n = createI18n({ locale: "en", timeZone: "UTC", loader: t.load, onError: () => {} });
    return { i18n, t };
  };

  it("a released consumer's and a load()'s namespaces are handed over; the hold counts are not read", async () => {
    const { i18n } = await server();
    acquire(i18n, "account")(); // held, then released
    await i18n.load("shop"); // a route's preload
    await i18n.ready;
    const p = handover(i18n);
    expect(Object.keys(p.catalogs).sort()).toEqual(["account", "default", "shop"]);
    expect(p.catalogs.shop).toEqual({ en: { s: "S" } });
  });

  it("a failed pair is null; a pair never loaded is left out (not failed)", async () => {
    const t = tableLoader({ "en:default": {}, "de:default": {} });
    const i18n = createI18n({ locale: "en", timeZone: "UTC", loader: t.load, onError: () => {} });
    await i18n.load("help").catch(() => {});
    expect(handover(i18n).catalogs.help).toEqual({ en: null });
    // A namespace needed in en, then the locale moved on: its de slot was never asked for.
    const r = acquire(i18n, "help");
    r();
    await i18n.setLocale("de");
    expect(handover(i18n).catalogs.help).toBeUndefined();
  });

  it("the browser keeps the handed-over catalogs whatever its consumers do", async () => {
    const { i18n } = await server();
    await i18n.load("account");
    const payload = JSON.parse(JSON.stringify(handover(i18n)));
    const loader = vi.fn(async () => ({}));
    const client = createI18n({ ...payload, loader });
    const r = acquire(client, "account");
    r();
    expect(client.t("a", { ns: "account" })).toBe("A");
    expect(rl(client, "account")).toEqual([true, false]);
    await flush();
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("the hold's bookkeeping (review of lot 4c)", () => {
  it("is counted before anything publishes: a subscriber switching in that publish loads the target for it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    let sw: Promise<void> | undefined;
    const off = i18n.on(() => {
      off();
      sw = i18n.setLocale("de");
    });
    acquire(i18n, "shop");
    expect(l.requested).toEqual(["en:shop", "de:shop"]);
    await l.answer("de:shop", { s: "S-de" });
    await sw;
    expect(i18n.locale).toBe("de");
    expect(rl(i18n, "shop")).toEqual([true, false]);
    expect(i18n.t("s", { ns: "shop" })).toBe("S-de");
  });

  it("a release called twice releases once: another consumer keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const a = acquire(i18n, "shop");
    acquire(i18n, "shop");
    await l.answer("en:shop");
    a();
    a();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop");
    await sw;
  });

  it("the key scenario through load(): a route preload of account, then default, then a switch — only default loads", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    await l.answer("en:default");
    const p = i18n.load("account");
    await l.answer("en:account", { title: "Account" });
    await p;
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default"]);
    await l.answer("de:default");
    await sw;
    // Back on account: not ready, loading until something holds or loads it.
    expect(rl(i18n, "account")).toEqual([false, true]);
    const q = i18n.load("account");
    expect(l.requested.at(-1)).toBe("de:account");
    await l.answer("de:account", { title: "Konto" });
    await q;
    expect(i18n.t("title", { ns: "account" })).toBe("Konto");
  });
});

describe("handover: inline catalogs a passive read rendered (review of lot 4c)", () => {
  it("an inline namespace nothing held is handed over; the client renders it with 0 requests", async () => {
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { account: { en: { title: "Account" }, de: { title: "Konto" } } },
      loader: async () => ({}),
    });
    await server.ready;
    // A React server render: useI18n("account") holds nothing there; it reads the inline one.
    expect(server.t("title", { ns: "account" })).toBe("Account");
    const payload = JSON.parse(JSON.stringify(handover(server)));
    expect(payload.catalogs.account).toEqual({ en: { title: "Account" } });
    const l = manualLoader();
    // The client's options are replaced by the payload's catalogs.
    const client = createI18n({ locale: "en", catalogs: {}, loader: l.load, ...payload });
    expect(rl(client, "account")).toEqual([true, false]);
    acquire(client, "account");
    await flush();
    expect(l.requested).toEqual([]);
    expect(client.t("title", { ns: "account" })).toBe("Account");
  });
});

describe("development: reading a namespace nothing loads (brief §6)", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  afterEach(() => warn.mockRestore());
  const spy = () => (warn = vi.spyOn(console, "warn").mockImplementation(() => {}));

  it("warns once per instance and namespace, naming the fixes", async () => {
    spy();
    const l = manualLoader();
    const a = make({ locale: "en", messages: { en: {} }, loader: l.load }).i18n;
    const b = make({ locale: "en", messages: { en: {} }, loader: l.load }).i18n;
    a.t("x", { ns: "shop" });
    a.t("y", { ns: "shop" });
    a.ns("shop")("z");
    b.t("x", { ns: "shop" });
    await tick();
    a.t("w", { ns: "shop" });
    await tick();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('"shop"');
    expect(String(warn.mock.calls[0][0])).toContain('useI18n("shop")');
    expect(String(warn.mock.calls[0][0])).toContain('i18n.load("shop")');
  });

  it("does not warn for inline, cached or handed-over catalogs, a load in flight, a held namespace or a failed load", async () => {
    spy();
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      messages: { en: {} },
      catalogs: { inline: { en: {} }, gone: { en: null }, kept: { fr: {} } },
      loader: l.load,
    });
    i18n.t("x", { ns: "inline" });
    i18n.t("x", { ns: "gone" }); // failed on the server: a known result
    const p = i18n.load("warm");
    i18n.t("x", { ns: "warm" }); // in flight
    await l.answer("en:warm");
    await p;
    i18n.t("x", { ns: "warm" }); // cached
    acquire(i18n, "held");
    i18n.t("x", { ns: "held" });
    await l.fail("en:held");
    i18n.t("x", { ns: "held" });
    i18n.load("bad").catch(() => {});
    await l.fail("en:bad");
    i18n.t("x", { ns: "bad" }); // failed: no warning, and never "nothing loads it"
    // Held, its flight aborted by a pending switch whose target needs nothing of it: no
    // catalog of the locale on screen, nothing in flight, nothing failed — but a consumer.
    acquire(i18n, "kept");
    void i18n.setLocale("fr");
    expect(l.signals.get("en:kept")!.aborted).toBe(true);
    i18n.t("x", { ns: "kept" });
    await tick();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a read before the hold of the same task does not warn: <T ns> beside useI18n(ns) (review of lot 4c)", async () => {
    spy();
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    // The render reads (the exported <T ns="account">), the commit or mount holds after it.
    i18n.t("title", { ns: "account" });
    acquire(i18n, "account");
    await tick();
    expect(warn).not.toHaveBeenCalled();
    // A read nothing follows still warns, after the task — and once only.
    i18n.t("x", { ns: "idle" });
    expect(warn).not.toHaveBeenCalled();
    await tick();
    i18n.t("y", { ns: "idle" });
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"idle"');
  });

  it("a declared read (useI18n(ns) before its hold) does not warn; no loader, nothing to warn about", async () => {
    spy();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: manualLoader().load });
    // The binding's declared read (the core's `w`): a useI18n(ns), whose hold follows.
    expect(core(i18n).tr(state(i18n), "x", undefined, "shop", undefined, 1)).toBe("x");
    await tick();
    expect(warn).not.toHaveBeenCalled();
    // Without it, the same read warns.
    core(i18n).tr(state(i18n), "x", undefined, "shop");
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockClear();
    const plain = make({ locale: "en", messages: { en: {} } }).i18n;
    plain.t("x", { ns: "shop" });
    await tick();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a declared read covers its own namespace only: a per-call { ns } of another is checked (review of lot 4c)", async () => {
    spy();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: manualLoader().load });
    // useI18n("default").t("title", { ns: "undeclared" })
    core(i18n).tr(state(i18n), "title", { ns: "undeclared" }, "default", undefined, 1);
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"undeclared"');
  });
});

/** The missing_key reports of `errors`, as `key ns locale`. */
const mk = (errors: { code: string; key?: string; ns?: string; locale?: string }[]) =>
  errors.filter((e) => e.code == "missing_key").map((e) => `${e.key} ${e.ns} ${e.locale}`);

describe("missing_key: silent only while a load that could bring the key is coming (owner 30.10)", () => {
  it("a namespace typo through a plain read is reported (nothing loads it)", async () => {
    const { i18n, errors } = make({ locale: "en", loader: tableLoader({ "en:default": {} }).load });
    await i18n.ready;
    expect(i18n.t("title", { ns: "acount" })).toBe("title");
    expect(mk(errors)).toEqual(["title acount en"]);
  });

  it("a released namespace read after a switch is reported for the locale on screen", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    await l.answer("en:default");
    const p = i18n.load("account");
    await l.answer("en:account", { title: "Account" });
    await p;
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    i18n.t("title", { ns: "account" });
    expect(mk(errors)).toEqual(["title account de"]);
  });

  it("a load in flight in the read's chain silences it; one of another locale does not; no replay after the load", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    i18n.t("nope"); // en:default is coming
    expect(mk(errors)).toEqual([]);
    await l.answer("en:default", {});
    expect(mk(errors)).toEqual([]); // the earlier read is not replayed
    const sw = i18n.setLocale("de"); // de:default in flight: another locale's
    i18n.t("nope");
    expect(mk(errors)).toEqual(["nope default en"]);
    await l.answer("de:default");
    await sw;
  });

  it("a declared read (a useI18n(ns) translator before its hold) counts the predicted load of its namespace and the locale on screen only", () => {
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: {} },
      loader: manualLoader().load,
    });
    const tr = (k: string, p?: object) =>
      core(i18n).tr(state(i18n), k, p as never, "shop", undefined, 1);
    tr("title");
    tr("title", { locale: "en" });
    expect(mk(errors)).toEqual([]);
    tr("title", { ns: "other" });
    tr("title", { locale: "fr" });
    // The same read without the declaration: nothing is coming for it.
    core(i18n).tr(state(i18n), "title", undefined, "shop");
    expect(mk(errors)).toEqual(["title other en", "title shop fr", "title shop en"]);
  });

  it("after a failed load a declared read is reported: the prediction does not silence it", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const release = acquire(i18n, "shop");
    await l.fail("en:shop");
    core(i18n).tr(state(i18n), "title", undefined, "shop", undefined, 1);
    expect(mk(errors)).toEqual(["title shop en"]);
    release();
  });
});
