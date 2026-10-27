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
 * OPTIONS without `Access-Control-Allow-Headers`), ONE timeout that also covers the body,
 * a check that the body is a catalog object, no retries. Deduplication, cancellation and
 * failure reporting are the instance's (core). `root` is the platform's literal
 * `default`, not the instance's default namespace.
 */
import type { Catalog } from "./compile/cache";
import type { Loader } from "./instance";

export interface CdnOptions {
  /** The namespace published at `<base>/<locale>.json`. Default `"default"` (the platform's). */
  root?: string;
  /** Milliseconds for the whole request, body included. Default 10 000. */
  timeout?: number;
  /** Next.js fetch cache options, passed through as `fetch(url, { next })`. */
  next?: { revalidate?: number | false; tags?: string[] };
}

const ID = /^[\w\-@.]+$/;
const ok = (s: string) => s && s != "." && s != ".." && ID.test(s);

/** A loader that reads CDN v1 under `base`. */
export const cdn = (
  base: string,
  { root = "default", timeout = 1e4, next }: CdnOptions = {},
): Loader => {
  base = base.replace(/\/$/, "");
  return async (l, n, signal) => {
    if (!ok(l) || !ok(n)) throw Error(`[@comvi/core/cdn] invalid locale or namespace: ${l}/${n}`);
    const url = base + (n == root ? "" : "/" + n) + "/" + l + ".json";
    const c = new AbortController();
    const stop = () => c.abort();
    const tm = setTimeout(
      () => c.abort(Error(`[@comvi/core/cdn] timeout ${timeout} ms: ${url}`)),
      timeout,
    );
    if (signal && signal.aborted) stop();
    else if (signal) signal.addEventListener("abort", stop);
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: c.signal,
        next,
      } as RequestInit);
      if (!r.ok) throw Error(`[@comvi/core/cdn] HTTP ${r.status}: ${url}`);
      const d = await r.json();
      if (!d || typeof d != "object" || Array.isArray(d))
        throw Error(`[@comvi/core/cdn] not a catalog: ${url}`);
      return d as Catalog;
    } catch (e) {
      // A timeout surfaces as its own error; a caller's abort as the AbortError fetch threw.
      throw c.signal.aborted && !(signal && signal.aborted) ? c.signal.reason : e;
    } finally {
      clearTimeout(tm);
      if (signal) signal.removeEventListener("abort", stop);
    }
  };
};

/**
 * Bundled catalogs behind a loader, for when the CDN cannot answer: keys are
 * `"<locale>:<ns>"`, or `"<locale>"` for the root namespace (the 0.7 `fallback` map of
 * `cdnLoader`). Never used for an aborted load.
 *
 * ```ts
 * loader: withFallback(cdn(base), { "de:shop": () => import("./locales/shop/de.json") })
 * ```
 */
export const withFallback =
  (
    load: Loader,
    map: Readonly<
      Record<string, () => Catalog | { default: Catalog } | Promise<Catalog | { default: Catalog }>>
    >,
    root = "default",
  ): Loader =>
  (l, n, signal) =>
    load(l, n, signal).catch(async (e) => {
      const f = !(signal && signal.aborted) && (map[l + ":" + n] || (n == root && map[l]));
      if (!f) throw e;
      const m = await f();
      return ((m as { default?: Catalog }).default || m) as Catalog;
    });
