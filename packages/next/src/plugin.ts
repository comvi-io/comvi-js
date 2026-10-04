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
   * (optional), relative to the project root. The module is evaluated in the
   * server and in the client build, so it must be client-safe: a loader that
   * needs server-only code stays on the manual setup (`createNextI18nFromHost`
   * plus your own client provider).
   * @example "./src/i18n/config.ts"
   */
  config: string;
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
export function withComvi(options: WithComviOptions): (nextConfig?: NextConfig) => NextConfig {
  const root = process.cwd();
  // Accept Windows separators on every platform: Turbopack wants a posix path.
  const absolute = path.resolve(root, options.config.replace(/\\/g, "/"));
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `[comvi/next] withComvi: the config module ${absolute} does not exist ` +
        `(config: "${options.config}", resolved against ${root}).`,
    );
  }
  // Project-relative and posix: Turbopack rejects absolute Windows paths.
  const relative = `./${path.relative(root, absolute).split(path.sep).join("/")}`;
  const turbopackAlias = { [SPECIFIER]: relative };
  const topLevel = usesTopLevelTurbopack(root);

  return (nextConfig: NextConfig = {}): NextConfig => {
    const userWebpack = nextConfig.webpack;
    const webpack: WebpackHook = (webpackConfig: WebpackConfig, context) => {
      const resolve = (webpackConfig.resolve ??= {});
      if (Array.isArray(resolve.alias)) {
        resolve.alias.push({ name: SPECIFIER, alias: absolute, onlyModule: true });
      } else {
        // `$`: an exact match, so no other `@comvi/next/*` specifier is caught.
        resolve.alias = { ...resolve.alias, [`${SPECIFIER}$`]: absolute };
      }
      return userWebpack ? userWebpack(webpackConfig, context) : webpackConfig;
    };

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
}
