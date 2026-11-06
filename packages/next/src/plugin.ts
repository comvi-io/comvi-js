/**
 * `@comvi/next/plugin`: the next.config plugin. Node only — next.config
 * imports it, and nothing here reaches a bundle.
 */
import type { NextConfig } from "next";

/** The options of `withComvi`. */
export interface WithComviOptions {}

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
export function withComvi(_options: WithComviOptions = {}): WithComvi {
  const apply = (nextConfig: NextConfig): NextConfig => nextConfig;

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
