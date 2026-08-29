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

export interface I18nProviderProps extends Omit<ReactI18nProviderProps, "ssrInitialLocale"> {
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
 */
function syncLocaleSafely(
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
  if (i18n.locale !== locale) {
    i18n.locale = locale;
  }
  return true;
}

/**
 * I18nProvider for Next.js App Router.
 *
 * Syncs the server locale onto the client i18n instance, preventing hydration
 * mismatches. Translations should be pre-loaded in the instance via the
 * `translation` option in `createI18n()`.
 *
 * @example
 * ```tsx
 * // app/[locale]/layout.tsx
 * import { I18nProvider } from '@comvi/next/client';
 * import { i18n } from '@/i18n';
 *
 * export default async function LocaleLayout({
 *   children,
 *   params
 * }: {
 *   children: React.ReactNode;
 *   params: Promise<{ locale: string }>;
 * }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <html lang={locale}>
 *       <body>
 *         <I18nProvider i18n={i18n} locale={locale}>
 *           {children}
 *         </I18nProvider>
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

  // Sync locale + messages before the first commit, on both server and client.
  useState(() => {
    syncLocaleSafely(i18n, locale, routing);
    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }
    return null;
  });

  // Subsequent renders (client navigation, HMR, prop updates).
  useIsomorphicLayoutEffect(() => {
    syncLocaleSafely(i18n, locale, routing);

    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }
  }, [i18n, locale, messages, routing]);

  const content = (
    <ReactI18nProvider
      i18n={i18n}
      autoInit={autoInit}
      ssrInitialLocale={locale}
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
