"use client";

import { createElement, useState, type ReactElement, type ReactNode } from "react";
import {
  createI18n,
  I18nHandover,
  I18nProvider as Provider,
  type HandoverParams,
  type I18nOptions,
} from "@comvi/react";
import { plain } from "@comvi/core/internal";
import type { Handover } from "@comvi/core/ssr";
import { RoutingProvider } from "../routing/context";
import type { RoutingConfig } from "../routing/types";

/**
 * The browser instance's options; the payload gives the locale, the time zone, the server's
 * clock and the catalogs. `fallbackLocale` must be the server's. A `loader` is optional: it
 * loads only what no payload brought (a lazy widget), and a function crosses no RSC
 * boundary, so pass one from a `"use client"` module.
 */
export type ClientOptions = Omit<
  I18nOptions,
  "locale" | "catalogs" | "serverNow" | "timeZone" | "defaultParams"
> & {
  /**
   * The server's `defaultParams` (the server `<I18nProvider>` passes them): strings, finite
   * numbers, booleans and `null` only — anything else is a `TypeError` naming the key. Each
   * payload's set replaces the browser's whole set. A tag handler goes with the translation's
   * params (`t(key, { link })`) or `components` (`<T>`), not here.
   */
  defaultParams?: HandoverParams;
};

/** The set when the server hands none: one object, so a rerender with the same payload is a no-op. */
const none = {};

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

/**
 * The browser side of a server boundary: renders a Server Component's payload for its Client
 * Components.
 *
 * Order: data → instance → gate → content. The instance is created ONCE per mount from
 * `{ ...options, ...payload }` — a slot that failed on the server stays failed (`null`), so
 * nothing is asked for again until an explicit retry — then `<I18nProvider>` of
 * `@comvi/react` gates and renders. A later payload of the same mount (`router.refresh()`, a
 * layout rendered again, another locale) reaches the instance through `<I18nHandover>` with the
 * same meaning, `null` slots included: its subtree renders with it at once (a slot that failed
 * now renders the server's fallback), the instance takes it at commit, nothing remounts. A page
 * that needs more namespaces than its layout renders its own `<I18nProvider payload>`.
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
  const dp = plain(options?.defaultParams || none, "[@comvi/next]");
  const [i18n] = useState(() => createI18n({ ...options, ...payload }));
  const tree = createElement(
    Provider,
    { i18n, loading, suspense },
    // The server's `defaultParams` travel with its catalogs: one snapshot per payload (`{}`: none).
    createElement(
      I18nHandover,
      {
        catalogs: payload.catalogs,
        locale: payload.locale,
        defaultParams: dp,
      },
      children,
    ),
  );
  return routing
    ? createElement(RoutingProvider, { routing, locale: payload.locale, children: tree })
    : tree;
}
