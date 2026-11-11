// @vitest-environment node
/**
 * `withComvi()`, the next.config plugin. Lot 6a removed its 0.7 `config` alias (the config
 * module is the app's own server module now); it keeps the shape of the config it wraps.
 */
import { describe, it, expect } from "vitest";
import type { NextConfig } from "next";
import { withComvi } from "../src/plugin";

describe("withComvi", () => {
  it("returns an object config unchanged, with every option of it", () => {
    const config: NextConfig = { reactStrictMode: true, basePath: "/x" };
    expect(withComvi()(config)).toEqual({ reactStrictMode: true, basePath: "/x" });
    expect(withComvi({})()).toEqual({});
  });

  it("wraps a function config: Next calls it with the phase, sync or async", async () => {
    const fn = (phase: string) => ({ basePath: `/${phase}` });
    const wrapped = withComvi()(fn);
    expect(typeof wrapped).toBe("function");
    await expect(wrapped("phase-production-build", { defaultConfig: {} })).resolves.toEqual({
      basePath: "/phase-production-build",
    });
    const asyncFn = async () => ({ trailingSlash: true });
    await expect(withComvi()(asyncFn)("x", { defaultConfig: {} })).resolves.toEqual({
      trailingSlash: true,
    });
  });
});
