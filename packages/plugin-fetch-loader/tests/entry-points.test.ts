/**
 * The two public entry points. The package root is the CDN path a newcomer
 * meets first (`import { cdnLoader } from "@comvi/plugin-fetch-loader"`);
 * `./api` carries the API-aware `fetchLoader` and the HTTP helpers the
 * in-context editor reuses. 0.5 ships no `./cdn` alias.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as root from "../src/index";
import * as api from "../src/api";

const manifest = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
);

describe("entry points", () => {
  it("publishes exactly the root and ./api", () => {
    expect(Object.keys(manifest.exports)).toEqual([".", "./api"]);
    expect(manifest.exports["./api"]).toEqual({
      types: "./dist/api.d.ts",
      default: "./dist/api.js",
    });
  });

  it("the root is the CDN path alone", () => {
    expect(Object.keys(root).sort()).toEqual(["cdnLoader", "cdnLoaderPlugin"]);
  });

  it("./api carries fetchLoader and the helpers the editor imports", () => {
    expect(api.fetchLoader).toBeTypeOf("function");
    expect(api.fetchLoaderPlugin).toBeTypeOf("function");
    expect(api.fetchApiTranslations).toBeTypeOf("function");
    expect(api.clearProjectInfoCache).toBeTypeOf("function");
    expect(api).not.toHaveProperty("cdnLoader");
  });
});
