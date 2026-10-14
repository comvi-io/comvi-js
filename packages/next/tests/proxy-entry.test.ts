/**
 * COM-96: `@comvi/next/proxy` is Next.js 16's name for the entry a `proxy.ts`
 * imports. It is the middleware entry re-exported, so the two subpaths hand
 * out one function and an app can switch file conventions without a second
 * copy of the routing code in its bundle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as middleware from "../src/middleware";
import * as proxy from "../src/proxy";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@comvi/next/proxy", () => {
  it("exports exactly what @comvi/next/middleware exports, as the same values", () => {
    expect(Object.keys(proxy).sort()).toEqual(Object.keys(middleware).sort());
    expect(proxy.createMiddleware).toBe(middleware.createMiddleware);
  });

  it("is a package export with the same conditions as ./middleware", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

    expect(manifest.exports["./proxy"]).toEqual({
      types: "./dist/proxy.d.ts",
      development: "./dist/proxy.dev.js",
      default: "./dist/proxy.js",
    });
    expect(Object.keys(manifest.exports["./proxy"])).toEqual(
      Object.keys(manifest.exports["./middleware"]),
    );
  });
});
