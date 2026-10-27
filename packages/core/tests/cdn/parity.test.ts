/**
 * URL parity of `cdn()` with 0.7's `buildCdnUrl` (S5: 96/96) — the same identifier rule,
 * the same trailing-slash strip, the root namespace at `<base>/<locale>.json`. Also the
 * request shape: `Accept: application/json` only, a catalog-object check, the caller's
 * abort as AbortError, `next` passed through.
 */
import { describe, expect, it, vi } from "vitest";
import { cdn } from "../../src/cdn";
import { buildCdnUrl } from "./fixtures/build-cdn-url.07";

const bases = ["https://cdn.comvi.io/abc", "https://cdn.comvi.io/abc/"];
const locales = ["en", "pt-BR", "zh_Hant", "en@x", "v1.2", "..", "a/b", ""];
const nss = ["default", "shop", "a.b", "@scope", "..", "x y"];

const urlOf = async (base: string, l: string, n: string): Promise<string> => {
  let seen = "THROW";
  vi.stubGlobal("fetch", async (url: string) => {
    seen = url;
    return { ok: true, json: async () => ({}) };
  });
  try {
    await cdn(base)(l, n, new AbortController().signal);
    return seen;
  } catch {
    return "THROW";
  }
};

describe("cdn() URL parity with 0.7 buildCdnUrl", () => {
  const cases = bases.flatMap((b) => locales.flatMap((l) => nss.map((n) => [b, l, n] as const)));

  it("covers 96 combinations", () => expect(cases).toHaveLength(96));

  it.each(cases)("%s · %j · %j", async (b, l, n) => {
    let today: string;
    try {
      today = buildCdnUrl(b, l, n, "default");
    } catch {
      today = "THROW";
    }
    expect(await urlOf(b, l, n)).toBe(today);
  });
});

describe("cdn() request", () => {
  it("sends Accept: application/json and nothing else, and passes `next` through", async () => {
    const fetch = vi.fn(async (_u: string, _i: RequestInit) => ({
      ok: true,
      json: async () => ({ a: "A" }),
    }));
    vi.stubGlobal("fetch", fetch);
    const next = { revalidate: 60 };
    await expect(
      cdn("https://x/y", { next })("en", "default", new AbortController().signal),
    ).resolves.toEqual({
      a: "A",
    });
    const init = fetch.mock.calls[0][1] as RequestInit & { next?: unknown };
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.next).toBe(next);
  });

  it.each([
    ["an array", ["a"]],
    ["null", null],
    ["a string", "x"],
  ])("rejects %s body as not a catalog", async (_l, body) => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => body }));
    await expect(cdn("https://x")("en", "default", new AbortController().signal)).rejects.toThrow(
      "[@comvi/core/cdn] not a catalog: https://x/en.json",
    );
  });

  it("rejects an HTTP error with the status and URL", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }));
    await expect(
      cdn("https://x", { root: "common" })("en", "shop", new AbortController().signal),
    ).rejects.toThrow("[@comvi/core/cdn] HTTP 404: https://x/shop/en.json");
  });

  it("an abort by the caller rejects with the fetch AbortError, not the timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      (_u: string, i: RequestInit) =>
        new Promise((_y, n) => {
          const no = () => n(new DOMException("aborted", "AbortError"));
          if (i.signal!.aborted) no();
          else i.signal!.addEventListener("abort", no);
        }),
    );
    const a = new AbortController();
    const p = cdn("https://x")("en", "default", a.signal);
    a.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    const b = new AbortController();
    b.abort();
    await expect(cdn("https://x")("en", "default", b.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
