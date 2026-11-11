/**
 * cdn() against a stubbed `fetch`: the orderings a real worker cannot pin down
 * deterministically (size-pass review, 2026-10-27).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdn } from "../../src/cdn";
import { createI18n } from "../../src";
import type { Loader } from "../../src/instance";
import type { CatalogInput } from "../../src";

const stub = (body: unknown) =>
  vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => body }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("cdn() with a stubbed fetch", () => {
  it("a catalog that settled before an abort two microtasks later is returned", async () => {
    stub({ a: "A" });
    const a = new AbortController();
    const p = cdn("https://cdn.example")("en", "default", a.signal);
    queueMicrotask(() => queueMicrotask(() => a.abort()));
    await expect(p).resolves.toEqual({ a: "A" });
  });

  it("a direct call without a signal still loads and leaves no timer armed", async () => {
    vi.useFakeTimers();
    stub({ a: "A" });
    const load = cdn("https://cdn.example") as unknown as (
      l: string,
      n: string,
    ) => ReturnType<Loader>;
    await expect(load("en", "default")).resolves.toEqual({ a: "A" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("cdn() details", () => {
  it("names the bad pair in the error for an invalid locale or namespace", async () => {
    await expect(
      cdn("https://cdn.example")("../x", "default", new AbortController().signal),
    ).rejects.toThrow("[@comvi/core/cdn] invalid locale or namespace: ../x/default");
  });

  it("a locale-only fallback serves the root namespace only", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const f = vi.fn(async () => ({ a: "fallback" }));
    const load = cdn("https://cdn.example", { fallback: { de: f } });
    await expect(load("de", "default", new AbortController().signal)).resolves.toEqual({
      a: "fallback",
    });
    await expect(load("de", "shop", new AbortController().signal)).rejects.toThrow("HTTP 404");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a fallback returns the catalog itself: a flat key `default` and a nested group `default` are data", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const plain = { default: "Default label", a: "A" };
    const nested: CatalogInput = { default: { title: "Головна" }, navigation: { home: "Додому" } };
    const s = new AbortController().signal;
    const load = cdn("https://cdn.example", {
      fallback: { de: async () => plain, uk: async () => nested },
    });
    await expect(load("de", "default", s)).resolves.toBe(plain);
    await expect(load("uk", "default", s)).resolves.toBe(nested);
    const i18n = createI18n({
      locale: "uk",
      loader: cdn("https://cdn.example", { fallback: { uk: () => nested } }),
    });
    await i18n.load("default");
    expect([i18n.t("default.title"), i18n.t("navigation.home")]).toEqual(["Головна", "Додому"]);
  });

  it("a bundled JSON file: `import().then((m) => m.default)` is the catalog", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const i18n = createI18n({
      locale: "uk",
      loader: cdn("https://cdn.example", {
        fallback: { uk: () => import("./fixtures/fallback/uk.json").then((m) => m.default) },
      }),
    });
    await i18n.load("default");
    expect([i18n.t("default.title"), i18n.t("navigation.home")]).toEqual(["Головна", "Додому"]);
  });

  it("without a store the caller's abort cancels the request (its signal aborts)", async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      (_u: string, i: RequestInit) =>
        new Promise((_y, n) => {
          seen = i.signal!;
          i.signal!.addEventListener("abort", () => n(i.signal!.reason));
        }),
    );
    const a = new AbortController();
    const p = cdn("https://cdn.example")("en", "default", a.signal);
    a.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(seen!.aborted).toBe(true);
  });
});
