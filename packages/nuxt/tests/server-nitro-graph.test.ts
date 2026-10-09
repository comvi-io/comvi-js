/**
 * The Nitro half of the module, as a module graph.
 *
 * Everything under `src/runtime/server/` is bundled by NITRO, a separate build
 * from the Vue app's. Nuxt's `impound` plugin refuses the Vue app's aliases
 * there (`#app`, `#build/*`, `#components`): one such import anywhere in the
 * graph of a file an app's `server/` route uses fails that app's `nuxt build`
 * with "Vue app aliases are not allowed in server runtime". The server
 * utilities imported two `#build/*` templates until the module registered them
 * as Nitro virtual modules (`#comvi/*`), so no app with a Nitro route that
 * called `useTranslation(event)` could build.
 *
 * The end-to-end proof is `test-apps/nuxt4/server/api/translate.get.ts`, a real
 * route in a real build. This file is the same claim, cheap enough to run on
 * every commit.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../src");
const SERVER_DIR = join(SRC, "runtime/server");

const IMPORT =
  /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : path.endsWith(".ts") ? [path] : [];
  });

/** Every specifier reachable from `entry` through relative imports, with the file that wrote it. */
function reachableSpecifiers(entry: string): Array<{ specifier: string; from: string }> {
  const seen = new Set<string>();
  const found: Array<{ specifier: string; from: string }> = [];
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2]!;
      found.push({ specifier, from: relative(SRC, file) });
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier);
      const target = [`${base}.ts`, join(base, "index.ts")].find((path) => existsSync(path));
      if (target) visit(target);
    }
  };
  visit(entry);
  return found;
}

describe("the Nitro graph of src/runtime/server", () => {
  const entries = listFiles(SERVER_DIR);

  it("walks the server utilities, their internals and the server plugin", () => {
    expect(entries.map((file) => relative(SERVER_DIR, file)).sort()).toEqual([
      "internal/request-hosts.ts",
      "plugins/request-cleanup.ts",
      "utils/loadMessages.ts",
      "utils/request-i18n.ts",
      "utils/runtime-config.ts",
      "utils/useTranslation.ts",
    ]);
  });

  it.each(entries.map((file) => [relative(SRC, file), file] as const))(
    "%s reaches no Vue app alias (#app, #build/*, #components)",
    (_name, file) => {
      const refused = reachableSpecifiers(file).filter(({ specifier }) =>
        /^#(?:app|build|components)(?:\/|$)/.test(specifier),
      );

      expect(refused).toEqual([]);
    },
  );

  it("the server utilities reach the generated modules by their Nitro names", () => {
    const specifiers = entries
      .flatMap((file) => reachableSpecifiers(file))
      .map(({ specifier }) => specifier)
      .filter((specifier) => specifier.startsWith("#"));

    expect([...new Set(specifiers)].sort()).toEqual([
      "#comvi/detection",
      "#comvi/i18n",
      "#comvi/setup",
      "#imports",
    ]);
  });
});
