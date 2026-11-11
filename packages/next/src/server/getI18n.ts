import { cache, createElement, Fragment } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createI18n, type I18n, type I18nOptions } from "@comvi/core";
import { core, plain } from "@comvi/core/internal";
import type { HandoverParams, UseI18n } from "@comvi/react";

/** Set by the middleware on the requests it handles (`createMiddleware`). */
const LOCALE_HEADER = "x-comvi-locale";

/** A signal no server load is ever aborted through: nothing switches a server instance. */
const KEEP = /* @__PURE__ */ new AbortController().signal;

/** Rich parts → one React node (a Fragment), as `@comvi/react` joins them. */
const node = (r: any): any => (r.map ? createElement(Fragment, null, ...r) : r);

/**
 * What the server and every request share: plain configuration, never request state. Spread
 * the routing in (`{ ...routing, ... }`): `locales` and `defaultLocale` are what a request's
 * locale is matched against.
 */
export interface NextI18nOptions extends Omit<
  I18nOptions,
  "locale" | "catalogs" | "serverNow" | "plugins" | "timeZone" | "defaultParams"
> {
  /**
   * Defaults every request's `t()` reads, handed to the browser as they are: strings, finite
   * numbers, booleans and `null` only (anything else is a `TypeError` naming the key). A tag
   * handler goes with the translation's params (`t(key, { link })`) or `components` (`<T>`).
   */
  defaultParams?: HandoverParams;
  /** The supported locales; any other one is `notFound()`. */
  locales: readonly string[];
  /** The locale of a request that names none (no `locale`, no middleware header). */
  defaultLocale: string;
  /**
   * Required: the server and the browser format dates in this zone, so the hydration
   * renders what the server rendered.
   */
  timeZone: string;
}

export interface GetI18nOptions<NS extends string = "default"> {
  /**
   * The request's locale, typically the `[locale]` route param. Matched against `locales`
   * first: any other is `notFound()`. Given, no request API is read, so a static page stays
   * static and the result does not depend on a layout having run first. Absent: the
   * middleware's `x-comvi-locale` header (a dynamic read), else `defaultLocale`.
   */
  locale?: string;
  /**
   * The namespaces this render needs, loaded before the call resolves (with the `namespaces`
   * option's). `t` is bound to the first one (default: `default`).
   */
  ns?: NS | readonly [NS, ...string[]];
}

/** What `getI18n()` gives a Server Component, Route Handler or Server Action. */
export interface ServerI18n<NS extends string = "default"> {
  /**
   * `t()` bound to the first `ns` (the `default` namespace without one); a rich message returns
   * one React node.
   */
  t: UseI18n<NS>["t"];
  locale: string;
  dir: "ltr" | "rtl";
  /** This request's instance: `handover(i18n)` from `@comvi/core/ssr` is its payload. */
  i18n: I18n;
}

export type GetI18n = <NS extends string = "default">(
  options?: GetI18nOptions<NS>,
) => Promise<ServerI18n<NS>>;

/**
 * The server helper of an app: call it once, in a server-only module, and export what it
 * returns.
 *
 * Every call of the returned `getI18n` within one request and one locale, with the same set
 * of namespaces, gets the same instance (React `cache()`); no instance is shared between
 * requests. Instances of one request share one load per (locale, namespace): a pair loads
 * once, and a pair that failed stays failed for the rest of the request (`null` in its
 * `handover()`, the fallback rendered). Loading, fallback and failure are the core's own.
 *
 * @example
 * ```ts
 * // src/i18n/server.ts
 * import { createGetI18n } from "@comvi/next/server";
 * import { options, routing } from "./routing";
 *
 * export const getI18n = createGetI18n({
 *   ...routing,
 *   ...options,
 *   timeZone: "UTC",
 *   loader: async (locale, ns) => (await import(`../locales/${ns}/${locale}.json`)).default,
 * });
 * ```
 */
export function createGetI18n(options: NextI18nOptions): GetI18n {
  const { locales, defaultLocale, loader, ...rest } = options;
  if (rest.defaultParams) plain(rest.defaultParams, "[@comvi/next]");
  /** One load per (request, locale, namespace), shared by the request's instances. */
  const fetch = cache((locale: string, ns: string) => loader!(locale, ns, KEEP));
  /** One instance per (request, locale, namespace set), its namespaces loaded. */
  const instance = cache((locale: string, nss: string): Promise<I18n> => {
    const i18n = createI18n({
      ...rest,
      locale,
      namespaces: [...new Set([...(rest.namespaces || ["default"]), ...nss.split("\0")])].filter(
        Boolean,
      ),
      loader: loader && ((l, n) => fetch(l, n)),
    });
    return i18n.ready.then(() => i18n);
  });
  const requested = async (): Promise<string> => {
    const h = (await headers()).get(LOCALE_HEADER);
    return h && locales.includes(h) ? h : defaultLocale;
  };

  return (async (o: GetI18nOptions<string> = {}) => {
    const locale = o.locale ?? (await requested());
    // Before any instance exists: an unsupported locale renders nothing.
    if (!locales.includes(locale)) notFound();
    const list: string[] = o.ns === undefined ? [] : typeof o.ns == "string" ? [o.ns] : [...o.ns];
    const i18n = await instance(locale, [...new Set(list)].sort().join("\0"));
    const n = list[0] || "default";
    const x = core(i18n);
    return {
      i18n,
      locale: i18n.locale,
      dir: i18n.dir,
      t: ((key: string, params?: Record<string, unknown>) =>
        node(x.tr(x.s(), key, params as never, n, node))) as never,
    };
  }) as GetI18n;
}
