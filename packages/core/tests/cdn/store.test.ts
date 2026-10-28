/**
 * The catalog store (design §2.3 item 6, R4-13) and `api()` (§3.2), against an injected
 * `fetch` that answers with real `Response` objects. Nothing is timed: the store's clock
 * is `Date` (faked here), and "the compile cache survived" is COUNTED — the compiled
 * record of the catalog is the same object and holds the same compiled message.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, cdn, createCatalogStore } from "../../src/cdn";
import { recordFor, type Catalog } from "../../src/compile/cache";
import { state } from "../../src/internal";
import { flush, make } from "../instance/helpers";

const EN = { hi: "Hello, {name}!", items: "{count, plural, one {# item} other {# items}}" };

type Answer = { status?: number; body?: unknown; etag?: string } | "hold";

/**
 * A `fetch` double: each request takes the next queued answer (default 200 with `EN`).
 * `held` keeps the resolvers of requests answered with "hold".
 */
const fake = (...answers: Answer[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const held: ((r: Response) => void)[] = [];
  const f = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const a = answers.shift() ?? {};
    if (a === "hold") return new Promise<Response>((y) => held.push(y));
    const { status = 200, body = EN, etag } = a;
    return Promise.resolve(
      new Response(status == 304 ? null : JSON.stringify(body), {
        status,
        headers: etag ? { etag } : {},
      }),
    );
  });
  return { f: f as unknown as typeof fetch, calls, held };
};

const sig = () => new AbortController().signal;
const ok = (body: unknown = EN, etag?: string) =>
  new Response(JSON.stringify(body), { headers: etag ? { etag } : {} });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createCatalogStore()", () => {
  it("dedupe: concurrent loads of one URL share one fetch, and every caller gets the same object", async () => {
    const { f, calls, held } = fake("hold");
    const store = createCatalogStore();
    const load = cdn("https://cdn.example", { fetch: f, store });
    const ps = [load("en", "default", sig()), load("en", "default", sig())];
    const other = cdn("https://cdn.example", { fetch: f, store })("en", "default", sig());
    expect(calls).toHaveLength(1);
    held[0](ok());
    const [a, b, c] = await Promise.all([...ps, other]);
    expect(a).toEqual(EN);
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Within ttl: answered from the store, no request.
    expect(await load("en", "default", sig())).toBe(a);
    expect(calls).toHaveLength(1);
  });

  it("abort ownership: a caller that aborts neither cancels the shared fetch nor loses it for the others", async () => {
    const { f, calls, held } = fake("hold");
    const store = createCatalogStore();
    const load = cdn("https://cdn.example", { fetch: f, store });
    const a = new AbortController();
    const first = load("en", "default", a.signal);
    const second = load("en", "default", sig());
    a.abort();
    expect(calls[0].init.signal!.aborted).toBe(false);
    held[0](ok());
    expect(await second).toEqual(EN);
    // The aborted caller's load lands too (its instance has stopped waiting on its own).
    expect(await first).toBe(await second);
  });

  it("an instance aborted mid-load leaves the shared fetch running; the next instance gets the catalog without a request", async () => {
    const { f, calls, held } = fake("hold");
    const store = createCatalogStore();
    const loader = cdn("https://cdn.example", { fetch: f, store });
    const one = make({ locale: "en", loader });
    one.i18n.destroy();
    expect(calls[0].init.signal!.aborted).toBe(false);
    held[0](ok());
    await flush();
    const two = make({ locale: "en", loader });
    await two.i18n.ready;
    expect(two.i18n.t("hi", { name: "Ann" })).toBe("Hello, Ann!");
    expect(calls).toHaveLength(1);
  });

  it("ETag 304: the revalidated catalog is the SAME object, and its compiled messages are reused (counted)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const { f, calls } = fake(
      { etag: '"v1"' },
      { status: 304 },
      { body: { hi: "Hi!" }, etag: '"v2"' },
    );
    const store = createCatalogStore({ ttl: 1000 });
    const loader = cdn("https://cdn.example", { fetch: f, store });

    const a = make({ locale: "en", loader });
    await a.i18n.ready;
    expect(a.i18n.t("items", { count: 2 })).toBe("2 items");
    const cat = state(a.i18n).c.default.en.m;
    const record = recordFor(cat);
    const compiled = record.items;
    expect(typeof compiled).toBe("function");
    const entries = Object.keys(record).length;

    // Past ttl: answered with the stored object at once, revalidated behind it.
    vi.setSystemTime(1500);
    const b = make({ locale: "en", loader });
    await b.i18n.ready;
    expect(calls).toHaveLength(2);
    expect((calls[1].init.headers as Record<string, string>)["If-None-Match"]).toBe('"v1"');
    await flush();

    // After the 304: a third instance gets the same object; nothing is compiled again.
    const c = make({ locale: "en", loader });
    await c.i18n.ready;
    expect(state(c.i18n).c.default.en.m).toBe(cat);
    expect(state(c.i18n).c.default.en.c).toBe(record);
    expect(c.i18n.t("items", { count: 3 })).toBe("3 items");
    expect(record.items).toBe(compiled);
    expect(Object.keys(record).length).toBe(entries);
    // The 304 counted as fetched now: no request inside the new ttl.
    expect(calls).toHaveLength(2);

    // A 200 replaces it.
    vi.setSystemTime(3000);
    const d = make({ locale: "en", loader });
    await d.i18n.ready;
    await flush();
    const e = make({ locale: "en", loader });
    await e.i18n.ready;
    expect(calls).toHaveLength(3);
    expect(state(e.i18n).c.default.en.m).not.toBe(cat);
    expect(e.i18n.t("hi")).toBe("Hi!");
  });

  it("ttl: no request while the catalog is younger than ttl, one revalidation when it is older", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(10_000);
    const { f, calls } = fake({}, {});
    const store = createCatalogStore({ ttl: 500 });
    const load = cdn("https://cdn.example", { fetch: f, store });
    const first = await load("en", "default", sig());
    vi.setSystemTime(10_499);
    expect(await load("en", "default", sig())).toBe(first);
    expect(calls).toHaveLength(1);
    vi.setSystemTime(10_500);
    // Stale-while-revalidate: the old object now, the new one once the request lands.
    expect(await load("en", "default", sig())).toBe(first);
    expect(await load("en", "default", sig())).toBe(first);
    expect(calls).toHaveLength(2);
    await flush();
    const next = await load("en", "default", sig());
    expect(next).toEqual(EN);
    expect(next).not.toBe(first);
  });

  it("the default ttl is 60 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const { f, calls } = fake({}, {});
    const load = cdn("https://cdn.example", { fetch: f, store: createCatalogStore() });
    await load("en", "default", sig());
    vi.setSystemTime(59_999);
    await load("en", "default", sig());
    expect(calls).toHaveLength(1);
    vi.setSystemTime(60_000);
    await load("en", "default", sig());
    expect(calls).toHaveLength(2);
  });

  it("stale-on-error: a failed revalidation keeps the last good catalog; a failure with nothing stored rejects and is not remembered", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const { f, calls } = fake({ status: 500 }, {}, { status: 503 });
    const store = createCatalogStore({ ttl: 100 });
    const load = cdn("https://cdn.example", { fetch: f, store });
    await expect(load("en", "default", sig())).rejects.toThrow("HTTP 500");
    const good = await load("en", "default", sig());
    expect(calls).toHaveLength(2);
    vi.setSystemTime(200);
    expect(await load("en", "default", sig())).toBe(good);
    await flush();
    expect(calls).toHaveLength(3);
    expect(await load("en", "default", sig())).toBe(good);
    expect(calls).toHaveLength(3);
  });

  it("timeout: a fetch that never answers rejects with the timeout, the fallback answers it", async () => {
    vi.useFakeTimers();
    const { f } = fake("hold", "hold");
    const store = createCatalogStore();
    const p = cdn("https://cdn.example", { fetch: f, store, timeout: 50 })("en", "default", sig());
    const check = expect(p).rejects.toThrow(
      "[@comvi/core/cdn] timeout 50 ms: https://cdn.example/en.json",
    );
    await vi.advanceTimersByTimeAsync(50);
    await check;
    const fb = cdn("https://cdn.example", {
      fetch: f,
      store,
      timeout: 50,
      fallback: { de: () => ({ a: "fallback" }) },
    })("de", "default", sig());
    await vi.advanceTimersByTimeAsync(50);
    await expect(fb).resolves.toEqual({ a: "fallback" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("fetch injection (R4-13d)", () => {
  it("cdn({ fetch }) calls the injected fetch, never the global one — with and without a store", async () => {
    const global = vi.fn();
    vi.stubGlobal("fetch", global);
    const { f, calls } = fake({}, {});
    await cdn("https://cdn.example/", { fetch: f })("en", "shop", sig());
    await cdn("https://cdn.example", { fetch: f, store: createCatalogStore() })(
      "de",
      "default",
      sig(),
    );
    expect(calls.map((c) => c.url)).toEqual([
      "https://cdn.example/shop/en.json",
      "https://cdn.example/de.json",
    ]);
    expect(calls[0].init.headers).toEqual({ Accept: "application/json" });
    expect(global).not.toHaveBeenCalled();
  });
});

describe("api(base, { key })", () => {
  const body = (l: string, n: string, c: Catalog) => ({
    locales: [l],
    namespaces: { [n]: { [l]: c } },
  });

  it("GET <base>/v1/translations?locales&namespaces with Authorization: Bearer <key>; answers the catalog", async () => {
    const { f, calls } = fake({ body: body("pt-BR", "shop", { a: "A" }) });
    const load = api("https://api.example/", { key: "k_test", fetch: f });
    expect(await load("pt-BR", "shop", sig())).toEqual({ a: "A" });
    expect(calls[0].url).toBe("https://api.example/v1/translations?locales=pt-BR&namespaces=shop");
    expect(calls[0].init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer k_test",
    });
  });

  it("a locale or namespace the body does not hold is a load failure; an HTTP error names the URL", async () => {
    const { f } = fake(
      { body: body("en", "default", {}) },
      { status: 401, body: { message: "x" } },
    );
    const load = api("https://api.example", { key: "k", fetch: f });
    await expect(load("de", "default", sig())).rejects.toThrow(
      "[@comvi/core/cdn] not a catalog: https://api.example/v1/translations?locales=de&namespaces=default",
    );
    await expect(load("en", "default", sig())).rejects.toThrow("HTTP 401");
  });

  it("refuses an invalid locale or namespace before any request", async () => {
    const { f, calls } = fake();
    await expect(
      api("https://api.example", { key: "k", fetch: f })("a&b", "x", sig()),
    ).rejects.toThrow("invalid locale or namespace");
    expect(calls).toHaveLength(0);
  });

  it("with a store: the key is part of the store key, so two keys never share a catalog", async () => {
    const { f, calls } = fake(
      { body: body("en", "default", { a: "one" }) },
      { body: body("en", "default", { a: "two" }) },
    );
    const store = createCatalogStore();
    const one = api("https://api.example", { key: "k1", fetch: f, store });
    const two = api("https://api.example", { key: "k2", fetch: f, store });
    expect(await one("en", "default", sig())).toEqual({ a: "one" });
    expect(await two("en", "default", sig())).toEqual({ a: "two" });
    expect(await one("en", "default", sig())).toEqual({ a: "one" });
    expect(calls).toHaveLength(2);
  });

  it("an instance loads through api()", async () => {
    const { f } = fake({ body: body("en", "default", EN) });
    const { i18n } = make({
      locale: "en",
      loader: api("https://api.example", { key: "k", fetch: f }),
    });
    await i18n.ready;
    expect(i18n.t("hi", { name: "Ann" })).toBe("Hello, Ann!");
  });
});
