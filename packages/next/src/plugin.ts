/**
 * `@comvi/next/plugin`: the next.config plugin. Node only — next.config
 * imports it, and nothing here reaches a bundle.
 *
 * `withComvi({ types })` writes the typed-translations declaration from the
 * app's JSON catalogs while the config loads (`./pluginTypes`).
 */
import type { NextConfig } from "next";
import { runTypes, validateTypes, type WithComviTypes } from "./pluginTypes";

export type { WithComviTypes } from "./pluginTypes";

/** The options of `withComvi`. */
export interface WithComviOptions {
  /**
   * Writes the typed-translations declaration from the app's JSON catalogs: on
   * `next dev` (and on every change), once on `next build`. The same bytes as
   * `comvi typegen --from`. With it, `withComvi(...)` always returns the function
   * form of next.config: Next passes the phase only to that form. It generates once per
   * `next build` process: two builds are two commands; a second build started inside the
   * same Node process reuses the first one's result and is not supported.
   * @example { from: "./src/locales", sourceLocale: "en" }
   */
  types?: WithComviTypes;
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

/** What `withComvi({ types })` returns: always the function form, which gets the phase. */
export type WithComviAndTypes = (nextConfig?: NextConfig | NextConfigFn) => NextConfigFn;

/**
 * What `withComvi(options)` returns when the type of `options` does not say whether `types` is
 * there (a `WithComviOptions` value): the function form with `types`, else the config's shape.
 */
export type WithComviMaybeTypes = (
  nextConfig?: NextConfig | NextConfigFn,
) => NextConfig | NextConfigFn;

/**
 * Wrap the app's next.config. It wraps an object or a function config and keeps every
 * option of it.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withComvi } from "@comvi/next/plugin";
 *
 * export default withComvi()({});
 * ```
 */
export function withComvi(options: WithComviOptions & { types: WithComviTypes }): WithComviAndTypes;
export function withComvi(options?: WithComviOptions & { types?: undefined }): WithComvi;
export function withComvi(options: WithComviOptions | undefined): WithComviMaybeTypes;
export function withComvi(
  options: WithComviOptions = {},
): WithComvi | WithComviAndTypes | WithComviMaybeTypes {
  const root = process.cwd();
  const { types } = options;
  if (types) validateTypes(types);
  const apply = (nextConfig: NextConfig): NextConfig => nextConfig;

  function wrap(nextConfig?: NextConfig): NextConfig;
  function wrap(nextConfig: NextConfigFn): NextConfigFn;
  function wrap(nextConfig: NextConfig | NextConfigFn = {}): NextConfig | NextConfigFn {
    if (types) {
      return async (phase, context) => {
        await runTypes(phase, types, root);
        return apply(
          typeof nextConfig === "function" ? await nextConfig(phase, context) : nextConfig,
        );
      };
    }
    if (typeof nextConfig === "function") {
      return async (phase, context) => apply(await nextConfig(phase, context));
    }
    return apply(nextConfig);
  }
  return wrap;
}
