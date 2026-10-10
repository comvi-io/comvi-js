/**
 * `@comvi/react` never activates ambient tag syntax — proved against the BUILT
 * artifacts, in a fresh node process.
 *
 * Why not an ordinary vitest case: ambient registration is module-global state
 * installed by importing `@comvi/core/tags`. Vitest externalizes `@comvi/core*`
 * to native `import()`, and that module registry is shared by every test file
 * in a worker — so a sibling file that touched the tags entry would leave the
 * grammar registered and the assertion would pass (or fail) for reasons that
 * have nothing to do with this package. `tests/dist/native-esm-rich-text.mjs`
 * therefore runs standalone under plain node, with `@comvi/react` resolved the
 * way a consumer resolves it: package exports → dist.
 *
 * Requires fresh builds — CI runs `pnpm --filter @comvi/core build` and
 * `pnpm --filter @comvi/react build` before the tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "../..");
const DIST = path.join(PKG_ROOT, "dist");
const CORE_DIST = path.resolve(PKG_ROOT, "../core/dist");
const FIXTURE = path.join(HERE, "native-esm-rich-text.mjs");

const ENTRY = path.join(DIST, "comvi-react.js");
const T_CHUNK = path.join(DIST, "chunks", "comvi-react-T.js");

beforeAll(() => {
  if (!fs.existsSync(ENTRY)) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/react build` before the tests");
  }
  if (!fs.existsSync(path.join(CORE_DIST, "comvi-core-rich-text.js"))) {
    throw new Error(
      "@comvi/core dist is missing or predates the rich-text seam — run `pnpm --filter @comvi/core build`",
    );
  }
});

describe("@comvi/react dist: native ESM, no ambient tag registration", () => {
  it("imports the root, renders <T>, and leaves string-API tag markup literal", () => {
    const stdout = execFileSync(process.execPath, [FIXTURE], {
      cwd: PKG_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(stdout).toContain("REACT_NATIVE_ESM_RICH_TEXT_OK");
  });

  it("names the PURE core seam and never the side-effectful tags entry", () => {
    // The specifier-level claim behind the runtime one. Both files are checked
    // because `<T>` is pinned into its own chunk: the entry must not name the
    // tags subpath either, or importing the root would register on its own.
    const files = [ENTRY, T_CHUNK];
    for (const file of files) {
      expect(fs.existsSync(file), `${path.relative(PKG_ROOT, file)} must exist`).toBe(true);
      const code = fs.readFileSync(file, "utf8");
      expect(code, `${path.relative(PKG_ROOT, file)} must not name @comvi/core/tags`).not.toContain(
        "@comvi/core/tags",
      );
    }

    expect(fs.readFileSync(T_CHUNK, "utf8")).toContain("@comvi/core/rich-text");
  });
});
