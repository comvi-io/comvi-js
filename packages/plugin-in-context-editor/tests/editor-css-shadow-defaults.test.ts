import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";

// The editor UI lives in a shadow root, where `@property` rules do not apply.
// Tailwind gives its `--tw-*` variables their defaults through `@property` and
// keeps the plain fallback behind an `@supports` test that modern browsers
// fail, so without our own fallback `border` has no style (invisible checkbox
// boxes and textarea borders) and rings have no shadow.

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(pkgDir, "src");

const STYLE_ENTRIES: Record<string, string> = {
  tailwindcss: join(pkgDir, "node_modules/tailwindcss/index.css"),
  "tw-animate-css": join(pkgDir, "node_modules/tw-animate-css/dist/tw-animate.css"),
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(vue|ts)$/.test(name) ? [path] : [];
  });
}

async function buildEditorCss(): Promise<string> {
  const compiler = await compile(readFileSync(join(srcDir, "assets/index.css"), "utf8"), {
    base: join(srcDir, "assets"),
    async loadStylesheet(id, base) {
      const path = STYLE_ENTRIES[id] ?? resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  const candidates = new Set(
    sourceFiles(srcDir).flatMap((file) => readFileSync(file, "utf8").split(/[\s"'`]+/)),
  );
  return compiler.build([...candidates]);
}

/** Drops every `@supports` block, braces matched. */
function withoutSupportsBlocks(css: string): string {
  let out = css;
  for (let start = out.indexOf("@supports"); start !== -1; start = out.indexOf("@supports")) {
    let depth = 0;
    let end = out.indexOf("{", start);
    for (; end < out.length; end++) {
      if (out[end] === "{") depth++;
      else if (out[end] === "}" && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(end + 1);
  }
  return out;
}

describe("editor CSS in a shadow root", () => {
  it("gives every registered --tw-* property its default without @property or @supports", async () => {
    const css = await buildEditorCss();

    const registered = [...css.matchAll(/@property (--tw-[\w-]+)\s*\{([^}]*)\}/g)].map(
      ([, name, body]) => ({
        name: name!,
        initial: /initial-value:\s*([^;]+);?/.exec(body!)?.[1]?.trim() ?? "initial",
      }),
    );
    expect(registered.map((p) => p.name)).toContain("--tw-border-style");

    const unconditional = withoutSupportsBlocks(css).replace(/@property [\w-]+\s*\{[^}]*\}/g, "");
    const universalBodies = [
      ...unconditional.matchAll(/(?:^|[;{}])\s*\*,\s*::?before,\s*::?after[^{]*\{([^}]*)\}/g),
    ]
      .map(([, body]) => body)
      .join(";");
    const defaults = new Map(
      [...universalBodies.matchAll(/(--tw-[\w-]+)\s*:\s*([^;]+)/g)].map(([, name, value]) => [
        name!,
        value!.trim(),
      ]),
    );

    const missing = registered
      .filter(({ name, initial }) => defaults.get(name) !== initial)
      .map(({ name, initial }) => `${name}: ${initial} (got ${defaults.get(name) ?? "nothing"})`);
    expect(missing).toEqual([]);
  });
});
