import type { FetchLoaderOptions } from "../options";

/**
 * The CDN subset of {@link FetchLoaderOptions}.
 *
 * `baseUrl`, `apiBaseUrl` and `retry` are absent because they only describe the
 * API request path, which this entry does not contain: naming one is a compile
 * error here instead of a setting that silently does nothing.
 *
 * Every member is documented on `FetchLoaderOptions`; the two types are kept in
 * lock-step by construction rather than by hand.
 */
export type CdnLoaderOptions = Pick<
  FetchLoaderOptions,
  | "cdnUrl"
  | "cdnLayout"
  | "fallback"
  | "onLoadError"
  | "onLoadSuccess"
  | "timeout"
  | "loadOnInit"
  | "cache"
>;
