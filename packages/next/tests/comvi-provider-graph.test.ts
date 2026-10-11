// @vitest-environment node
/**
 * The `withComvi` hand-off stays off the client-reachable entries.
 *
 * `fw-next-client-default` and `fw-next-root-composed` must not move: neither
 * `@comvi/next/client` nor the package root may reach the server provider, its
 * client half, the config stub or the `@comvi/next/config` specifier. Source
 * imports are walked statically (relative specifiers followed, bare ones
 * recorded), because importing the modules would load everything eagerly.
 * `/server` is the positive control: the same walk must find all of them there.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { describe, it, expect } from "vitest";
import * as client from "../src/client";
import * as root from "../src/index";
import * as server from "../src/server";

const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "src");
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

/** Every module file and bare specifier reachable from `entry`, through source. */
function graph(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]!;
      if (!spec.startsWith(".")) {
        bare.add(spec);
        continue;
      }
      const base = path.resolve(path.dirname(file), spec);
      const target = [".ts", ".tsx", "/index.ts"].map((ext) => base + ext).find(fs.existsSync);
      if (!target) throw new Error(`${path.relative(SRC, file)}: cannot resolve ${spec}`);
      visit(target);
    }
  };
  visit(path.join(SRC, entry));
  return { files, bare };
}

const NEW_MODULES = ["server/ComviProvider.tsx", "client/ComviClientProvider.tsx", "config.ts"];

const reaches = (entry: string) => {
  const { files, bare } = graph(entry);
  const rel = new Set([...files].map((file) => path.relative(SRC, file).split(path.sep).join("/")));
  return {
    modules: NEW_MODULES.filter((module) => rel.has(module)),
    configSpecifier: bare.has("@comvi/next/config"),
  };
};

describe("the withComvi hand-off is not client-reachable", () => {
  it.each(["client.ts", "index.ts"])("%s reaches none of the new modules", (entry) => {
    expect(reaches(entry)).toEqual({ modules: [], configSpecifier: false });
  });

  it("server.ts reaches the provider pair and the specifier (the walk can see them)", () => {
    // The stub itself is reached only through the bare specifier, which the
    // app's bundler resolves; no source module imports `config.ts` by path.
    expect(reaches("server.ts")).toEqual({
      modules: ["server/ComviProvider.tsx", "client/ComviClientProvider.tsx"],
      configSpecifier: true,
    });
  });
});

describe("entry surfaces", () => {
  it("/server exports ComviProvider; /client and the root do not", () => {
    expect(typeof server.ComviProvider).toBe("function");
    expect(client).not.toHaveProperty("ComviProvider");
    expect(client).not.toHaveProperty("ComviClientProvider");
    expect(root).not.toHaveProperty("ComviProvider");
    expect(root).not.toHaveProperty("ComviClientProvider");
    expect(server).not.toHaveProperty("ComviClientProvider");
  });
});
