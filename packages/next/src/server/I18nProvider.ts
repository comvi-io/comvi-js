import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import type { I18n } from "@comvi/core";
import { handover } from "@comvi/core/ssr";
import { core } from "@comvi/core/internal";
import {
  I18nProvider as ClientProvider,
  type ClientOptions,
  type I18nProviderProps as ClientProviderProps,
} from "../client/I18nProvider";
import type { RoutingConfig } from "../routing/types";

/**
 * The settings of the request's instance that the browser instance must share, handed over as
 * data: `fallbackLocale`, `formats` and the instance's CURRENT `defaultParams`, whose values
 * must be strings, finite numbers, booleans or `null` (anything else, a tag handler included, is a
 * `TypeError` here, naming the param). Nothing else crosses: not the loader, credentials,
 * `onError`, `missing`, `plugins`, `namespaces` (the server's pins), `now`; the locale, the time
 * zone, the clock and the catalogs travel in the payload (`handover()`).
 */
export type ClientSettings = Pick<ClientOptions, "fallbackLocale" | "formats"> & {
  defaultParams?: Readonly<Record<string, string | number | boolean | null>>;
};

const settings = (i18n: I18n): ClientSettings => {
  const c = core(i18n);
  const { fallbackLocale, formats } = c.o;
  const dp = c.s().dp;
  for (const k in dp) {
    const v = dp[k];
    if (v !== null && !["string", "boolean"].includes(typeof v) && !Number.isFinite(v))
      throw TypeError(
        `[@comvi/next] defaultParams.${k} cannot cross to the browser: only strings, finite numbers, booleans and null are handed over (render tag handlers in a Client Component)`,
      );
  }
  return {
    ...(fallbackLocale !== undefined && { fallbackLocale }),
    ...(formats !== undefined && { formats }),
    ...(dp && { defaultParams: dp as ClientSettings["defaultParams"] }),
  };
};

export interface ServerI18nProviderProps {
  /** The request's instance: `getI18n({ locale, ns? })`'s `i18n`. It stays on the server. */
  i18n: I18n;
  /** The routing of `defineRouting()`, for `@comvi/next/navigation`. */
  routing?: RoutingConfig;
  /** `<I18nProvider loading>` of `@comvi/react`: a client render's first paint only. */
  loading?: ReactNode;
  /** `<I18nProvider suspense>` of `@comvi/react`. */
  suspense?: boolean;
  /**
   * The client component to render instead of `@comvi/next/client`'s `<I18nProvider>`: an
   * app's own `"use client"` component that adds what only the browser may have (a client
   * `loader`, `onError`, `plugins`) to the `options` it receives and renders that provider.
   */
  client?: ComponentType<ClientProviderProps>;
  children?: ReactNode;
}

/**
 * The provider of a server boundary (a layout, a page): renders the browser's provider with
 * this request's payload, `handover(i18n)`, and its shared settings (`ClientSettings`). Only
 * data crosses to the browser. A later render of the same boundary (`router.refresh()`) hands
 * a new payload over with the same meaning; nothing remounts.
 *
 * @example
 * ```tsx
 * const { i18n } = await getI18n({ locale });
 * <I18nProvider i18n={i18n} routing={routing}>{children}</I18nProvider>
 * ```
 */
export function I18nProvider({
  i18n,
  routing,
  loading,
  suspense,
  client = ClientProvider,
  children,
}: ServerI18nProviderProps): ReactElement {
  return createElement(
    client,
    {
      payload: handover(i18n),
      options: settings(i18n),
      ...(routing !== undefined && { routing }),
      ...(loading !== undefined && { loading }),
      ...(suspense !== undefined && { suspense }),
    },
    children,
  );
}
