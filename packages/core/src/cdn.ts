/**
 * @comvi/core/cdn — the loader for the Comvi CDN, layout v1 UNCHANGED (design R3-7,
 * R4-10; lot-0 spike S5): the platform publishes flat ICU catalogs at
 *
 *   <base>/<locale>.json        the platform's root namespace, `default`
 *   <base>/<ns>/<locale>.json   every other namespace
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { cdn } from "@comvi/core/cdn";
 *
 * const i18n = createI18n({ locale: "en", loader: cdn("https://cdn.comvi.io/<distribution>") });
 * ```
 *
 * URLs are those of `@comvi/plugin-fetch-loader`'s `buildCdnUrl` (parity test): the same
 * identifier check (`[\w\-@.]`, no `.`/`..` segment), one trailing slash stripped. The
 * locale is the app's spelling — never `canonicalize()`'s (`iw` stays `iw`). One request
 * per call with `Accept: application/json` only (CORS-safelisted: the worker answers
 * OPTIONS without `Access-Control-Allow-Headers`), ONE timeout that also covers the body
 * (the whole request races it, so a body that never settles cannot hang the load), a
 * check that the body is a catalog object, no retries. Deduplication, cancellation and
 * failure reporting are the instance's (core). `root` is the platform's literal
 * `default`, not the instance's default namespace; `root: false` puts every namespace in
 * its own folder.
 *
 * `fallback` (design R3-12): bundled catalogs for when the CDN cannot answer — a network
 * error, a non-2xx status, a body that is not a catalog or the timeout; never an abort.
 * Keys are `"<locale>"` (the root namespace) or `"<locale>:<ns>"`, values functions, so a
 * dynamic `import()` keeps the files out of the main bundle:
 *
 * ```ts
 * cdn(base, { fallback: { de: () => import("./locales/de.json"), "de:shop": () => import("./locales/shop/de.json") } })
 * ```
 */

import type { Catalog } from "./compile/cache";
import { N } from "./state";
import type { Loader } from "./instance";

/** What a `fallback` entry returns: a catalog, or a JSON module (`{ default: catalog }`). */
export type CdnFallback = () =>
  Catalog | { default: Catalog } | Promise<Catalog | { default: Catalog }>;

export interface CdnOptions {
  /**
   * The namespace published at `<base>/<locale>.json`. Default `"default"` (the
   * platform's); `false`: every namespace at `<base>/<ns>/<locale>.json`.
   */
  root?: string | false;
  /** Milliseconds for the whole request, body included. Default 10 000. */
  timeout?: number;
  /** Next.js fetch cache options, passed through as `fetch(url, { next })`. */
  next?: { revalidate?: number | false; tags?: string[] };
  /** Bundled catalogs by `"<locale>"` (root namespace) or `"<locale>:<ns>"`, for when the CDN cannot answer. */
  fallback?: Readonly<Record<string, CdnFallback>>;
}

/** A locale or namespace identifier: `[\w\-@.]`, never `.` or `..`. */
const ID = /^(?!\.\.?$)[\w\-@.]+$/;

/** A loader that reads CDN v1 under `base`. */
export const cdn = (
  base: string,
  { root = "default", timeout = 1e4, next, fallback }: CdnOptions = {},
): Loader => {
  base = base.replace(/\/$/, "");
  // An own, prototype-free copy: a locale never reaches `Object.prototype` members.
  const fb: Record<string, CdnFallback> = N<CdnFallback>(fallback);
  return async (l, n, signal) => {
    if (!ID.test(l) || !ID.test(n))
      throw Error(`[@comvi/core/cdn] invalid locale or namespace: ${l}/${n}`);
    const url = base + (n === root ? "" : "/" + n) + "/" + l + ".json";
    const c = new AbortController();
    const stop = () => c.abort();
    const tm = setTimeout(
      () => c.abort(Error(`[@comvi/core/cdn] timeout ${timeout} ms: ${url}`)),
      timeout,
    );
    if (signal && signal.aborted) stop();
    else if (signal) signal.addEventListener("abort", stop);
    try {
      return await Promise.race([
        fetch(url, {
          headers: { Accept: "application/json" },
          signal: c.signal,
          next,
        } as RequestInit).then(async (r) => {
          if (!r.ok) throw Error(`[@comvi/core/cdn] HTTP ${r.status}: ${url}`);
          const d = await r.json();
          if (!d || typeof d != "object" || Array.isArray(d))
            throw Error(`[@comvi/core/cdn] not a catalog: ${url}`);
          return d as Catalog;
        }),
        // Settles the load on abort or timeout even when the body never does.
        new Promise<never>((_, no) =>
          c.signal.addEventListener("abort", () => no(c.signal.reason)),
        ),
      ]);
    } catch (e) {
      if (signal && signal.aborted) throw e;
      const f = fb[l + ":" + n] || (n === root && fb[l]);
      if (f) {
        const m = await f();
        return (m as { default?: Catalog }).default || (m as Catalog);
      }
      // A timeout surfaces as its own error.
      throw c.signal.aborted ? c.signal.reason : e;
    } finally {
      clearTimeout(tm);
      if (signal) signal.removeEventListener("abort", stop);
    }
  };
};
