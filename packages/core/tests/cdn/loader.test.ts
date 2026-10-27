/**
 * cdn() against a stubbed `fetch`: the orderings a real worker cannot pin down
 * deterministically (size-pass review, 2026-10-27).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdn } from "../../src/cdn";
import type { Loader } from "../../src/instance";

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

  it("removes the listener it put on the caller's signal once the load settles", async () => {
    stub({ a: "A" });
    const signal = new AbortController().signal;
    const add = vi.spyOn(signal, "addEventListener");
    const remove = vi.spyOn(signal, "removeEventListener");
    await cdn("https://cdn.example")("en", "default", signal);
    expect(remove.mock.calls).toEqual(add.mock.calls);
    expect(add.mock.calls[0][0]).toBe("abort");
  });
});
