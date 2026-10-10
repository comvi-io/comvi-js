/**
 * The package root is a SEPARATE module graph from `./api`, not a tree-shaken
 * view of the full loader.
 *
 * Its weight advantage comes from what it never imports: `cache.ts` (the
 * project-info cache and the legacy export chain), `retry.ts`, `http.ts` (the
 * API URL builders and the response transform) and `options.ts` (the
 * environment-read API/CDN base constants). A tree-shaking assumption cannot
 * carry that guarantee — one runtime `if (apiKey)` is all it takes to lose it —
 * so the guarantee is asserted on the static import graph itself, where a new
 * `import` line breaks it immediately and by name.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const CDN_ENTRY = resolve(SRC, "index.ts");

/** Modules whose contents the CDN path must never carry into a consumer. */
const API_ONLY_MODULES = ["api.ts", "cache.ts", "retry.ts", "http.ts", "options.ts", "loader.ts"];

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * The RUNTIME specifiers of one module: every `import`/`export … from` clause
 * that is not `import type` / `export type`, plus bare side-effect imports.
 * `import { type A, b }` counts — the module is still evaluated for `b`.
 */
export function runtimeSpecifiers(source: string): string[] {
  const code = withoutComments(source);
  const specifiers: string[] = [];
  const fromClause = /(?:^|[\s;}])(import|export)\s+([\s\S]*?)\sfrom\s*["']([^"']+)["']/g;
  for (const [, , clause, specifier] of code.matchAll(fromClause)) {
    if (!/^type[\s{]/.test(clause.trim())) specifiers.push(specifier);
  }
  const bareImport = /(?:^|[\s;}])import\s*["']([^"']+)["']/g;
  for (const [, specifier] of code.matchAll(bareImport)) specifiers.push(specifier);
  return specifiers;
}

/** Every local module reachable from `entry` through runtime imports. */
function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier);
      queue.push(base.endsWith(".ts") ? base : `${base}.ts`);
    }
  }
  return [...seen].map((file) => relative(SRC, file));
}

describe("the @comvi/plugin-fetch-loader root module graph", () => {
  it("reaches its own entry and the shared CDN request path", () => {
    const modules = reachableModules(CDN_ENTRY);

    expect(modules).toEqual(
      expect.arrayContaining(["index.ts", "cdn/loader.ts", "http-core.ts", "cdn-url.ts"]),
    );
  });

  it.each(API_ONLY_MODULES)("never reaches %s", (module) => {
    const modules = reachableModules(CDN_ENTRY);

    expect(modules).not.toContain(module);
  });

  it("carries no API endpoint path in any module it reaches", () => {
    const withApiPath = reachableModules(CDN_ENTRY).filter((module) =>
      readFileSync(resolve(SRC, module), "utf8").includes("/v1/"),
    );

    expect(withApiPath).toEqual([]);
  });
});

describe("runtimeSpecifiers()", () => {
  it.each([
    ["a value import", 'import { a } from "./m";', ["./m"]],
    ["an inline type member", 'import { type A, b } from "./m";', ["./m"]],
    ["a bare side-effect import", 'import "./m";', ["./m"]],
    ["a re-export", 'export { a } from "./m";', ["./m"]],
    ["an erased type import", 'import type { A } from "./m";', []],
    ["an erased type re-export", 'export type { A } from "./m";', []],
    ["a specifier inside a comment", '// import { a } from "./m";', []],
  ])("counts %s", (_case, source, expected) => {
    expect(runtimeSpecifiers(source)).toEqual(expected);
  });
});
