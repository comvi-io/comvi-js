"use client";

import React, { useLayoutEffect, useEffect, useRef, useState } from "react";
import { I18nProvider as ReactI18nProvider } from "@comvi/react";

// useLayoutEffect warns when it runs during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import type { I18nProviderProps as ReactI18nProviderProps } from "@comvi/react";
import type { TranslationValue } from "@comvi/core";
import type { RoutingConfig } from "../routing/types";
import { RoutingProvider } from "../routing/context";

/**
 * Translations result keyed by "locale:namespace"
 */
export type MessagesMap = Record<string, Record<string, TranslationValue>>;

// Both spellings of react's SSR render locale are omitted: this provider sets
// it from its own `locale` prop, so either one passed here would be silently
// overridden.
export interface I18nProviderProps extends Omit<
  ReactI18nProviderProps,
  "ssrInitialLocale" | "ssrLocale"
> {
  /** Locale passed from server (from params.locale) */
  locale: string;

  /**
   * Pre-loaded messages from loadTranslations().
   * These will be added to the i18n cache on mount.
   *
   * @example
   * ```tsx
   * const messages = await loadTranslations(locale);
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
 * Deliberately NOT behind the `typeof window` guard the assignment sits behind:
 * a `[locale]` segment outside `routing.locales` is a server-side routing
 * mistake, and it should reach `onError` where the server logs are rather than
 * waiting for a browser to hydrate.
 */
function validateLocale(
  i18n: import("@comvi/core").WrapperI18nHost,
  locale: string,
  routing: RoutingConfig | undefined,
): boolean {
  if (routing && !routing.locales.includes(locale)) {
    i18n.reportError(
      new Error(
        `[next-i18n-provider] Locale "${locale}" is not in routing.locales (${routing.locales.join(", ")}). Skipping locale sync.`,
      ),
      { source: "init", locale },
    );
    return false;
  }
  return true;
}

/**
 * The ONE place `i18n.locale` is assigned. Callers gate it on
 * `validateLocale` and on being off the server — see the call sites.
 */
function applyLocale(i18n: import("@comvi/core").WrapperI18nHost, locale: string): void {
  if (i18n.locale !== locale) {
    i18n.locale = locale;
  }
}

/**
 * I18nProvider for Next.js App Router.
 *
 * Syncs the server locale onto the client i18n instance, preventing hydration
 * mismatches. Translations should be pre-loaded in the instance via the
 * `translation` option in `createI18n()`.
 *
 * Render it from a `"use client"` wrapper that imports the instance itself:
 * Next.js cannot pass a class instance from a Server Component to a Client
 * Component, so a layout may not hand `i18n` across the RSC boundary.
 *
 * @example
 * ```tsx
 * // app/[locale]/I18nClientProvider.tsx
 * "use client";
 *
 * import { I18nProvider } from '@comvi/next/client';
 * import type { MessagesMap } from '@comvi/next/client';
 * import { i18n } from '@/i18n/config';
 *
 * export function I18nClientProvider({
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
 * import { I18nClientProvider } from './I18nClientProvider';
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
 *         <I18nClientProvider locale={locale}>{children}</I18nClientProvider>
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
  // By-identity guard so StrictMode double-mount and stable-prop re-renders
  // don't re-apply the same messages object.
  const lastAddedMessagesRef = useRef<MessagesMap | undefined>(undefined);

  // Sync locale + messages before the first commit.
  useState(() => {
    // Validation runs on both sides so a misrouted locale is still reported
    // during SSR; only the WRITE is client-only. The App Router host lives at
    // module scope and is shared by every concurrent request in the server
    // process, so writing its locale during a server render leaks one
    // request's locale into another's tree. The request locale reaches the
    // tree through `ssrLocale` below.
    if (validateLocale(i18n, locale, routing) && typeof window !== "undefined") {
      applyLocale(i18n, locale);
    }
    // `addTranslations` stays on the server: it is additive and keyed
    // `locale:namespace`, so a concurrent request can only write what the other
    // would have loaded anyway, and after the first add per key it is a no-op
    // for the cache and for `getActiveNamespaces()`. The first add does emit
    // `namespaceLoaded` — accepted.
    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }
    return null;
  });

  // Subsequent renders (client navigation, HMR, prop updates). Effects never
  // run during a server render, so no guard is needed here.
  useIsomorphicLayoutEffect(() => {
    if (validateLocale(i18n, locale, routing)) {
      applyLocale(i18n, locale);
    }

    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }
  }, [i18n, locale, messages, routing]);

  // `autoInit` runs the React provider's `ensureInitialized` → `i18n.init()`,
  // which loads the default namespace at the HOST's configured locale. Since
  // the server render no longer writes that locale, it is now always the static
  // default from `createNextI18n()` rather than whichever request rendered
  // first, so the first-request race is gone by construction.
  const content = (
    <ReactI18nProvider
      i18n={i18n}
      autoInit={autoInit}
      ssrLocale={locale}
      ssrInitialIsLoading={false}
      ssrInitialIsInitializing={false}
      {...props}
    >
      {children}
    </ReactI18nProvider>
  );

  return routing ? <RoutingProvider routing={routing}>{content}</RoutingProvider> : content;
}

I18nProvider.displayName = "I18nProvider";
