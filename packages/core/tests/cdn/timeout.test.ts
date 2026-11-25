/**
 * The loader's timeout against a `fetch` transport that never answers, however the transport
 * treats its signal: it ignores it, listens with `addEventListener`, or assigns its `onabort`
 * (B17: the loader settled through that same property, so a transport that set it replaced
 * the loader's handler and the load hung past its timeout). Fake timers throughout: nothing
 * waits on real time.
 *
 * Timer and listeners: the timer is cleared when the request settles (success or failure),
 * fires once at the timeout, and after a caller's abort stays armed until the timeout, where
 * it does nothing (`cdn.ts`). The listener on the caller's signal is never removed (bytes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdn, createCatalogStore } from "../../src/cdn";
import { flush, make } from "../instance/helpers";

const EN = { hi: "Hello" };
const MSG = (u: string) => `[@comvi/core/cdn] timeout 50 ms: ${u}`;
const URL_EN = "https://cdn.example/en.json";

/**
 * A `fetch` double whose requests never answer, treating their signal by `how`; with `again`,
 * a URL's second request answers `EN`. `signals` keeps every request's signal.
 */
const transport = (how: (s: AbortSignal) => void, again = false) => {
  const signals: AbortSignal[] = [];
  const urls: string[] = [];
  const f = vi.fn((u: string | URL | Request, i?: RequestInit) => {
    const seen = urls.includes(String(u));
    urls.push(String(u));
    signals.push(i!.signal!);
    // A plain response object: its body settles in microtasks, so `flush()` sees it land.
    if (again && seen)
      return Promise.resolve({ ok: true, status: 200, json: async () => EN } as Response);
    return new Promise<Response>(() => how(i!.signal!));
  });
  return { f: f as unknown as typeof fetch, signals, urls };
};

const settled = new WeakMap<Promise<unknown>, { r: unknown }>();
/** Records how `p` settles from now on (a rejection is handled at once). */
const track = <T extends Promise<unknown>>(p: T): T => {
  const x = { r: "pending" as unknown };
  settled.set(p, x);
  p.then(
    (v) => (x.r = ["resolved", v]),
    (e) => (x.r = ["rejected", e instanceof Error ? e.message : e]),
  );
  return p;
};
/** What `p` has settled with once queued microtasks ran; `pending` if nothing. */
const outcome = async (p: Promise<unknown>) => {
  if (!settled.has(p)) track(p);
  await flush();
  return settled.get(p)!.r;
};

const sig = () => new AbortController().signal;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ["ignores the signal", () => {}],
  ["listens with addEventListener", (s: AbortSignal) => s.addEventListener("abort", () => {})],
  [
    "assigns signal.onabort",
    (s: AbortSignal) => {
      s.onabort = () => {};
    },
  ],
])("a fetch transport that %s and never answers", (_name, how) => {
  it("the loader rejects with the timeout error at the timeout; the request's signal aborts with it, no timer is left", async () => {
    const { f, signals } = transport(how);
    const p = track(cdn("https://cdn.example", { fetch: f, timeout: 50 })("en", "default", sig()));
    await vi.advanceTimersByTimeAsync(49);
    expect(await outcome(p)).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome(p)).toEqual(["rejected", MSG(URL_EN)]);
    expect(signals[0].reason).toMatchObject({ message: MSG(URL_EN) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the fallback answers a timed-out load", async () => {
    const { f } = transport(how);
    const p = track(
      cdn("https://cdn.example", {
        fetch: f,
        timeout: 50,
        fallback: { en: () => ({ a: "fallback" }) },
      })("en", "default", sig()),
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome(p)).toEqual(["resolved", { a: "fallback" }]);
  });

  it("an instance: `ready` resolves and onError reports load_failed with the timeout; `setLocale()` of the locale asks again and loads", async () => {
    const { f, signals } = transport(how, true);
    const { i18n, errors } = make({
      locale: "en",
      loader: cdn("https://cdn.example", { fetch: f, timeout: 50 }),
    });
    const ready = track(i18n.ready);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome(ready)).toEqual(["resolved", undefined]);
    expect(errors).toEqual([
      expect.objectContaining({
        code: "load_failed",
        locale: "en",
        ns: "default",
        cause: expect.objectContaining({ message: MSG(URL_EN) }),
      }),
    ]);
    expect(i18n.t("hi")).toBe("hi");
    // The documented retry: a switch asks the target's failed loads again.
    expect(await outcome(i18n.setLocale("en"))).toEqual(["resolved", undefined]);
    expect(signals).toHaveLength(2);
    expect(i18n.t("hi")).toBe("Hello");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an instance: load(ns) rejects with the timeout; load(ns) again (the explicit retry) loads", async () => {
    const { f, urls } = transport(how, true);
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { m: "x" } },
      loader: cdn("https://cdn.example", { fetch: f, timeout: 50 }),
    });
    const p = track(i18n.load("extra"));
    await vi.advanceTimersByTimeAsync(50);
    const u = "https://cdn.example/extra/en.json";
    expect(await outcome(p)).toEqual(["rejected", MSG(u)]);
    expect(errors.filter((e) => e.ns == "extra")).toEqual([
      expect.objectContaining({ code: "load_failed", locale: "en", ns: "extra" }),
    ]);
    expect(await outcome(i18n.load("extra"))).toEqual(["resolved", undefined]);
    expect(urls.filter((x) => x == u)).toHaveLength(2);
    expect(i18n.t("hi", { ns: "extra" })).toBe("Hello");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the caller's abort before the timeout rejects with an AbortError; the timer then fires once and changes nothing", async () => {
    const { f, signals } = transport(how);
    const a = new AbortController();
    const p = track(
      cdn("https://cdn.example", { fetch: f, timeout: 50 })("en", "default", a.signal),
    );
    await vi.advanceTimersByTimeAsync(10);
    a.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0].reason).toMatchObject({ name: "AbortError" });
    // Armed until the timeout (documented in cdn.ts), then gone; the abort stands.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(40);
    expect(vi.getTimerCount()).toBe(0);
    expect(signals[0].reason).toMatchObject({ name: "AbortError" });
  });

  it("an instance destroyed before the timeout: load(ns) resolves (B1), nothing is reported at the timeout", async () => {
    const { f, signals } = transport(how);
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { m: "x" } },
      loader: cdn("https://cdn.example", { fetch: f, timeout: 50 }),
    });
    const p = track(i18n.load("extra"));
    i18n.destroy();
    expect(await outcome(p)).toEqual(["resolved", undefined]);
    expect(signals.every((s) => s.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(errors).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("timeout, then destroy(): load(ns) has rejected with the timeout; destroy() reports nothing more", async () => {
    const { f } = transport(how);
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { m: "x" } },
      loader: cdn("https://cdn.example", { fetch: f, timeout: 50 }),
    });
    const p = track(i18n.load("extra"));
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome(p)).toEqual(["rejected", MSG("https://cdn.example/extra/en.json")]);
    const n = errors.length;
    i18n.destroy();
    await flush();
    expect(errors).toHaveLength(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a switch superseded during a hanging request resolves; the newer one rejects with the timeout and keeps the locale", async () => {
    const { f, signals, urls } = transport(how);
    const { i18n } = make({
      locale: "en",
      messages: { en: { hi: "Hi" } },
      loader: cdn("https://cdn.example", { fetch: f, timeout: 50 }),
    });
    const de = track(i18n.setLocale("de"));
    await vi.advanceTimersByTimeAsync(10);
    const fr = track(i18n.setLocale("fr"));
    expect(await outcome(de)).toEqual(["resolved", undefined]);
    expect(signals[urls.indexOf("https://cdn.example/de.json")].reason).toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome(fr)).toEqual(["rejected", MSG("https://cdn.example/fr.json")]);
    expect(i18n.locale).toBe("en");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a shared store request: one instance's destroy() does not abort it; the other instance gets the timeout", async () => {
    const { f, signals } = transport(how);
    const loader = cdn("https://cdn.example", {
      fetch: f,
      timeout: 50,
      store: createCatalogStore(),
    });
    const one = make({ locale: "en", loader });
    const two = make({ locale: "en", loader });
    const r1 = track(one.i18n.ready);
    const r2 = track(two.i18n.ready);
    one.i18n.destroy();
    expect(await outcome(r1)).toEqual(["resolved", undefined]);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome(r2)).toEqual(["resolved", undefined]);
    expect(signals[0].reason).toMatchObject({ message: MSG(URL_EN) });
    expect(two.errors).toEqual([
      expect.objectContaining({
        code: "load_failed",
        cause: expect.objectContaining({ message: MSG(URL_EN) }),
      }),
    ]);
    expect(one.errors).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a shared store request: a caller's abort reaches no one; every caller rejects with the timeout", async () => {
    const { f, signals } = transport(how);
    const load = cdn("https://cdn.example", { fetch: f, timeout: 50, store: createCatalogStore() });
    const a = new AbortController();
    const first = track(load("en", "default", a.signal));
    const second = track(load("en", "default", sig()));
    a.abort();
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect([await outcome(first), await outcome(second)]).toEqual([
      ["rejected", MSG(URL_EN)],
      ["rejected", MSG(URL_EN)],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("a request that answers clears its timer", async () => {
  const { f, urls } = transport(() => {}, true);
  urls.push(URL_EN);
  const p = track(cdn("https://cdn.example", { fetch: f, timeout: 50 })("en", "default", sig()));
  expect(await outcome(p)).toEqual(["resolved", EN]);
  expect(vi.getTimerCount()).toBe(0);
});
