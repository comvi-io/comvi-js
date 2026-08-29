/**
 * Validates the published exports map through the dist/ path — what a consumer
 * gets via the `svelte` / `import` condition — deliberately NOT the workspace
 * alias, so a broken build or a missing dist file is caught here.
 *
 * dist/ is gitignored and CI runs `pnpm test` before `pnpm build`, so a static
 * `import` of dist would fail on a clean checkout and could pass against stale
 * artefacts locally. Hence the `beforeAll` build plus dynamic import.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { beforeAll, describe, expect, it } from "vitest";

const pkgRoot = resolve(__dirname, "..");
const distDir = resolve(pkgRoot, "dist");

let pkg: typeof import("../dist/index.js");

beforeAll(async () => {
  execSync("pnpm build", { cwd: pkgRoot, stdio: "pipe" });
  pkg = await import(pathToFileURL(resolve(distDir, "index.js")).href);
}, 120_000);

/**
 * Code with comments removed, string literals preserved. The seam assertion
 * below matches an import SPECIFIER, and these artifacts are transpiled rather
 * than bundled, so their comments reach `dist` — where they legitimately quote
 * the very specifier the assertion forbids.
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
    expect(source).toContain("$props()");
    expect(source).not.toContain("export let ");
    expect(source).not.toContain("\n\t$:");
  });

  it("dist/T.svelte is preprocessed to plain JS — no TypeScript types/imports", () => {
    // The published .svelte must have its <script> TS-stripped: raw
    // `import type` / type annotations break consumers and bundle analyzers
    // that have no TS-aware Svelte preprocessor.
    const source = readFileSync(resolve(distDir, "T.svelte"), "utf-8");
    expect(source).not.toMatch(/\bimport\s+type\b/);
    // Probes annotations known to exist in the source component.
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
    // No `require` condition, deliberately. The `attw` script ignores the two
    // rules that follow from it:
    //   - cjs-resolves-to-esm: ESM-only package, no CJS path advertised, so a
    //     node16-from-CJS require() correctly resolves to ESM.
    //   - internal-resolution-error: svelte-package emits extensionless .ts
    //     imports and a `./T.svelte` import in dist/*.d.ts that node16 cannot
    //     resolve; Svelte consumers use bundler resolution, the supported
    //     target. Every other attw rule stays enforced.
    expect(dotExport).not.toHaveProperty("require");
    // `types` must come first, before import/default, or TypeScript under
    // moduleResolution:bundler resolves the wrong one.
    const keys = Object.keys(dotExport);
    expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("import"));
  });

  it("publishes exactly ONE entry — the retired /slim subpath is gone", () => {
    // A second entry would be a second name for the same modules — and, in a
    // wrapper whose build does NOT preserve modules, a second context object.
    const pkgJson = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf-8"));

    expect(Object.keys(pkgJson.exports)).toEqual(["."]);
    expect(existsSync(resolve(distDir, "slim.js"))).toBe(false);
    expect(existsSync(resolve(distDir, "slim.d.ts"))).toBe(false);
  });

  it("dist/index.js exports the capability toolkit and the base I18n class", () => {
    // Named re-exports of core's own bindings, so what this asserts through
    // dist is that svelte-package emitted them at all.
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

    // `icuCompiler` is the odd one out on purpose: a `MessageCompiler` record,
    // not a factory. It is what `createI18n({ compiler })` takes, where `icu()`
    // above is the installer.
    expect(typeof surface.icuCompiler).toBe("object");
    expect(surface.icuCompiler).not.toBeNull();
  });

  it("names the PURE core seam and never the side-effectful tags entry", () => {
    // The specifier-level claim, against the BUILT artifacts. Importing
    // `@comvi/core/tags` registers tag syntax AMBIENTLY, so an app that merely
    // renders `<T>` would also start parsing `<tag>` markup in plain
    // string-API `t()`. `svelte-package` preserves modules: `dist/T.svelte` is
    // where the seam is named and `dist/index.js` is what an app imports, so
    // both must be clean or importing the root registers on its own.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is not fussiness: transpiled, not
    // bundled, both artifacts carry the source prose explaining why nothing
    // imports the tags subpath — the literal `import "@comvi/core/tags"`
    // recipe included. A substring check would fail on the very comment that
    // documents the rule.
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
