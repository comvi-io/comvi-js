"use client";

import React, { useLayoutEffect, useEffect } from "react";
import { I18nProvider as ReactI18nProvider } from "@comvi/react";

// useLayoutEffect warns when it runs during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import type { I18nProviderProps as ReactI18nProviderProps, MessagesMap } from "@comvi/react";
import type { RoutingConfig } from "../routing/types";
import { RoutingProvider } from "../routing/context";

export type { MessagesMap } from "@comvi/react";

// react's SSR render locale and switch target are omitted: this provider sets
// both from its own `locale` prop, so passing them here would be overridden.
// `messages` is redeclared below with what it means here.
export interface I18nProviderProps extends Omit<
  ReactI18nProviderProps,
  "ssrLocale" | "targetLocale" | "messages"
> {
  /** Locale passed from server (from params.locale) */
  locale: string;

  /**
   * The catalogs the server loaded for `locale`, from `loadMessages()`. The
   * render that receives them already translates in `locale`, and they are
   * in the i18n instance before its locale moves, so the browser never
   * fetches a catalog the server just delivered. A server render reads them
   * without writing the shared i18n instance.
   *
   * @example
   * ```tsx
   * const messages = await loadMessages(locale);
   * <I18nProvider i18n={i18n} locale={locale} messages={messages}>
   * ```
   */
  messages?: MessagesMap;

  /**
   * Routing configuration for locale prefixing and pathnames.
   * Pass the `routing` value returned by createNextI18n().
   */
  routing?: RoutingConfig;
}

/**
 * Reports through `i18n.reportError` on misconfiguration so devs get a
 * meaningful diagnostic instead of a silent fallback.
 *
 * Called in render on the server and from the layout effect in the browser:
 * a `[locale]` segment outside `routing.locales` is a server-side routing
 * mistake, and it should reach `onError` where the server logs are rather than
 * waiting for a browser to hydrate.
 */
function validateLocale(
  i18n: import("@comvi/core").WrapperI18nInstance,
  locale: string,
  routing: RoutingConfig | undefined,
): boolean {
  if (routing && !routing.locales.includes(locale)) {
    i18n.reportError(
      new Error(
        `[@comvi/next] <I18nProvider>: locale "${locale}" is not in routing.locales (${routing.locales.join(", ")}). Skipping locale sync.`,
      ),
      { source: "init", locale },
    );
    return false;
  }
  return true;
}

/**
 * The ONE place `i18n.locale` is assigned. Its one caller is the layout
 * effect, gated on `validateLocale`; effects never run on the server.
 */
function applyLocale(i18n: import("@comvi/core").WrapperI18nInstance, locale: string): void {
  if (i18n.locale !== locale) {
    i18n.locale = locale;
  }
}

/**
 * I18nProvider for Next.js App Router.
 *
 * Syncs the server locale onto the client i18n instance, preventing hydration
 * mismatches. Translations should be pre-loaded in the instance via the
 * `messages` option in `createI18n()`.
 *
 * Render it from a `"use client"` wrapper that imports the instance itself:
 * Next.js cannot pass a class instance from a Server Component to a Client
 * Component, so a layout may not hand `i18n` across the RSC boundary.
 *
 * @example
 * ```tsx
 * // app/[locale]/ComviProvider.tsx
 * "use client";
 *
 * import { I18nProvider } from '@comvi/next/client';
 * import type { MessagesMap } from '@comvi/next/client';
 * import { i18n } from '@/i18n/config';
 *
 * export function ComviProvider({
 *   children,
 *   locale,
 *   messages,
 * }: {
 *   children: React.ReactNode;
 *   locale: string;
 *   messages?: MessagesMap;
 * }) {
 *   return (
 *     <I18nProvider i18n={i18n} locale={locale} messages={messages}>
 *       {children}
 *     </I18nProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // app/[locale]/layout.tsx — a Server Component; no i18n import here
 * import { ComviProvider } from './ComviProvider';
 *
 * export default async function LocaleLayout({
 *   children,
 *   params,
 * }: {
 *   children: React.ReactNode;
 *   params: Promise<{ locale: string }>;
 * }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <html lang={locale}>
 *       <body>
 *         <ComviProvider locale={locale}>{children}</ComviProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function I18nProvider({
  children,
  i18n,
  locale,
  messages,
  autoInit = true,
  routing,
  ...props
}: I18nProviderProps) {
  // Nothing here writes the i18n instance during render. The App Router
  // instance lives at module scope and is shared by every concurrent request
  // in the server process, and a client render React abandons must leave it
  // as it was. The request's locale and catalog reach the tree through the
  // React provider instead: `ssrLocale` and `targetLocale` render in `locale`,
  // `messages` translate before the i18n instance holds them.
  //
  // A locale outside `routing.locales` is reported, never applied and never
  // rendered in: the tree stays in the i18n instance's locale on the server
  // and on the client alike. The report runs in render on the server only, so
  // a misrouted segment reaches `onError` where the server logs are; the
  // browser reports it from the layout effect.
  const routed = !routing || routing.locales.includes(locale);
  if (typeof window === "undefined") validateLocale(i18n, locale, routing);

  // The one locale write, at commit, on the first mount and on every new
  // `locale` (client navigation, HMR). The React provider's layout effect is a
  // child's, so it has added `messages` first: the guarded `setLocale` the
  // write starts finds the catalog cached and loads nothing.
  useIsomorphicLayoutEffect(() => {
    if (validateLocale(i18n, locale, routing)) {
      applyLocale(i18n, locale);
    }
  }, [i18n, locale, routing]);

  // `autoInit` runs the React provider's `ensureInitialized` → `i18n.init()`,
  // which loads the default namespace at the i18n instance's configured
  // locale: the static default from `createNextI18n()`, since no render writes
  // it.
  const content = (
    <ReactI18nProvider
      i18n={i18n}
      autoInit={autoInit}
      ssrLocale={routed ? locale : i18n.locale}
      targetLocale={routed ? locale : undefined}
      messages={messages}
      ssrInitialIsLoading={false}
      ssrInitialIsInitializing={false}
      {...props}
    >
      {children}
    </ReactI18nProvider>
  );

  return routing ? (
    <RoutingProvider routing={routing} locale={locale}>
      {content}
    </RoutingProvider>
  ) : (
    content
  );
}

I18nProvider.displayName = "I18nProvider";
