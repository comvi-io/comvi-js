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
  const files = [resolve(PACKAGE_DIR, "manifest.json"), resolve(PACKAGE_DIR, "vite.config.ts")];
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
  // A missing input means this list or the build changed; never skip it silently.
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) throw new Error(`Build inputs not found: ${missing.join(", ")}`);
  return Math.max(...files.map((file) => statSync(file).mtimeMs));
}

const distIsFresh = hasDist && statSync(BUILT_MANIFEST).mtimeMs >= newestSourceMtime();
const skipReason = !hasDist
  ? "no dist/, run pnpm build"
  : !distIsFresh
    ? "dist/ is older than its sources, run pnpm build"
    : undefined;
const runSuite = Boolean(process.env.CI) || skipReason === undefined;

const read = (name: string) => readFileSync(resolve(DIST, name), "utf8");

/** Every file of the release package, icons aside. */
function distFiles(): string[] {
  return readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.parentPath.endsWith("icons"))
    .map((entry) => entry.name)
    .sort();
}

const scripts = () => distFiles().filter((file) => file.endsWith(".js"));

describe.skipIf(!runSuite)(
  skipReason && !runSuite ? `built artifacts (skipped: ${skipReason})` : "built artifacts",
  () => {
    it("dist/manifest.json is not older than any build input", () => {
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

    it.each(["bridge.js", "detector.js"])(
      "%s is self-contained (no ES module syntax)",
      (bundle) => {
        const code = read(bundle);
        expect(code, bundle).not.toMatch(/^import[\s{"']/m);
        expect(code, bundle).not.toMatch(/^export[\s{]/m);
      },
    );

    // Gate E builds record START_SESSION outcomes for race specs; release must not.
    it("worker bundle carries no Gate E test hook", () => {
      expect(read("background.js")).not.toContain("__gateE");
    });

    // The extension carries no editor: the page's own Comvi SDK loads it.
    it("dist carries no editor bundle", () => {
      expect(distFiles().filter((file) => /editor|iife/i.test(file))).toEqual([]);
      expect(scripts()).toEqual(expect.arrayContaining(["bridge.js", "detector.js", "popup.js"]));
      for (const file of scripts()) {
        const code = read(file);
        // Marks of the standalone editor build and of its configuration channel.
        expect(code, file).not.toContain("ComviInContextEditor=");
        expect(code, file).not.toContain("comvi-in-context-editor:configure");
        expect(code, file).not.toContain("data-reka-");
      }
    });

    // MV3 remote-code policy: the package neither names a script host nor has
    // the means to load a script from one. The popup's remedy texts are the
    // only place the CDN host appears, and they are prose, not a loader.
    it("dist carries no remote-code loader", () => {
      for (const file of scripts()) {
        const code = read(file);
        expect(code, file).not.toContain("standalone.iife");
        expect(code, file).not.toMatch(/createElement\(\s*["'`]script["'`]/);
        expect(code, file).not.toMatch(/\beval\s*\(|new Function\s*\(|\bimport\s*\(/);
        expect(code, file).not.toMatch(/https?:\/\/[^"'`\s]+\.js\b/);
        if (file !== "popup.js") expect(code, file).not.toContain("jsdelivr");
      }
      expect(read("popup.html")).not.toMatch(/<script[^>]+src=["'](?!popup\.js["'])/);
      expect(read("background.js")).not.toContain("executeScript");
      // The popup re-injects only the two packaged content scripts.
      expect(read("popup.js").match(/files: \[[^\]]*\]/g)).toEqual([
        'files: ["bridge.js"]',
        'files: ["detector.js"]',
      ]);
    });

    it.each(["bridge.js", "detector.js"])(
      "%s never constructs an Authorization header",
      (bundle) => {
        expect(read(bundle), bundle).not.toContain("Authorization");
      },
    );
  },
);
