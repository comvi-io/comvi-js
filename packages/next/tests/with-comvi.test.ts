// @vitest-environment node
/**
 * `withComvi({ config })`, the next.config plugin that points
 * `@comvi/next/config` at the app's own composition module.
 *
 * Every test runs against a throwaway project directory: a real
 * `node_modules/next/package.json` (its version picks the Turbopack key) and a
 * real config file (a missing one must fail at next.config load).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextConfig } from "next";
import { withComvi } from "../src/plugin";

const roots: string[] = [];

/** A project root with next@`version` installed and `src/i18n/config.ts` present. */
function project(version: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "with-comvi-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app","private":true}');
  fs.mkdirSync(path.join(root, "node_modules/next"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "node_modules/next/package.json"),
    JSON.stringify({ name: "next", version }),
  );
  fs.mkdirSync(path.join(root, "src/i18n"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/i18n/config.ts"), "export const i18n = {};\n");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  return root;
}

type WebpackFn = NonNullable<NextConfig["webpack"]>;
type WebpackConfig = { resolve?: { alias?: Record<string, unknown> | unknown[] } };

/** Run the composed `webpack` hook on a minimal webpack config. */
const runWebpack = (config: NextConfig, webpackConfig: WebpackConfig = { resolve: {} }) =>
  (config.webpack as WebpackFn)(webpackConfig, {} as never) as WebpackConfig;

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("withComvi: webpack", () => {
  it("adds an exact-match alias to the absolute config path", () => {
    const root = project("16.0.0");
    const config = withComvi({ config: "./src/i18n/config.ts" })({});
    const result = runWebpack(config, { resolve: { alias: { existing: "/x" } } });
    expect(result.resolve!.alias).toEqual({
      existing: "/x",
      "@comvi/next/config$": path.join(root, "src/i18n/config.ts"),
    });
  });

  it("chains the user's own webpack function and keeps what it returns", () => {
    project("16.0.0");
    const user = vi.fn((config: WebpackConfig) => ({ ...config, marker: true }));
    const config = withComvi({ config: "./src/i18n/config.ts" })({ webpack: user as never });
    const result = runWebpack(config) as WebpackConfig & { marker?: boolean };
    expect(user).toHaveBeenCalledTimes(1);
    expect(result.marker).toBe(true);
    expect(result.resolve!.alias).toHaveProperty(["@comvi/next/config$"]);
  });

  it("keeps the rest of next.config", () => {
    project("16.0.0");
    const config = withComvi({ config: "./src/i18n/config.ts" })({ reactStrictMode: true });
    expect(config.reactStrictMode).toBe(true);
  });
});

describe("withComvi: Turbopack", () => {
  it.each([
    ["15.3.0", "turbopack"],
    ["15.5.9", "turbopack"],
    ["16.0.0", "turbopack"],
    ["15.3.0-canary.1", "turbopack"],
    ["15.2.4", "experimental.turbo"],
    ["15.0.0", "experimental.turbo"],
  ])("next@%s → %s.resolveAlias", (version, key) => {
    project(version);
    const config = withComvi({ config: "./src/i18n/config.ts" })({});
    const expected = { resolveAlias: { "@comvi/next/config": "./src/i18n/config.ts" } };
    if (key === "turbopack") {
      expect(config.turbopack).toEqual(expected);
      expect(config.experimental).toBeUndefined();
    } else {
      expect((config.experimental as { turbo?: unknown }).turbo).toEqual(expected);
      expect(config.turbopack).toBeUndefined();
    }
  });

  it("keeps existing aliases and Turbopack options", () => {
    project("16.0.0");
    const config = withComvi({ config: "./src/i18n/config.ts" })({
      turbopack: { resolveAlias: { underscore: "lodash" }, resolveExtensions: [".ts"] },
    });
    expect(config.turbopack).toEqual({
      resolveAlias: { underscore: "lodash", "@comvi/next/config": "./src/i18n/config.ts" },
      resolveExtensions: [".ts"],
    });
  });

  it("keeps existing experimental options below 15.3", () => {
    project("15.2.0");
    const config = withComvi({ config: "./src/i18n/config.ts" })({
      experimental: { turbo: { resolveAlias: { underscore: "lodash" } }, typedRoutes: true },
    } as NextConfig);
    expect(config.experimental).toEqual({
      typedRoutes: true,
      turbo: {
        resolveAlias: { underscore: "lodash", "@comvi/next/config": "./src/i18n/config.ts" },
      },
    });
  });

  it.each([["src/i18n/config.ts"], [".\\src\\i18n\\config.ts"], ["src\\i18n\\config.ts"]])(
    "a project-relative posix path from %j",
    (input) => {
      project("16.0.0");
      const config = withComvi({ config: input })({});
      expect(config.turbopack!.resolveAlias).toEqual({
        "@comvi/next/config": "./src/i18n/config.ts",
      });
    },
  );
});

describe("withComvi: a missing config module", () => {
  it("throws at next.config load, naming the resolved path", () => {
    const root = project("16.0.0");
    expect(() => withComvi({ config: "./src/i18n/missing.ts" })).toThrow(
      `[comvi/next] withComvi: the config module ${path.join(root, "src/i18n/missing.ts")} does not exist`,
    );
  });

  it("says where a relative path resolves from, and how to pass an absolute one", () => {
    project("16.0.0");
    expect(() => withComvi({ config: "./src/i18n/missing.ts" })).toThrow(
      "A relative path resolves from the directory `next` runs in; in a monorepo pass an " +
        "absolute one, e.g. path.resolve(import.meta.dirname, './src/i18n/config.ts').",
    );
  });

  it("says a config with server-only loaders stays on the manual setup", () => {
    project("16.0.0");
    expect(() => withComvi({ config: "./src/i18n/missing.ts" })).toThrow(
      "It is imported by the server and the client build, so it must be client-safe: " +
        "a loader that needs server-only code stays on the manual setup " +
        "(createNextI18nFromHost plus your own client provider).",
    );
  });
});

describe("withComvi: the config path", () => {
  it("accepts an absolute path, and still aliases Turbopack project-relative", () => {
    const root = project("16.0.0");
    const absolute = path.join(root, "src/i18n/config.ts");
    const config = withComvi({ config: absolute })({});
    expect(config.turbopack!.resolveAlias).toEqual({
      "@comvi/next/config": "./src/i18n/config.ts",
    });
    expect(runWebpack(config).resolve!.alias).toEqual({ "@comvi/next/config$": absolute });
  });
});

describe("withComvi: next.config as a function", () => {
  type ConfigFn = (phase: string, ctx: { defaultConfig: NextConfig }) => Promise<NextConfig>;
  const CTX = { defaultConfig: {} as NextConfig };

  it("an object stays an object", () => {
    project("16.0.0");
    const config = withComvi({ config: "./src/i18n/config.ts" })({ reactStrictMode: true });
    expect(typeof config).toBe("object");
    expect(config.reactStrictMode).toBe(true);
  });

  it("a sync function becomes a function that applies the alias to its result", async () => {
    project("16.0.0");
    const user = vi.fn((phase: string) => ({ distDir: `out-${phase}` }) as NextConfig);
    const wrapped = withComvi({ config: "./src/i18n/config.ts" })(user) as unknown as ConfigFn;
    expect(typeof wrapped).toBe("function");
    const config = await wrapped("phase-production-build", CTX);
    expect(user).toHaveBeenCalledWith("phase-production-build", CTX);
    expect(config.distDir).toBe("out-phase-production-build");
    expect(config.turbopack!.resolveAlias).toEqual({
      "@comvi/next/config": "./src/i18n/config.ts",
    });
    expect(runWebpack(config).resolve!.alias).toHaveProperty(["@comvi/next/config$"]);
  });

  it("an async function is awaited", async () => {
    project("16.0.0");
    const user = async () => ({ basePath: "/docs" }) as NextConfig;
    const wrapped = withComvi({ config: "./src/i18n/config.ts" })(user) as unknown as ConfigFn;
    const config = await wrapped("phase-development-server", CTX);
    expect(config.basePath).toBe("/docs");
    expect(config.turbopack!.resolveAlias).toHaveProperty(["@comvi/next/config"]);
  });
});
