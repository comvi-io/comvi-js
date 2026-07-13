/**
 * Release-artifact assertions against dist/. Run `pnpm build` first — the
 * suite skips when dist/ is absent (e.g. pure unit-test runs) and the
 * `pnpm verify` script chains build + tests so release checks always see a
 * fresh bundle.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// vitest runs with cwd at the package root.
const DIST = resolve(process.cwd(), "dist");
const hasDist = existsSync(resolve(DIST, "manifest.json"));

const read = (name: string) => readFileSync(resolve(DIST, name), "utf8");

describe.skipIf(!hasDist)("built artifacts", () => {
  it("manifest preloads detector and bridge for automatic Comvi detection", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["<all_urls>"],
        js: ["detector.js"],
        world: "MAIN",
        run_at: "document_idle",
      },
      {
        matches: ["<all_urls>"],
        js: ["bridge.js"],
        run_at: "document_start",
      },
    ]);
  });

  it("manifest grants exactly one API host permission", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.host_permissions).toHaveLength(1);
    expect(manifest.host_permissions[0]).toMatch(/^https:\/\/[^*]+\/\*$/);
  });

  it("manifest requests only the expected permissions", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "scripting", "storage"]);
  });

  it("popup has no context-collection toggle", () => {
    const popup = read("popup.html");
    expect(popup).not.toContain("collect-context");
    expect(popup).not.toContain("Send page context to improve translation suggestions");
  });

  it("injected bundles are self-contained (no ES module syntax)", () => {
    for (const bundle of ["bridge.js", "detector.js", "editor.iife.js"]) {
      const code = read(bundle);
      expect(code, bundle).not.toMatch(/^import[\s{"']/m);
      expect(code, bundle).not.toMatch(/^export[\s{]/m);
    }
  });

  it("editor bundle contains no API-key configuration channel", () => {
    const editor = read("editor.iife.js");
    expect(editor).not.toContain("comvi-in-context-editor:configure");
  });

  it("extension page scripts never construct an Authorization header", () => {
    // editor.iife.js is excluded: it retains direct mode for standalone
    // (non-extension) use. Its transport mode never building auth headers is
    // proven by the SDK transport-contract test suite.
    for (const bundle of ["bridge.js", "detector.js"]) {
      expect(read(bundle), bundle).not.toContain("Authorization");
    }
  });
});
