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
