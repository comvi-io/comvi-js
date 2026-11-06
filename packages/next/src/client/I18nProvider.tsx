"use client";

import { createElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  createI18n,
  I18nHandover,
  I18nProvider as Provider,
  type Catalog,
  type I18nOptions,
  type ProviderCatalogs,
} from "@comvi/react";
import type { Handover } from "@comvi/core/ssr";
import { RoutingProvider } from "../routing/context";
import type { RoutingConfig } from "../routing/types";

/**
 * The browser instance's options; the payload gives the locale, the time zone, the server's
 * clock and the catalogs. `fallbackLocale` must be the server's. A `loader` is optional: it
 * loads only what no payload brought (a lazy widget), and a function crosses no RSC
 * boundary, so pass one from a `"use client"` module.
 */
export type ClientOptions = Omit<I18nOptions, "locale" | "catalogs" | "serverNow" | "timeZone">;

export interface I18nProviderProps {
  /** `handover(i18n)` of the request's instance (`@comvi/core/ssr`). */
  payload: Handover;
  options?: ClientOptions;
  /** The routing of `defineRouting()`, for `@comvi/next/navigation`. */
  routing?: RoutingConfig;
  /** `<I18nProvider loading>` of `@comvi/react`: a client render's first paint only. */
  loading?: ReactNode;
  /** `<I18nProvider suspense>` of `@comvi/react`. */
  suspense?: boolean;
  children?: ReactNode;
}

/** A prototype-free map: any name (`__proto__`, `constructor`) is an own key of it. */
const map = <T,>(): Record<string, T> => Object.create(null);

/**
 * The payload's catalogs without its failed (`null`) slots, the shape `<I18nHandover>` takes.
 * Own keys only, into prototype-free maps: a namespace or locale named `__proto__` or
 * `constructor` is a slot like any other, never `Object.prototype`.
 */
const present = (catalogs: Handover["catalogs"]): ProviderCatalogs => {
  const out = map<Record<string, Catalog>>();
  for (const n of Object.keys(catalogs))
    for (const l of Object.keys(catalogs[n]))
      if (catalogs[n][l]) (out[n] ||= map())[l] = catalogs[n][l]!;
  return out;
};

/**
 * The browser side of a server boundary: renders a Server Component's payload for its Client
 * Components.
 *
 * Order: data → instance → gate → content. The instance is created ONCE per mount from
 * `{ ...options, ...payload }` — a slot that failed on the server stays failed (`null`), so
 * nothing is asked for again until an explicit retry — then `<I18nProvider>` of
 * `@comvi/react` gates and renders. A later payload of the same mount (`router.refresh()`, a
 * layout rendered again, another locale) reaches the instance through `<I18nHandover>`: its
 * subtree renders with it at once, the instance takes it at commit. A page that needs more
 * namespaces than its layout renders its own `<I18nProvider payload>`.
 *
 * @example
 * ```tsx
 * // app/[locale]/layout.tsx (a Server Component)
 * const { i18n } = await getI18n({ locale });
 * <I18nProvider payload={handover(i18n)} options={options} routing={routing}>
 *   {children}
 * </I18nProvider>
 * ```
 */
export function I18nProvider({
  payload,
  options,
  routing,
  loading,
  suspense,
  children,
}: I18nProviderProps): ReactElement {
  const [i18n] = useState(() => createI18n({ ...options, ...payload }));
  const catalogs = useMemo(() => present(payload.catalogs), [payload.catalogs]);
  const tree = createElement(
    Provider,
    { i18n, loading, suspense },
    createElement(I18nHandover, { catalogs, locale: payload.locale }, children),
  );
  return routing
    ? createElement(RoutingProvider, { routing, locale: payload.locale, children: tree })
    : tree;
}
