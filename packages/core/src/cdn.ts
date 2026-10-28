/**
 * @comvi/core/cdn — the loaders for the Comvi CDN and the Comvi API, and the catalog store.
 *
 * `cdn(base)` reads the CDN layout v1 UNCHANGED (design R3-7, R4-10; lot-0 spike S5): the
 * platform publishes flat ICU catalogs at
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
 * URLs are those of 0.7's `buildCdnUrl` (parity test): the same identifier check
 * (`[\w\-@.]`, no `.`/`..` segment), one trailing slash stripped. The locale is the app's
 * spelling — never `canonicalize()`'s (`iw` stays `iw`). One request per URL with
 * `Accept: application/json` only (CORS-safelisted: the worker answers OPTIONS without
 * `Access-Control-Allow-Headers`), ONE timeout that also covers the body (the load settles
 * on it, so a body that never settles cannot hang the load), a check that the body is a
 * catalog object, no retries. `root` is the platform's literal `default`, not the
 * instance's default namespace; `root: false` puts every namespace in its own folder.
 *
 * `api(base, { key })` reads the same catalogs from the platform API with a project API
 * key (`GET <base>/v1/translations?locales=<l>&namespaces=<ns>`, `Authorization: Bearer`):
 * a server, a script or a development setup — a key in a browser bundle is readable by
 * anyone. Only the body's OWN properties are read (`namespaces[ns][locale]`), and a body
 * without the pair (the platform leaves out unknown locales) fails with its own message.
 * In a store, an `api()` loader's catalogs are kept under the SHA-256 of its key (a
 * counter per loader where Web Crypto is missing), never the key: no store, and no map
 * of one, holds the credential, and two keys behind one URL never share a catalog.
 *
 * A signal that is already aborted is refused before any request, with or without a store.
 *
 * Without a `store` every load is its own request, and the caller's abort cancels it: the
 * instance already deduplicates its loads per (locale, namespace), and the browser's HTTP
 * cache revalidates (`max-age=30, must-revalidate`; R4-10). With a {@link CatalogStore}
 * (`createCatalogStore()`, design §2.3 item 6, R4-13) — the SSR case: ONE store per server
 * process, an instance per request — the loaders keep what they fetched, per URL: the
 * catalog, its ETag and when it was fetched.
 *
 * - Concurrent requests for a URL share ONE fetch; a caller that aborts stops waiting (its
 *   instance's flight settles on the signal) without cancelling it — the timeout is the
 *   fetch's own.
 * - A catalog younger than `ttl` (default 60 s) is answered from the store without a
 *   request. An older one is answered at once too, while ONE revalidation runs behind it
 *   (stale-while-revalidate, R4-13b): a conditional GET with `If-None-Match` when the
 *   response had an ETag the code can read. A 304 keeps the SAME catalog object, so its
 *   compiled messages (the compile cache is keyed by catalog identity) survive the
 *   revalidation; a 200 replaces it. A failure keeps the last good catalog
 *   (stale-on-error, R4-13c); a 304 and a failure both count as fetched now, so the next
 *   revalidation waits another `ttl`.
 * - A failed fetch with nothing stored is not remembered (its entry is removed): the next
 *   request fetches again (the instance remembers its failed pairs itself).
 * - Every instance gets the catalog BY REFERENCE: catalogs are immutable once attached.
 *
 * A store has no module-wide default (a deviation from design §2.3 item 6, pending the
 * owner's word): a default costs about 165 B min+gz (size row `core-icu-cdn-store`) in
 * every bundle that loads from the CDN, over the R3-13 ceiling, so a server says which
 * process-level store its requests share (lots 6 and 7: the SSR bindings create it). In a
 * browser the CDN's ETag is not exposed cross-origin (the worker sends no
 * `Access-Control-Expose-Headers`), so a store there never sends `If-None-Match` and no
 * request leaves the CORS-safelisted set.
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

/**
 * What one fetch brought: the catalog and the response (a 304 rejects, as any non-2xx).
 * @internal The loaders' seam with a store; not for application code.
 */
export type Fetched = [catalog: Catalog, response: Response];

/**
 * Where `cdn()` and `api()` keep the catalogs they fetched (see the module comment).
 * Opaque: make one with {@link createCatalogStore} and pass it as the `store` option.
 */
export interface CatalogStore {
  /**
   * The catalog under `key` — stored, or fetched by `load` (given the headers of a
   * conditional request when revalidating).
   * @internal The loaders' seam; not for application code. The key is a URL (with an
   * `api()` key's hash); a custom store sees no credential.
   */
  g(
    key: string,
    load: (headers: Record<string, string>) => Promise<Fetched>,
  ): Catalog | Promise<Catalog>;
}

export interface CatalogStoreOptions {
  /** Milliseconds a catalog is answered without revalidation. Default 60 000. */
  ttl?: number;
}

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
  /** The `fetch` to call (a keep-alive agent on a server, a test double). Default: the global one. */
  fetch?: typeof fetch;
  /** A store to share fetches and keep catalogs in (a server: one per process). Default: none. */
  store?: CatalogStore;
}

export interface ApiOptions {
  /** A project API key with read access to translations. Never put it in a browser bundle. */
  key: string;
  /** Milliseconds for the whole request, body included. Default 10 000. */
  timeout?: number;
  /** The `fetch` to call. Default: the global one. */
  fetch?: typeof fetch;
  /** A store to share fetches and keep catalogs in. Default: none. */
  store?: CatalogStore;
}

const P = "[@comvi/core/cdn] ";

/** A store: see the module comment. */
export const createCatalogStore = ({ ttl = 6e4 }: CatalogStoreOptions = {}): CatalogStore => {
  /** Per key: catalog, its ETag, when it was fetched, the fetch in flight. */
  const m = new Map<
    string,
    { c?: Catalog; e?: string | null; t: number; p?: Promise<Catalog> | 0 }
  >();
  return {
    g(k, load, e = m.get(k) || { t: 0 }) {
      m.set(k, e);
      // One fetch in flight per key; a catalog younger than `ttl` needs none. The ETag is
      // stored only with a catalog, so a 304 always has one to keep.
      if (!e.p && !(e.c && Date.now() - e.t < ttl))
        e.p = load(e.e ? { "If-None-Match": e.e } : {})
          .then(
            ([c, r]) => ((e.e = r.headers.get("etag")), c),
            // A 304 (not ok: the loaders throw on it) and a failure keep the stored object
            // — and its compiled messages — for another `ttl`; with none stored it fails
            // and the key is forgotten (a failed URL is not kept for the life of the store).
            (x) => e.c || Promise.reject((m.delete(k), x)),
          )
          .then((c) => ((e.t = Date.now()), (e.p = 0), (e.c = c)));
      // A stored catalog is answered at once, even while it is revalidated.
      return (e.c || e.p) as Catalog | Promise<Catalog>;
    },
  };
};

/** A locale or namespace identifier: `[\w\-@.]`, never `.` or `..`. */
const ID = /^(?!\.\.?$)[\w\-@.]+$/;

/**
 * The loader of `cdn()` and `api()`: `url(locale, ns, root)` is what to fetch.
 */
const mk = (
  url: (l: string, n: string, root: string | false) => string,
  { root = "default", timeout = 1e4, next, fallback, fetch: f, store }: CdnOptions,
): Loader => {
  // An own, prototype-free copy: a locale never reaches `Object.prototype` members.
  const fb = N<CdnFallback>(fallback);
  return async (l, n, signal) => {
    if (!ID.test(l) || !ID.test(n)) throw Error(P + `invalid locale or namespace: ${l}/${n}`);
    // Tolerates a direct call without a signal (outside the Loader contract). A signal that
    // is already aborted is refused before any request.
    if (signal?.aborted) throw signal.reason;
    const u = url(l, n, root);
    /**
     * One request, with its own timeout for the whole of it, body included. Without a
     * store the caller's abort cancels it; with one it is shared, so no caller's abort
     * reaches it (the instance stops waiting by itself: its flight settles on the signal).
     */
    const load = (x: Record<string, string>, s?: AbortSignal) =>
      new Promise<Fetched>((y, no) => {
        const c = new AbortController();
        const tm = setTimeout(() => c.abort(Error(P + `timeout ${timeout} ms: ${u}`)), timeout);
        // Settles on the timeout or the abort even when the body never does. A caller's abort
        // leaves the timer armed while a transport that never settles hangs (bytes): it fires
        // once, on an aborted controller, and does nothing.
        c.signal.onabort = () => no(c.signal.reason);
        // The caller's abort rejects with an AbortError (as `fetch` does). The listener is
        // not removed (bytes): it holds one closure per load until the signal is collected —
        // the instance's signals are per flight; a long-lived signal passed by hand keeps one
        // per load it was passed to.
        s?.addEventListener("abort", () => c.abort());
        // An async IIFE that settles the load itself, not `fetch().then()`: one microtask
        // fewer per step, so a body that has settled wins over an abort that lands right
        // after (tests/cdn/loader).
        (async () => {
          const r = await (f || fetch)(u, {
            headers: { Accept: "application/json", ...x },
            signal: c.signal,
            next,
          } as RequestInit);
          if (!r.ok) throw Error(P + `HTTP ${r.status}: ${u}`);
          const d = (await r.json()) as Catalog;
          if (!d || typeof d != "object" || Array.isArray(d))
            throw Error(P + `not a catalog: ${u}`);
          y([d, r]);
        })()
          .catch(no)
          .finally(() => clearTimeout(tm));
      });
    try {
      return store ? await store.g(u, load) : (await load({}, signal))[0];
    } catch (e) {
      if (signal?.aborted) throw e;
      const x = fb[l + ":" + n] || (n === root && fb[l]);
      if (!x) throw e;
      const m = (await x()) as Catalog | { default: Catalog };
      // A module namespace (`import("./de.json")`) — but a catalog may have a key `default`.
      return m.default && typeof m.default == "object" ? m.default : (m as Catalog);
    }
  };
};

/** A loader that reads CDN v1 under `base`. */
export const cdn = (base: string, o: CdnOptions = {}): Loader =>
  mk((l, n, root) => base.replace(/\/$/, "") + (n === root ? "" : "/" + n) + "/" + l + ".json", o);

/** `o[k]` when it is `o`'s own property: an id never reaches `Object.prototype` members. */
const own = (o: unknown, k: string): any =>
  o && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined;

/** Partitions of loaders whose key cannot be hashed (no Web Crypto): one per loader. */
let ids = 0;

/** A loader that reads the platform API under `base` (e.g. `https://api.comvi.io`) with a project API key. */
export const api = (base: string, o: ApiOptions): Loader => {
  const s = o.store;
  // The store partition of this key: its SHA-256, never the key itself, so neither a store
  // nor its map holds the credential; two keys behind one URL never share a catalog.
  const part = (async () => {
    try {
      return [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(o.key))),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return "#" + ++ids;
    }
  })();
  return mk((l, n) => `${base.replace(/\/$/, "")}/v1/translations?locales=${l}&namespaces=${n}`, {
    ...o,
    // The body is `{ locales, namespaces: { [ns]: { [locale]: catalog } } }`: the
    // response's `json()` answers the requested catalog, and refuses a body without it.
    async fetch(u, i) {
      const r = await (o.fetch || fetch)(u, {
        ...i,
        headers: { ...(i!.headers as Record<string, string>), Authorization: "Bearer " + o.key },
      });
      const q = new URL(u as string, "http://_").searchParams;
      const l = q.get("locales")!;
      const n = q.get("namespaces")!;
      return {
        ok: r.ok,
        status: r.status,
        headers: r.headers,
        async json() {
          const c = own(own(await r.json(), "namespaces"), n);
          if (!own(c, l)) throw Error(P + `${l}/${n} is not in the response: ${u}`);
          return c[l];
        },
      } as Response;
    },
    store: s && { g: (k, load) => part.then((p) => s.g(k + "\0" + p, load)) },
  });
};
