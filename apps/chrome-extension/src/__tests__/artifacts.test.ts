/**
 * Release-artifact assertions against dist/. Run `pnpm build` first.
 *
 * A plain local `vitest run` must not judge whatever dist/ happens to be on
 * disk: with no dist/, or a dist/ older than its sources, the suite is skipped
 * and its title says why. In CI it always runs, because `pnpm verify` and
 * `pnpm zip` build first, so a missing or stale dist/ there is the problem
 * this suite exists to catch (the freshness check below then fails).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXPECTED_CONTENT_SCRIPTS } from "../shared/__fixtures__/manifest-content-scripts";

// vitest runs with cwd at the package root.
const PACKAGE_DIR = process.cwd();
const DIST = resolve(PACKAGE_DIR, "dist");
const BUILT_MANIFEST = resolve(DIST, "manifest.json");
const hasDist = existsSync(BUILT_MANIFEST);

/** Every input the build copies or bundles into dist/. */
function newestSourceMtime(): number {
  const files = [
    resolve(PACKAGE_DIR, "manifest.json"),
    resolve(PACKAGE_DIR, "vite.config.ts"),
    process.env.COMVI_EDITOR_BUNDLE_PATH?.trim() ||
      resolve(PACKAGE_DIR, "../../packages/plugin-in-context-editor/dist/standalone.iife.js"),
  ];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "__fixtures__") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(resolve(PACKAGE_DIR, "src"));
  walk(resolve(PACKAGE_DIR, "public"));
  return Math.max(...files.filter(existsSync).map((file) => statSync(file).mtimeMs));
}

const distIsFresh = hasDist && statSync(BUILT_MANIFEST).mtimeMs >= newestSourceMtime();
const skipReason = !hasDist
  ? "no dist/, run pnpm build"
  : !distIsFresh
    ? "dist/ is older than its sources, run pnpm build"
    : undefined;
const runSuite = Boolean(process.env.CI) || skipReason === undefined;

const read = (name: string) => readFileSync(resolve(DIST, name), "utf8");

describe.skipIf(!runSuite)(
  skipReason && !runSuite ? `built artifacts (skipped: ${skipReason})` : "built artifacts",
  () => {
    it("dist/ was built from the current sources", () => {
      expect(skipReason, "rebuild before checking the release artifacts").toBeUndefined();
    });

    it("manifest preloads detector and bridge for automatic Comvi detection", () => {
      const manifest = JSON.parse(read("manifest.json"));
      expect(manifest.content_scripts).toEqual(EXPECTED_CONTENT_SCRIPTS);
    });

    // Static content_scripts world: "MAIN" needs Chrome 111; older browsers
    // would run the detector in the isolated world.
    it("manifest declares the Chrome floor that MAIN-world content scripts need", () => {
      const manifest = JSON.parse(read("manifest.json"));
      expect(manifest.minimum_chrome_version).toBe("111");
    });

    it("manifest grants exactly one API host permission", () => {
      const manifest = JSON.parse(read("manifest.json"));
      expect(manifest.host_permissions).toHaveLength(1);
      expect(manifest.host_permissions[0]).toMatch(/^https:\/\/[^*]+\/\*$/);
    });

    // `pnpm zip` sets this, so a release package can only carry the production
    // API origin (no test page origin, whatever the build environment was).
    it.runIf(Boolean(process.env.COMVI_EXPECT_API_ORIGIN))(
      "manifest grants only the expected release API origin",
      () => {
        const manifest = JSON.parse(read("manifest.json"));
        expect(manifest.host_permissions).toEqual([`${process.env.COMVI_EXPECT_API_ORIGIN}/*`]);
      },
    );

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
    it.each(["bridge.js", "detector.js"])(
      "%s never constructs an Authorization header",
      (bundle) => {
        expect(read(bundle), bundle).not.toContain("Authorization");
      },
    );
  },
);
