/**
 * Consumer-resolution smoke test (F0b)
 *
 * Validates the published package's exports map by importing through the
 * dist/ path — the same path a consumer gets via the `svelte` / `import`
 * export condition.  Does NOT use the workspace alias (@comvi/svelte →
 * src/index.ts); it goes straight to the compiled artefacts so that a broken
 * build or missing dist file is caught here.
 *
 * Also asserts structural guarantees about dist/T.svelte so that the `svelte`
 * condition advertised in package.json actually delivers a compilable Svelte 5
 * runes component.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// Import through dist/ directly — mirrors what a consumer sees via the
// `import` / `svelte` export condition in package.json.
import * as pkg from "../dist/index.js";

const distDir = resolve(__dirname, "../dist");

describe("exports map smoke (F0b)", () => {
  it("dist/index.js exports T as a function (Svelte component)", () => {
    expect(typeof pkg.T).toBe("function");
  });

  it("dist/index.js exports useI18n as a function", () => {
    expect(typeof pkg.useI18n).toBe("function");
  });

  it("dist/index.js exports createI18n (re-export from @comvi/core)", () => {
    expect(typeof pkg.createI18n).toBe("function");
  });

  it("dist/index.js exports setI18nContext and getI18nContext", () => {
    expect(typeof pkg.setI18nContext).toBe("function");
    expect(typeof pkg.getI18nContext).toBe("function");
  });

  it("dist/index.js exports store factories", () => {
    expect(typeof pkg.createLocaleStore).toBe("function");
    expect(typeof pkg.createLoadingStore).toBe("function");
    expect(typeof pkg.createInitializingStore).toBe("function");
    expect(typeof pkg.createInitializedStore).toBe("function");
    expect(typeof pkg.createCacheRevisionStore).toBe("function");
  });

  it("dist/T.svelte exists (svelte condition resolves to a real file)", () => {
    expect(existsSync(resolve(distDir, "T.svelte"))).toBe(true);
  });

  it("dist/T.svelte contains Svelte 5 runes syntax (not Svelte 4 reactive declarations)", () => {
    const source = readFileSync(resolve(distDir, "T.svelte"), "utf-8");
    // Must use $props() rune — the Svelte 5 way to declare component props
    expect(source).toContain("$props()");
    // Must NOT use Svelte 4 export let syntax for props
    expect(source).not.toContain("export let ");
    // Must NOT use Svelte 4 reactive label ($:) for derived state
    expect(source).not.toContain("\n\t$:");
  });

  it("dist/T.svelte.d.ts exists (svelte-package emits component types)", () => {
    expect(existsSync(resolve(distDir, "T.svelte.d.ts"))).toBe(true);
  });

  it("exports map has no require condition (ESM-only package — no CJS path advertised)", async () => {
    const pkgJson = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
    const dotExport = pkgJson.exports?.["."];
    expect(dotExport).toBeDefined();
    // No `require` condition should be present — this is intentional; any
    // node16 CJS warning from attw is expected-and-correct, not a bug.
    expect(dotExport).not.toHaveProperty("require");
    // `types` condition must come first (before import/default) so TypeScript
    // under moduleResolution:bundler picks it up in the right order.
    const keys = Object.keys(dotExport);
    expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("import"));
  });
});
