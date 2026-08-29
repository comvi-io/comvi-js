/**
 * Consumer-resolution smoke test (F0b)
 *
 * Validates the published package's exports map by importing through the
 * dist/ path — the same path a consumer gets via the `svelte` / `import`
 * export condition.  Does NOT use the workspace alias (@comvi/svelte →
 * src/index.ts); it goes straight to the compiled artefacts so that a broken
 * build or missing dist file is caught here.
 *
 * dist/ is gitignored and CI runs `pnpm test` before `pnpm build`, so a static
 * `import` of dist would fail on a clean checkout and could pass against stale
 * artefacts locally. To stay correct regardless of run order, we build the
 * package in `beforeAll` (fresh dist every run) and load it via dynamic import.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { beforeAll, describe, expect, it } from "vitest";

const pkgRoot = resolve(__dirname, "..");
const distDir = resolve(pkgRoot, "dist");

// Populated in beforeAll, after a fresh build.
let pkg: typeof import("../dist/index.js");

beforeAll(async () => {
  // Build fresh so the smoke check never runs against missing/stale dist.
  execSync("pnpm build", { cwd: pkgRoot, stdio: "pipe" });
  pkg = await import(pathToFileURL(resolve(distDir, "index.js")).href);
}, 120_000);

/**
 * Code with `//` and block comments removed, string literals preserved.
 *
 * The seam assertion below matches an import SPECIFIER, and these artifacts are
 * transpiled rather than bundled, so their comments survive into `dist` — where
 * they legitimately quote the very specifier the assertion forbids.
 */
function stripComments(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    if (char === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
    } else if (char === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
    } else if (char === '"' || char === "'" || char === "`") {
      out += char;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") {
          out += code[i] + (code[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += code[i];
        i++;
        if (code[i - 1] === char) break;
      }
    } else {
      out += char;
      i++;
    }
  }
  return out;
}

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

  it("dist/T.svelte is preprocessed to plain JS — no TypeScript types/imports", () => {
    // The published .svelte must have its <script> TS-stripped (see
    // CHANGELOG 0.2.0): raw `import type` / type annotations break consumers
    // and bundle analyzers without a TS-aware Svelte preprocessor.
    const source = readFileSync(resolve(distDir, "T.svelte"), "utf-8");
    expect(source).not.toMatch(/\bimport\s+type\b/);
    // No `import type {`-style or inline `: Type` annotations should survive.
    // Probe a few annotations known to exist in the source component.
    expect(source).not.toContain(": TranslationParams");
    expect(source).not.toContain("(tag: string");
  });

  it("dist/T.svelte.d.ts exists (svelte-package emits component types)", () => {
    expect(existsSync(resolve(distDir, "T.svelte.d.ts"))).toBe(true);
  });

  it("exports map has no require condition (ESM-only package — no CJS path advertised)", () => {
    const pkgJson = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf-8"));
    const dotExport = pkgJson.exports?.["."];
    expect(dotExport).toBeDefined();
    // No `require` condition should be present — this is intentional. The
    // `attw` script ignores two rules that are structural for this package:
    //   - cjs-resolves-to-esm: ESM-only package, no CJS path advertised, so a
    //     node16-from-CJS require() correctly resolves to ESM (dynamic import).
    //   - internal-resolution-error: svelte-package emits extensionless .ts
    //     imports and a `./T.svelte` import in dist/*.d.ts that node16 cannot
    //     resolve; Svelte consumers use bundler resolution (🟢), the supported
    //     target. All other attw rules remain enforced.
    expect(dotExport).not.toHaveProperty("require");
    // `types` condition must come first (before import/default) so TypeScript
    // under moduleResolution:bundler picks it up in the right order.
    const keys = Object.keys(dotExport);
    expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("import"));
  });

  it("publishes exactly ONE entry — the retired /slim subpath is gone", () => {
    // Single-entry P3: `@comvi/svelte/slim` was the single-package toolkit
    // while the root carried only the bindings. The root IS that toolkit now,
    // so a second entry would be a second name for the same modules — and, in
    // every wrapper whose build does NOT preserve modules, a second context
    // object. It never published, so there is no deprecation debt.
    const pkgJson = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf-8"));

    expect(Object.keys(pkgJson.exports)).toEqual(["."]);
    expect(existsSync(resolve(distDir, "slim.js"))).toBe(false);
    expect(existsSync(resolve(distDir, "slim.d.ts"))).toBe(false);
  });

  it("dist/index.js exports the capability toolkit and the base I18n class", () => {
    // The nine-name toolkit every converged wrapper root carries, plus the
    // class behind `createI18n`. These are named re-exports of core's own
    // bindings, so what this asserts through dist is that svelte-package
    // emitted them at all.
    const surface = pkg as unknown as Record<string, unknown>;

    for (const name of [
      "I18n",
      "icu",
      "loader",
      "attachLoader",
      "flattenCatalog",
      "plugins",
      "attachPlugins",
      "devtools",
      "attachDevtools",
    ]) {
      expect(typeof surface[name], `${name} must be callable`).toBe("function");
    }

    // The ninth name is the odd one out on purpose: `icuCompiler` is a
    // `MessageCompiler` record (`cid`, `makeArgToken`, …), not a factory. It is
    // what `createI18n({ compiler })` takes; `icu()` above is the installer.
    expect(typeof surface.icuCompiler).toBe("object");
    expect(surface.icuCompiler).not.toBeNull();
  });

  it("names the PURE core seam and never the side-effectful tags entry", () => {
    // The specifier-level claim behind the runtime one, made against the BUILT
    // artifacts. Importing `@comvi/core/tags` registers tag syntax AMBIENTLY,
    // so an app that merely renders `<T>` would silently start parsing `<tag>`
    // markup in plain string-API `t()` too. `svelte-package` preserves modules,
    // so `dist/T.svelte` is where the seam is named and `dist/index.js` is what
    // an app imports — both must be clean, or importing the root would register
    // on its own.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is not fussiness: `svelte-package`
    // transpiles rather than bundles, so both artifacts keep the source prose
    // that names the tags subpath in order to explain why nothing imports it —
    // including the literal `import "@comvi/core/tags"` recipe an app is told
    // to use. A plain substring check would fail on the very comment that
    // documents the rule, and a comment-blind regex would too.
    const importsTags = /\b(?:from|import)\s*\(?\s*["']@comvi\/core\/tags["']/;
    const importsRichText = /\b(?:from|import)\s*\(?\s*["']@comvi\/core\/rich-text["']/;

    for (const file of ["index.js", "T.svelte"]) {
      const code = stripComments(readFileSync(resolve(distDir, file), "utf-8"));
      expect(importsTags.test(code), `dist/${file} must not import @comvi/core/tags`).toBe(false);
    }

    const tComponent = stripComments(readFileSync(resolve(distDir, "T.svelte"), "utf-8"));
    expect(importsRichText.test(tComponent), "dist/T.svelte must import the pure seam").toBe(true);
  });
});
