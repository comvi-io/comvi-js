import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import pkg from "../../package.json";

/**
 * The built standalone bundle, `dist/standalone.iife.js` — the file jsDelivr
 * serves and the `devtools()` editor loader puts on a page.
 *
 * It is built by its own vite invocation (`vite.config.standalone.ts`), which
 * is the only place the version stamp and the compiled stylesheet exist. A
 * src-level run cannot see either: vitest has its own `__VERSION__` define and
 * imports the stylesheet uncompiled. This suite boots the real file.
 *
 * Requires a fresh build: without `dist/` every test here fails, none is
 * skipped.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

interface StandaloneGlobal {
  version: string;
  activate: unknown;
  getStatus: () => { active: boolean; hook: unknown };
}

let bundle: string;

beforeAll(() => {
  bundle = fs.readFileSync(path.join(DIST, "standalone.iife.js"), "utf8");
});

afterEach(() => {
  delete (window as { ComviInContextEditor?: unknown }).ComviInContextEditor;
  delete (window as { __COMVI__?: unknown }).__COMVI__;
});

/**
 * Runs the IIFE as a `<script>` would and hands back the global it declares.
 * Vitest's own `define` leaves `__VERSION__` on the worker's global, where a
 * bundle the build did not stamp would find it — so it is taken away first.
 */
function bootBundle(): StandaloneGlobal {
  vi.stubGlobal("__VERSION__", undefined);
  return new Function(`${bundle}\n;return ComviInContextEditor;`)() as StandaloneGlobal;
}

/** A string holds a stylesheet when it has this many `selector{property:value}` blocks. */
const STYLESHEET_RULES = 20;

/**
 * Every stylesheet the build inlined as a string literal. The file is parsed,
 * and a literal counts by its content: neither a banner the CSS toolchain
 * writes nor the quote the minifier picked is relied on.
 */
function inlinedStylesheets(source: string): string[] {
  const sheets: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) &&
      (node.text.match(/\{[^{}]*:[^{}]*\}/g) ?? []).length >= STYLESHEET_RULES
    ) {
      sheets.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("bundle.js", source, ts.ScriptTarget.Latest, false));
  return sheets;
}

describe("dist/standalone.iife.js", () => {
  it("booted bundle → ComviInContextEditor.version is the package.json version", () => {
    const editor = bootBundle();

    expect(editor.version).toBe(pkg.version);
    expect(window.ComviInContextEditor?.version).toBe(pkg.version);
  });

  it("booted bundle on a page with no i18n and no loader slot → inactive, hook: null", () => {
    const editor = bootBundle();

    expect(editor.getStatus()).toMatchObject({ active: false, hook: null });
  });

  it("bundle text → no `__VERSION__` token is left for the page to resolve", () => {
    expect(bundle).not.toContain("__VERSION__");
  });
});

describe("the stylesheet that reaches CSSStyleSheet.replaceSync()", () => {
  it("standalone bundle → inlines exactly one compiled stylesheet", () => {
    const sheets = inlinedStylesheets(bundle);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain("@layer");
  });

  // A constructable stylesheet drops `@import` without an error, and nothing
  // serves the editor a font file.
  it.each(["@import", "@font-face"])("compiled stylesheet → has no %s rule", (rule) => {
    const built = fs
      .readdirSync(DIST)
      .filter((name) => name.endsWith(".js"))
      .flatMap((name) => inlinedStylesheets(fs.readFileSync(path.join(DIST, name), "utf8")));

    expect(built.length).toBeGreaterThanOrEqual(2);
    expect(built.filter((sheet) => sheet.includes(rule))).toEqual([]);
  });

  it("compiled stylesheet → carries the select viewport rules reka-ui would inject as a <style>", () => {
    const [sheet] = inlinedStylesheets(bundle);

    expect(sheet).toContain("[data-reka-select-viewport]{scrollbar-width:none");
    expect(sheet).toContain("[data-reka-select-viewport]::-webkit-scrollbar{display:none}");
  });
});
