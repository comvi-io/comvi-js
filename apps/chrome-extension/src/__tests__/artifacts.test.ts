/**
 * Release-artifact assertions against dist/. Run `pnpm build` first. A local
 * `vitest` run with no dist/ skips; in CI a missing bundle FAILS, because the
 * `pnpm verify` chain (typecheck && build && vitest run) always builds first,
 * so the only way dist/ is absent there is the problem this suite exists for.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPECTED_CONTENT_SCRIPTS } from "../shared/__fixtures__/manifest-content-scripts";

// vitest runs with cwd at the package root.
const DIST = resolve(process.cwd(), "dist");
const hasDist = existsSync(resolve(DIST, "manifest.json"));

const read = (name: string) => readFileSync(resolve(DIST, name), "utf8");

describe.skipIf(!hasDist && !process.env.CI)("built artifacts", () => {
  it("manifest preloads detector and bridge for automatic Comvi detection", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.content_scripts).toEqual(EXPECTED_CONTENT_SCRIPTS);
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

  it.each(["bridge.js", "detector.js", "editor.iife.js"])(
    "%s is self-contained (no ES module syntax)",
    (bundle) => {
      const code = read(bundle);
      expect(code, bundle).not.toMatch(/^import[\s{"']/m);
      expect(code, bundle).not.toMatch(/^export[\s{]/m);
    },
  );

  it("editor bundle contains no API-key configuration channel", () => {
    const editor = read("editor.iife.js");
    expect(editor).not.toContain("comvi-in-context-editor:configure");
  });

  // editor.iife.js is excluded: it retains direct mode for standalone
  // (non-extension) use. Its transport mode never building auth headers is
  // proven by the SDK transport-contract test suite.
  it.each(["bridge.js", "detector.js"])("%s never constructs an Authorization header", (bundle) => {
    expect(read(bundle), bundle).not.toContain("Authorization");
  });
});
