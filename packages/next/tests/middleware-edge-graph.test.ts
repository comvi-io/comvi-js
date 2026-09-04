// @vitest-environment node
/**
 * Edge safety is structural, not conditional.
 *
 * `middleware.ts` runs in the Edge runtime, which has no Node builtins and no
 * place for the request pipeline's module-scope host. Nothing guards that at
 * runtime: the guarantee is the entry split — `@comvi/next/middleware` reaches
 * only `./middleware/createMiddleware` and the routing helpers, and nothing
 * under `src/server/` is in that graph.
 *
 * A graph is the only honest way to assert it. Reading the entry file would
 * miss an import three modules deep, which is exactly the import that would
 * break an app in production and not in any unit test.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, it, expect } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `node:`-prefixed and bare forms of the builtins the Edge runtime does not have. */
const NODE_BUILTIN =
  /^(?:node:|(?:assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|worker_threads|zlib)(?:\/|$))/;

type Entry = Pick<esbuild.BuildOptions, "entryPoints" | "stdin">;

interface Graph {
  /** Every module the entry pulls in, as paths relative to the package root. */
  modules: string[];
  /** Every specifier left unbundled — where a Node builtin would show up. */
  externals: string[];
}

/**
 * Bundles an entry the way a Next build does and reports its module graph.
 *
 * Only what the Edge runtime itself supplies is marked external; `@comvi/*` is
 * followed into its own files, so a builtin one package deep is still visible.
 */
const graphOf = async (entry: Entry): Promise<Graph> => {
  const { metafile } = await esbuild.build({
    ...entry,
    absWorkingDir: packageRoot,
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    external: ["next", "next/*", "react", "react-dom", "react-dom/*"],
  });

  const inputs = Object.values(metafile.inputs);
  return {
    modules: Object.keys(metafile.inputs).sort(),
    externals: [
      ...new Set(
        inputs.flatMap((input) => input.imports.filter((i) => i.external).map((i) => i.path)),
      ),
    ].sort(),
  };
};

const MIDDLEWARE: Entry = { entryPoints: ["src/middleware.ts"] };

describe("@comvi/next/middleware stays an Edge-safe entry", () => {
  it("pulls in no module under src/server/", async () => {
    const { modules } = await graphOf(MIDDLEWARE);

    expect(modules.filter((m) => m.startsWith("src/server/"))).toEqual([]);
  });

  it("pulls in exactly the middleware and routing modules, and no others", async () => {
    const { modules } = await graphOf(MIDDLEWARE);

    expect(modules.filter((m) => m.startsWith("src/"))).toEqual([
      "src/middleware.ts",
      "src/middleware/createMiddleware.ts",
      "src/routing/defineRouting.ts",
      "src/routing/utils.ts",
    ]);
  });

  it("pulls in no Node builtin, at any depth", async () => {
    const { externals } = await graphOf(MIDDLEWARE);

    expect(externals.filter((specifier) => NODE_BUILTIN.test(specifier))).toEqual([]);
  });

  it("control: the same probe reports src/server modules for the server entry", async () => {
    const { modules } = await graphOf({ entryPoints: ["src/server.ts"] });

    expect(modules).toContain("src/server/getI18n.ts");
  });

  it("control: the same probe reports a Node builtin when the graph has one", async () => {
    const { externals } = await graphOf({
      stdin: {
        contents: 'import "node:buffer";\nexport {};',
        resolveDir: packageRoot,
        loader: "ts",
      },
    });

    expect(externals.filter((specifier) => NODE_BUILTIN.test(specifier))).toEqual(["node:buffer"]);
  });
});
