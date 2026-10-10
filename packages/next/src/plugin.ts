/**
 * `@comvi/next/plugin`: the next.config plugin. Node only — next.config
 * imports it, and nothing here reaches a bundle.
 *
 * `withComvi({ config })` points the internal specifier `@comvi/next/config`
 * at the app's own composition module, under webpack and Turbopack alike. The
 * server helpers and the server `ComviProvider` read the instance from there,
 * so the app needs no `setI18n()` module and no client wrapper of its own.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

export interface WithComviOptions {
  /**
   * Path to the module that exports `i18n` (required) and `routing`
   * (optional). A relative path resolves against `process.cwd()`, and Next
   * does not chdir: run `next` from the app directory, or pass an absolute
   * path, for example
   * `fileURLToPath(new URL("./src/i18n/config.ts", import.meta.url))`.
   *
   * The module is evaluated in the server and in the client build, so it must
   * be client-safe: a loader that needs server-only code stays on the manual
   * setup (`createNextI18nFromInstance` plus your own client provider).
   * @example "./src/i18n/config.ts"
   */
  config: string;
}

/** The function form of next.config: Next calls it with the phase, sync or async. */
export type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

/** What `withComvi(options)` returns: it keeps the shape of the config it wraps. */
export interface WithComvi {
  (nextConfig?: NextConfig): NextConfig;
  (nextConfig: NextConfigFn): NextConfigFn;
}

const SPECIFIER = "@comvi/next/config";

type WebpackHook = NonNullable<NextConfig["webpack"]>;
type WebpackConfig = { resolve?: { alias?: Record<string, unknown> | unknown[] } };
type TurbopackOptions = { resolveAlias?: Record<string, unknown> };

/**
 * Turbopack options moved from `experimental.turbo` to the top-level
 * `turbopack` key in Next 15.3. Read from the app's own `next`, so the key
 * matches the Next that loads this config; an unreadable version gets the
 * current key.
 */
function usesTopLevelTurbopack(root: string): boolean {
  let version: string;
  try {
    const require = createRequire(path.join(root, "package.json"));
    const manifest = require.resolve("next/package.json");
    version = (JSON.parse(fs.readFileSync(manifest, "utf8")) as { version: string }).version;
  } catch {
    return true;
  }
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  return major > 15 || (major === 15 && minor >= 3);
}

/**
 * Point `@comvi/next/config` at the app's config module.
 *
 * Fails at next.config load, with the resolved path, when the module does not
 * exist. Keeps the app's own `webpack` function, its aliases and every other
 * option.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withComvi } from "@comvi/next/plugin";
 *
 * export default withComvi({ config: "./src/i18n/config.ts" })({});
 * ```
 */
export function withComvi(options: WithComviOptions): WithComvi {
  const root = process.cwd();
  // Accept Windows separators on every platform: Turbopack wants a posix path.
  const absolute = path.resolve(root, options.config.replace(/\\/g, "/"));
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `[@comvi/next] withComvi: the config module ${absolute} does not exist ` +
        `(config: "${options.config}", resolved against ${root}). ` +
        "A relative path resolves against process.cwd(), and Next does not chdir: run `next` " +
        "from the app directory or pass an absolute path, e.g. " +
        "path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src/i18n/config.ts'). " +
        "It is imported by the server and the client build, so it must be client-safe: " +
        "a loader that needs server-only code stays on the manual setup " +
        "(createNextI18nFromInstance plus your own client provider).",
    );
  }
  // The two bundlers get the same file through different spellings: webpack
  // takes the absolute path, Turbopack a posix path relative to `root`
  // (process.cwd()); it rejects absolute Windows paths and resolves relative
  // ones from the project root. When cwd is not the app directory the two
  // diverge: webpack still finds the module, Turbopack resolves the stub.
  const relative = `./${path.relative(root, absolute).split(path.sep).join("/")}`;
  const turbopackAlias = { [SPECIFIER]: relative };
  const topLevel = usesTopLevelTurbopack(root);

  const apply = (nextConfig: NextConfig): NextConfig => {
    const userWebpack = nextConfig.webpack;
    const arrayAlias = { name: SPECIFIER, alias: absolute, onlyModule: true };
    const addAlias = (webpackConfig: WebpackConfig): WebpackConfig => {
      const resolve = (webpackConfig.resolve ??= {});
      if (Array.isArray(resolve.alias)) {
        // One shared entry, so a hook that keeps the array does not get it twice.
        if (!resolve.alias.includes(arrayAlias)) resolve.alias.push(arrayAlias);
      } else {
        // `$`: an exact match, so no other `@comvi/next/*` specifier is caught.
        resolve.alias = { ...resolve.alias, [`${SPECIFIER}$`]: absolute };
      }
      return webpackConfig;
    };
    // Before the user's hook so it sees the alias, and again on what it
    // returns: a fresh object or a replaced `resolve.alias` would drop it.
    const webpack: WebpackHook = (webpackConfig: WebpackConfig, context) =>
      addAlias(userWebpack ? userWebpack(addAlias(webpackConfig), context) : webpackConfig);

    if (topLevel) {
      const turbopack = (nextConfig.turbopack ?? {}) as TurbopackOptions;
      return {
        ...nextConfig,
        webpack,
        turbopack: {
          ...turbopack,
          resolveAlias: { ...turbopack.resolveAlias, ...turbopackAlias },
        } as NextConfig["turbopack"],
      };
    }
    const experimental = (nextConfig.experimental ?? {}) as { turbo?: TurbopackOptions };
    return {
      ...nextConfig,
      webpack,
      experimental: {
        ...experimental,
        turbo: {
          ...experimental.turbo,
          resolveAlias: { ...experimental.turbo?.resolveAlias, ...turbopackAlias },
        },
      } as NextConfig["experimental"],
    };
  };

  function wrap(nextConfig?: NextConfig): NextConfig;
  function wrap(nextConfig: NextConfigFn): NextConfigFn;
  function wrap(nextConfig: NextConfig | NextConfigFn = {}): NextConfig | NextConfigFn {
    if (typeof nextConfig === "function") {
      return async (phase, context) => apply(await nextConfig(phase, context));
    }
    return apply(nextConfig);
  }
  return wrap;
}
